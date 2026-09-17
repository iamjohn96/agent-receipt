import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { canonicalJson } from '../util/canonical-json.js';

// Hash-chain pattern from agent-permission-guard SqliteAuditRecorder.appendEvent,
// moved from SQLite rows to one JSONL file per session.
export const GENESIS_HASH = '0'.repeat(64);

export type LedgerRecord<E> = Readonly<{
  seq: number;
  prev: string;
  hash: string;
  event: E;
}>;

export type ChainVerification = Readonly<{ ok: boolean; count: number; head: string; brokenAt?: number }>;

export function readLedger<E>(path: string): LedgerRecord<E>[] {
  if (!existsSync(path)) return [];
  const records: LedgerRecord<E>[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    records.push(JSON.parse(line) as LedgerRecord<E>);
  }
  return records;
}

/** Caller must hold the session lock. */
export function appendLedger<E>(path: string, event: E): LedgerRecord<E> {
  const records = readLedger<E>(path);
  const last = records.at(-1);
  const prev = last?.hash ?? GENESIS_HASH;
  const seq = (last?.seq ?? 0) + 1;
  const hash = chainHash(prev, event);
  const record = { seq, prev, hash, event };
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

export function verifyLedger<E>(records: readonly LedgerRecord<E>[]): ChainVerification {
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const record of records) {
    if (record.seq !== expectedSeq || record.prev !== expectedPrev || chainHash(record.prev, record.event) !== record.hash) {
      return { ok: false, count: records.length, head: expectedPrev, brokenAt: expectedSeq };
    }
    expectedPrev = record.hash;
    expectedSeq += 1;
  }
  return { ok: true, count: records.length, head: expectedPrev };
}

function chainHash(prev: string, event: unknown): string {
  return createHash('sha256').update(`${prev}\n${canonicalJson(event)}`).digest('hex');
}
