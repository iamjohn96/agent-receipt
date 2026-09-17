import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';

import { estimateClaudeCost, type CostEstimate, PRICES_CHECKED_AT } from '../cost/claude.js';
import { verifyLedger, type ChainVerification } from '../session/ledger.js';
import type { OutsideAccess, RecordedChange, SessionEvent } from '../session/events.js';
import type { SessionStore } from '../session/store.js';
import type { ContentStore } from '../store/cas.js';
import type { RiskAssessment } from '../risk/scorer.js';
import { canonicalJson } from '../util/canonical-json.js';

export type Attribution = 'tool' | 'shared' | 'unattributed' | 'restore';

export type FileTouch = Readonly<{ seq: number; tool: string | null; summary: string | null; attribution: Attribution; kind: RecordedChange['kind'] }>;

export type ReceiptFile = Readonly<{
  path: string;
  net: 'created' | 'modified' | 'deleted' | 'transient' | 'unchanged';
  before: Readonly<{ exists: boolean; hash: string | null; mode: number | null; link?: string; captured: boolean }>;
  after: Readonly<{ exists: boolean; hash: string | null; mode: number | null; link?: string }>;
  restorable: boolean;
  touches: readonly FileTouch[];
}>;

export type ReceiptCommand = Readonly<{
  seq: number; at: string; tool: string; summary: string; ok: boolean; risk: RiskAssessment | null;
  created: number; modified: number; deleted: number; attribution: 'tool' | 'shared'; preObserved: boolean;
}>;

export type Receipt = Readonly<{
  schema: 'agent-receipt/v0';
  sessionKey: string;
  agent: string;
  sessionId: string;
  root: string;
  startedAt: string;
  lastEventAt: string;
  ended: boolean;
  summary: Readonly<{
    created: number; modified: number; deleted: number; transient: number; restored: number;
    toolCalls: number; commands: number; highRiskCommands: number;
    outside: number; sensitiveOutside: number; unattributedChanges: number; restorableDeleted: number;
  }>;
  files: readonly ReceiptFile[];
  commands: readonly ReceiptCommand[];
  outside: readonly (OutsideAccess & { seq: number; tool: string; summary: string })[];
  cost: (CostEstimate & { pricesCheckedAt: string }) | null;
  coverage: Readonly<{ observed: readonly string[]; notObserved: readonly string[] }>;
  limitations: Readonly<{ causalAttribution: false; lateStart: boolean; baselineTruncated: boolean; clock: 'local_system_clock'; signed: false }>;
  chain: ChainVerification;
  digest: string;
}>;

