import type { FileChange } from '../snapshot/diff.js';
import { diffIndexes } from '../snapshot/diff.js';
import { DEFAULT_SCAN_OPTIONS, scanTree, type ScanOptions, type SnapshotIndex } from '../snapshot/scan.js';
import { ContentStore } from '../store/cas.js';
import { SessionStore } from '../session/store.js';
import type { AgentName, OutsideAccess, RecordedChange } from '../session/events.js';
import { scoreCommand, scorePathAction } from '../risk/scorer.js';
import { outsideFromCommand, outsideFromToolPath } from '../risk/outside.js';
import { redactString } from '../util/redaction.js';
import { buildReceipt, writeReceipt } from '../receipt/build.js';

/** Agent-neutral description of one hook firing. Adapters translate agent payloads into this. */
export type HookCall =
  | Readonly<{ kind: 'session_start'; sessionId: string; cwd: string; transcriptPath?: string; source?: string }>
  | Readonly<{ kind: 'pre_tool'; sessionId: string; cwd: string; transcriptPath?: string; toolUseId: string; tool: ToolDescription }>
  | Readonly<{ kind: 'post_tool'; sessionId: string; cwd: string; transcriptPath?: string; toolUseId: string; tool: ToolDescription; ok: boolean }>
  | Readonly<{ kind: 'turn_end'; sessionId: string; cwd: string; transcriptPath?: string }>
  | Readonly<{ kind: 'session_end'; sessionId: string; cwd: string; transcriptPath?: string; reason?: string }>;

export type ToolDescription = Readonly<{
  name: string;
  /** Mutating tools get pre/post filesystem scans. */
  mutating: boolean;
  command?: string;
  path?: string;
}>;

export class Recorder {
  private readonly store: ContentStore;

  constructor(
    private readonly dataHome: string,
    private readonly agent: AgentName,
    private readonly scanOptions: ScanOptions = DEFAULT_SCAN_OPTIONS,
  ) {
    this.store = new ContentStore(dataHome);
  }

  handle(call: HookCall): void {
    const session = new SessionStore(this.dataHome, this.agent, call.sessionId);

    if (call.kind === 'post_tool' && !call.tool.mutating) {
      // Read-like tools: only interesting when they reach outside the project.
      if (!session.exists()) return;
      session.withLock(() => {
        const root = session.meta().root;
        const outside = outsideFromToolPath(root, call.cwd, call.tool.path);
        if (outside.length === 0) return;
        session.append({
          type: 'tool_call', at: now(), toolUseId: call.toolUseId, tool: call.tool.name,
          summary: summarize(call.tool, root), ok: call.ok, changes: [], concurrentWith: [], preObserved: false,
          outside, risk: scorePathAction(outside[0]?.path ?? '', { outsideRoot: true }), scanned: false,
        });
        session.touch();
      });
      return;
    }
    if (call.kind === 'pre_tool' && !call.tool.mutating) return;

    session.withLock(() => {
      const { root, freshBaseline } = this.ensureSession(session, call);
      const previous = session.index() as SnapshotIndex;

      switch (call.kind) {
        case 'session_start': {
          // A resumed session: anything that changed while the agent was away is unattributed.
          if (!freshBaseline) this.recordUnattributed(session, previous);
          return;
        }
        case 'pre_tool': {
          this.recordUnattributed(session, previous);
          session.addPending({ toolUseId: call.toolUseId, tool: call.tool.name, startedAt: now() });
          return;
        }
        case 'post_tool': {
          const next = scanTree(root, this.store, previous, this.scanOptions);
          const changes = diffIndexes(previous, next);
          const pending = session.removePending(call.toolUseId);
          const concurrentWith = session.pending().map((p) => p.toolUseId).filter((id) => id !== call.toolUseId);
          const outside = [
            ...outsideFromToolPath(root, call.cwd, call.tool.path),
            ...(call.tool.command !== undefined ? outsideFromCommand(root, call.cwd, call.tool.command) : []),
          ];
          const deletedCount = changes.filter((c) => c.kind === 'deleted').length;
          const risk = call.tool.command !== undefined
            ? scoreCommand(call.tool.command, { outsideRoot: outside.length > 0, deletedCount })
            : scorePathAction(call.tool.path ?? '', { outsideRoot: outside.length > 0 });
          session.append({
            type: 'tool_call', at: now(), toolUseId: call.toolUseId, tool: call.tool.name,
            summary: summarize(call.tool, root), ok: call.ok, changes: changes.map(recordChange),
            concurrentWith, preObserved: pending !== undefined, outside, risk, scanned: true,
          });
          session.writeIndex(next);
          session.touch();
          return;
        }
        case 'turn_end':
        case 'session_end': {
          this.recordUnattributed(session, previous);
          session.append(call.kind === 'turn_end'
            ? { type: 'turn_end', at: now() }
            : { type: 'session_end', at: now(), ...(call.reason !== undefined ? { reason: call.reason } : {}) });
          session.touch();
          writeReceipt(session, buildReceipt(session, this.store));
          return;
        }
      }
    });
  }

