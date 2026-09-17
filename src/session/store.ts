import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { SnapshotIndex } from '../snapshot/scan.js';
import { ensurePrivateDir, safeSegment } from '../util/paths.js';
import { withLock } from '../util/lock.js';
import { appendLedger, readLedger, type LedgerRecord } from './ledger.js';
import type { AgentName, SessionEvent } from './events.js';

export type SessionMeta = Readonly<{
  id: string;
  agent: AgentName;
  sessionId: string;
  root: string;
  createdAt: string;
  updatedAt: string;
  transcriptPath?: string;
}>;

export type PendingCall = Readonly<{ toolUseId: string; tool: string; startedAt: string }>;

export class SessionStore {
  readonly dir: string;

  constructor(readonly dataHome: string, agent: AgentName, sessionId: string) {
    this.dir = join(dataHome, 'sessions', `${agent}-${safeSegment(sessionId)}`);
  }

  static open(dataHome: string, id: string): SessionStore | undefined {
    const dir = join(dataHome, 'sessions', safeSegment(id));
    if (!existsSync(join(dir, 'meta.json'))) return undefined;
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as SessionMeta;
    return new SessionStore(dataHome, meta.agent, meta.sessionId);
  }

  static list(dataHome: string): SessionMeta[] {
    const base = join(dataHome, 'sessions');
    if (!existsSync(base)) return [];
    const metas: SessionMeta[] = [];
    for (const name of readdirSync(base)) {
      const metaPath = join(base, name, 'meta.json');
      try {
        metas.push(JSON.parse(readFileSync(metaPath, 'utf8')) as SessionMeta);
      } catch { /* incomplete session directory */ }
    }
    return metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  exists(): boolean {
    return existsSync(join(this.dir, 'meta.json'));
  }

  withLock<T>(operation: () => T): T {
    ensurePrivateDir(this.dir);
    return withLock(join(this.dir, 'lock'), operation);
  }

  meta(): SessionMeta {
    return JSON.parse(readFileSync(join(this.dir, 'meta.json'), 'utf8')) as SessionMeta;
  }

  writeMeta(meta: SessionMeta): void {
    this.writeJsonAtomic('meta.json', meta);
  }

  touch(): void {
    const meta = this.meta();
    this.writeMeta({ ...meta, updatedAt: new Date().toISOString() });
  }

  index(): SnapshotIndex | undefined {
    const path = join(this.dir, 'index.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as SnapshotIndex : undefined;
  }

  writeIndex(index: SnapshotIndex): void {
    this.writeJsonAtomic('index.json', index);
  }

  append(event: SessionEvent): LedgerRecord<SessionEvent> {
    return appendLedger(join(this.dir, 'events.jsonl'), event);
  }

  events(): LedgerRecord<SessionEvent>[] {
    return readLedger<SessionEvent>(join(this.dir, 'events.jsonl'));
  }

  addPending(call: PendingCall): void {
    ensurePrivateDir(join(this.dir, 'pending'));
    writeFileSync(join(this.dir, 'pending', `${safeSegment(call.toolUseId)}.json`), JSON.stringify(call), { mode: 0o600 });
  }

  removePending(toolUseId: string): PendingCall | undefined {
    const path = join(this.dir, 'pending', `${safeSegment(toolUseId)}.json`);
    if (!existsSync(path)) return undefined;
    const call = JSON.parse(readFileSync(path, 'utf8')) as PendingCall;
    rmSync(path, { force: true });
    return call;
  }

  pending(): PendingCall[] {
    const dir = join(this.dir, 'pending');
    if (!existsSync(dir)) return [];
    const now = Date.now();
    const calls: PendingCall[] = [];
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        // A Post hook that never arrived (crash, interrupt) must not taint attribution forever.
        if (now - statSync(path).mtimeMs > 30 * 60_000) { rmSync(path, { force: true }); continue; }
        calls.push(JSON.parse(readFileSync(path, 'utf8')) as PendingCall);
      } catch { /* raced with removal */ }
    }
    return calls;
  }

  receiptPath(): string {
    return join(this.dir, 'receipt.json');
  }

  private writeJsonAtomic(name: string, value: unknown): void {
    ensurePrivateDir(this.dir);
    const tmp = join(this.dir, `.${name}.${randomUUID()}`);
    writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    renameSync(tmp, join(this.dir, name));
  }
}