export function buildReceipt(session: SessionStore, store: ContentStore): Receipt {
  const meta = session.meta();
  const records = session.events();
  const chain = verifyLedger(records);
  const index = session.index();

  const perPath = new Map<string, { changes: RecordedChange[]; touches: FileTouch[] }>();
  const commands: ReceiptCommand[] = [];
  const outside: (OutsideAccess & { seq: number; tool: string; summary: string })[] = [];
  let unattributedChanges = 0;
  let toolCalls = 0;
  let lateStart = false;
  let baselineTruncated = false;
  let ended = false;
  let restored = 0;

  const touch = (seq: number, change: RecordedChange, tool: string | null, summary: string | null, attribution: Attribution) => {
    const entry = perPath.get(change.path) ?? { changes: [], touches: [] };
    entry.changes.push(change);
    entry.touches.push({ seq, tool, summary, attribution, kind: change.kind });
    perPath.set(change.path, entry);
  };

  for (const { seq, event } of records) {
    switch (event.type) {
      case 'session_start':
        lateStart = lateStart || event.lateStart;
        baselineTruncated = baselineTruncated || event.baselineTruncated;
        break;
      case 'tool_call': {
        toolCalls += 1;
        const attribution = event.concurrentWith.length > 0 ? 'shared' : 'tool';
        for (const change of event.changes) touch(seq, change, event.tool, event.summary, attribution);
        for (const access of event.outside) outside.push({ ...access, seq, tool: event.tool, summary: event.summary });
        if (event.scanned) {
          commands.push({
            seq, at: event.at, tool: event.tool, summary: event.summary, ok: event.ok, risk: event.risk,
            created: event.changes.filter((c) => c.kind === 'created').length,
            modified: event.changes.filter((c) => c.kind === 'modified').length,
            deleted: event.changes.filter((c) => c.kind === 'deleted').length,
            attribution, preObserved: event.preObserved,
          });
        }
        break;
      }
      case 'unattributed_changes':
        unattributedChanges += event.changes.length;
        for (const change of event.changes) touch(seq, change, null, null, 'unattributed');
        break;
      case 'restore': {
        restored += 1;
        const change: RecordedChange = {
          path: event.path,
          kind: event.action === 'removed' ? 'deleted' : event.backupHash === null ? 'created' : 'modified',
          beforeHash: event.backupHash, afterHash: event.restoredHash, beforeMode: null, afterMode: null, beforeCaptured: true,
        };
        touch(seq, change, 'agent-receipt restore', null, 'restore');
        break;
      }
      case 'session_end':
        ended = true;
        break;
      case 'turn_end':
        break;
    }
  }

  const files: ReceiptFile[] = [];
  for (const [path, { changes, touches }] of perPath) {
    const first = changes[0] as RecordedChange;
    const last = changes.at(-1) as RecordedChange;
    const existedBefore = first.kind !== 'created';
    const existsAfter = last.kind !== 'deleted';
    const beforeLink = first.beforeLink;
    const afterLink = last.afterLink;
    const before = { exists: existedBefore, hash: first.beforeHash, mode: first.beforeMode, ...(beforeLink !== undefined ? { link: beforeLink } : {}), captured: first.beforeCaptured };
    const after = { exists: existsAfter, hash: last.afterHash, mode: last.afterMode, ...(afterLink !== undefined ? { link: afterLink } : {}) };
    let net: ReceiptFile['net'];
    if (existedBefore && !existsAfter) net = 'deleted';
    else if (!existedBefore && existsAfter) net = 'created';
    else if (!existedBefore && !existsAfter) net = 'transient';
    else if (before.hash !== null && before.hash === after.hash && beforeLink === afterLink) net = 'unchanged';
    else if (before.hash === null && after.hash === null && beforeLink !== undefined && beforeLink === afterLink) net = 'unchanged';
    else net = 'modified';
    const restorable = net === 'created'
      || ((net === 'deleted' || net === 'modified') && (beforeLink !== undefined || (before.hash !== null && store.has(before.hash))));
    files.push({ path, net, before, after, restorable, touches });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const count = (net: ReceiptFile['net']) => files.filter((f) => f.net === net).length;
  const cost = meta.agent === 'claude-code' ? estimateClaudeCost(meta.transcriptPath) : undefined;
  const excluded = index?.excludedDirs ?? [];

  const body = {
    schema: 'agent-receipt/v0' as const,
    sessionKey: meta.id,
    agent: meta.agent,
    sessionId: meta.sessionId,
    root: meta.root,
    startedAt: meta.createdAt,
    lastEventAt: records.at(-1)?.event.at ?? meta.updatedAt,
    ended,
    summary: {
      created: count('created'), modified: count('modified'), deleted: count('deleted'), transient: count('transient'), restored,
      toolCalls, commands: commands.filter((c) => c.tool === 'Bash' || c.tool === 'exec_command' || c.tool === 'shell').length,
      highRiskCommands: commands.filter((c) => c.risk !== null && (c.risk.band === 'high' || c.risk.band === 'critical')).length,
      outside: new Set(outside.map((o) => o.path)).size,
      sensitiveOutside: new Set(outside.filter((o) => o.sensitive).map((o) => o.path)).size,
      unattributedChanges,
      restorableDeleted: files.filter((f) => f.net === 'deleted' && f.restorable).length,
    },
    files,
    commands,
    outside,
    cost: cost === undefined ? null : { ...cost, pricesCheckedAt: PRICES_CHECKED_AT },
    coverage: {
      observed: ['file_changes_under_root_between_hook_events', 'tool_calls_reported_by_agent_hooks', 'tool_path_arguments', 'command_text'],
      notObserved: [
        'changes_outside_root', 'network_effects', 'content_of_files_over_size_limit', 'process_side_effects',
        ...excluded.slice(0, 20).map((dir) => `excluded_dir:${dir}`),
        ...(lateStart ? ['activity_before_first_hook'] : []),
      ],
    },
    limitations: { causalAttribution: false as const, lateStart, baselineTruncated, clock: 'local_system_clock' as const, signed: false as const },
    chain,
  };
  const digest = `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`;
  return { ...body, digest };
}

export function writeReceipt(session: SessionStore, receipt: Receipt): void {
  const path = session.receiptPath();
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}