  private ensureSession(session: SessionStore, call: HookCall): { root: string; freshBaseline: boolean } {
    if (session.exists() && session.index() !== undefined) {
      const meta = session.meta();
      if (call.transcriptPath !== undefined && meta.transcriptPath !== call.transcriptPath) {
        session.writeMeta({ ...meta, transcriptPath: call.transcriptPath });
      }
      return { root: meta.root, freshBaseline: false };
    }
    const root = call.cwd;
    const baseline = scanTree(root, this.store, undefined, this.scanOptions);
    const at = now();
    session.writeMeta({
      id: session.dir.split(/[\\/]/).at(-1) as string, agent: this.agent, sessionId: call.sessionId, root,
      createdAt: at, updatedAt: at, ...(call.transcriptPath !== undefined ? { transcriptPath: call.transcriptPath } : {}),
    });
    session.writeIndex(baseline);
    const lateStart = call.kind !== 'session_start';
    session.append({
      type: 'session_start', at, agent: this.agent, sessionId: call.sessionId, root,
      ...(call.kind === 'session_start' && call.source !== undefined ? { source: call.source } : {}),
      baselineFiles: Object.keys(baseline.files).length, baselineTruncated: baseline.truncated, lateStart,
    });
    return { root, freshBaseline: true };
  }

  private recordUnattributed(session: SessionStore, previous: SnapshotIndex): void {
    const next = scanTree(previous.root, this.store, previous, this.scanOptions);
    const changes = diffIndexes(previous, next);
    if (changes.length > 0) session.append({ type: 'unattributed_changes', at: now(), changes: changes.map(recordChange) });
    session.writeIndex(next);
  }
}

export function recordChange(change: FileChange): RecordedChange {
  const before = change.before;
  const after = change.after;
  return {
    path: change.path,
    kind: change.kind,
    beforeHash: before?.hash ?? null,
    afterHash: after?.hash ?? null,
    beforeMode: before?.mode ?? null,
    afterMode: after?.mode ?? null,
    ...(before?.linkTarget !== undefined ? { beforeLink: before.linkTarget } : {}),
    ...(after?.linkTarget !== undefined ? { afterLink: after.linkTarget } : {}),
    beforeCaptured: before === null || before.hash !== null || before.linkTarget !== undefined,
  };
}

function summarize(tool: ToolDescription, root: string): string {
  if (tool.command !== undefined) return redactString(tool.command, 300);
  if (tool.path !== undefined) {
    const rel = tool.path.startsWith(`${root}/`) ? tool.path.slice(root.length + 1) : tool.path;
    return `${tool.name} ${redactString(rel, 300)}`;
  }
  return tool.name;
}

function now(): string {
  return new Date().toISOString();
}
