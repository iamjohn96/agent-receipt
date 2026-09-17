import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { Receipt, ReceiptFile } from '../receipt/build.js';
import { buildReceipt, writeReceipt } from '../receipt/build.js';
import { scanTree } from '../snapshot/scan.js';
import type { SessionStore } from '../session/store.js';
import type { ContentStore } from '../store/cas.js';
import { isInside } from '../util/paths.js';

export type RestoreSelection = Readonly<{ paths: readonly string[]; deleted: boolean; modified: boolean; includeCreated: boolean }>;

export type PlanItem = Readonly<{
  path: string;
  net: ReceiptFile['net'];
  action: 'write' | 'remove' | 'symlink' | 'none';
  status: 'ready' | 'conflict' | 'not_captured' | 'already_restored' | 'unsafe_path' | 'not_selected';
  detail: string;
}>;

type Current = { exists: boolean; hash: string | null; link?: string };

export function planRestore(receipt: Receipt, store: ContentStore, selection: RestoreSelection, force: boolean): PlanItem[] {
  const wanted = new Set(selection.paths.map((p) => p.replace(/^\.\//, '')));
  const items: PlanItem[] = [];
  for (const file of receipt.files) {
    const selected = wanted.has(file.path)
      || (selection.deleted && file.net === 'deleted')
      || (selection.modified && file.net === 'modified')
      || (selection.includeCreated && file.net === 'created' && (wanted.size === 0 || wanted.has(file.path)));
    if (!selected) continue;
    if (file.net === 'unchanged' || file.net === 'transient') {
      items.push({ path: file.path, net: file.net, action: 'none', status: 'already_restored', detail: 'no net change in this session' });
      continue;
    }
    if (file.net === 'created' && !selection.includeCreated) {
      items.push({ path: file.path, net: file.net, action: 'remove', status: 'not_selected', detail: 'created by the session; pass --include-created to remove it' });
      continue;
    }
    const abs = resolve(receipt.root, file.path);
    if (!safeTarget(receipt.root, abs)) {
      items.push({ path: file.path, net: file.net, action: 'none', status: 'unsafe_path', detail: 'resolves outside the project folder' });
      continue;
    }
    const action = file.net === 'created' ? 'remove' : file.before.link !== undefined ? 'symlink' : 'write';
    if (action === 'write' && (file.before.hash === null || !store.has(file.before.hash))) {
      items.push({ path: file.path, net: file.net, action, status: 'not_captured', detail: 'original content was not captured (too large or unreadable)' });
      continue;
    }
    const current = readCurrent(abs);
    if (matches(current, { exists: file.before.exists, hash: file.before.hash, ...(file.before.link !== undefined ? { link: file.before.link } : {}) })) {
      items.push({ path: file.path, net: file.net, action: 'none', status: 'already_restored', detail: 'already matches the original' });
      continue;
    }
    const expected: Current = { exists: file.after.exists, hash: file.after.hash, ...(file.after.link !== undefined ? { link: file.after.link } : {}) };
    if (!matches(current, expected) && !force) {
      items.push({ path: file.path, net: file.net, action, status: 'conflict', detail: 'changed since the session recorded it; use --force to overwrite' });
      continue;
    }
    items.push({ path: file.path, net: file.net, action, status: 'ready', detail: describe(action, file) });
  }
  for (const path of wanted) {
    if (!receipt.files.some((f) => f.path === path)) {
      items.push({ path, net: 'unchanged', action: 'none', status: 'not_selected', detail: 'not changed in this session' });
    }
  }
  return items;
}

/** Execute ready items. Current content is backed up to the store first, so a restore is itself undoable. */
export function executeRestore(session: SessionStore, store: ContentStore, receipt: Receipt, items: readonly PlanItem[]): PlanItem[] {
  return session.withLock(() => {
    const done: PlanItem[] = [];
    for (const item of items) {
      if (item.status !== 'ready') continue;
      const file = receipt.files.find((f) => f.path === item.path) as ReceiptFile;
      const abs = resolve(receipt.root, file.path);
      if (!safeTarget(receipt.root, abs)) continue;
      const backupHash = existsSync(abs) && lstatSync(abs).isFile() ? store.putFile(abs) : null;
      let restoredHash: string | null = null;
      if (item.action === 'remove') {
        rmSync(abs, { force: true });
      } else if (item.action === 'symlink') {
        rmSync(abs, { force: true });
        mkdirSync(dirname(abs), { recursive: true });
        symlinkSync(file.before.link as string, abs);
      } else {
        const data = store.read(file.before.hash as string);
        mkdirSync(dirname(abs), { recursive: true });
        const tmp = join(dirname(abs), `.agent-receipt-restore-${process.pid}-${Date.now()}`);
        writeFileSync(tmp, data, { mode: 0o600 });
        chmodSync(tmp, (file.before.mode ?? 0o644) & 0o777);
        if (existsSync(abs) && lstatSync(abs).isSymbolicLink()) rmSync(abs, { force: true });
        renameSync(tmp, abs);
        restoredHash = file.before.hash;
      }
      session.append({
        type: 'restore', at: new Date().toISOString(), path: file.path, restoredHash, backupHash,
        action: item.action === 'remove' ? 'removed' : item.action === 'symlink' ? 'symlinked' : 'wrote',
      });
      done.push(item);
    }
    // Refresh the index so the next hook does not report our own restore as an unattributed change.
    const index = session.index();
    if (index !== undefined && done.length > 0) session.writeIndex(scanTree(index.root, store, index));
    if (done.length > 0) {
      session.touch();
      writeReceipt(session, buildReceipt(session, store));
    }
    return done;
  });
}

function describe(action: PlanItem['action'], file: ReceiptFile): string {
  if (action === 'remove') return 'remove file created by the session';
  if (action === 'symlink') return `recreate symlink → ${file.before.link}`;
  return file.net === 'deleted' ? 'recreate deleted file' : 'revert to content before the session';
}

function readCurrent(abs: string): Current {
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) return { exists: true, hash: null, link: readlinkSync(abs) };
    if (!st.isFile()) return { exists: true, hash: null };
    return { exists: true, hash: createHash('sha256').update(readFileSync(abs)).digest('hex') };
  } catch {
    return { exists: false, hash: null };
  }
}

function matches(current: Current, expected: Current): boolean {
  if (current.exists !== expected.exists) return false;
  if (!current.exists) return true;
  if (expected.link !== undefined || current.link !== undefined) return current.link === expected.link;
  return expected.hash !== null && current.hash === expected.hash;
}

function safeTarget(root: string, abs: string): boolean {
  if (!isInside(root, abs)) return false;
  // Refuse to write through a symlinked parent directory that escapes the root.
  let dir = dirname(abs);
  while (!existsSync(dir) && isInside(root, dir)) dir = dirname(dir);
  try {
    return isInside(realpathSync(root), realpathSync(dir));
  } catch {
    return false;
  }
}
