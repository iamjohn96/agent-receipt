import { lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ContentStore } from '../store/cas.js';
import { toPosix } from '../util/paths.js';

export type FileEntry = Readonly<{
  kind: 'file' | 'symlink';
  size: number;
  mtimeMs: number;
  ino: number;
  mode: number;
  /** sha256 of stored content (files only); null for symlinks and uncaptured files. */
  hash: string | null;
  /** Why content was not captured, when hash is null. */
  skipped?: 'too_large' | 'unreadable';
  linkTarget?: string;
}>;

export type SnapshotIndex = Readonly<{
  root: string;
  scannedAt: string;
  files: Readonly<Record<string, FileEntry>>;
  truncated: boolean;
  excludedDirs: readonly string[];
}>;

export type ScanOptions = Readonly<{
  maxFileBytes: number;
  maxFiles: number;
  excludeDirNames: readonly string[];
}>;

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 50_000,
  excludeDirNames: ['.git', 'node_modules', '.agent-receipt'],
};

export type ScanStats = { statted: number; hashed: number; reused: number; ms: number };

export class RootTooBroadError extends Error {}

export function assertScannableRoot(root: string): void {
  const resolved = resolve(root);
  if (resolved === '/' || resolved === resolve(homedir())) {
    throw new RootTooBroadError(`Refusing to snapshot ${resolved}; run the agent inside a project folder`);
  }
}

/**
 * Walk `root` and produce an index. Content is hashed and stored only for entries whose
 * (size, mtime, inode) changed since `previous`, so warm scans cost one lstat per file.
 */
export function scanTree(
  root: string,
  store: ContentStore,
  previous: SnapshotIndex | undefined,
  options: ScanOptions = DEFAULT_SCAN_OPTIONS,
  stats: ScanStats = { statted: 0, hashed: 0, reused: 0, ms: 0 },
): SnapshotIndex {
  const started = Date.now();
  assertScannableRoot(root);
  const files: Record<string, FileEntry> = {};
  const excluded = new Set(options.excludeDirNames);
  const excludedDirs: string[] = [];
  let truncated = false;
  let count = 0;
  const stack: string[] = [''];

  while (stack.length > 0 && !truncated) {
    const relDir = stack.pop() as string;
    let names: string[];
    try {
      names = readdirSync(join(root, relDir));
    } catch {
      continue;
    }
    names.sort();
    for (const name of names) {
      const rel = relDir === '' ? name : `${relDir}/${name}`;
      const abs = join(root, rel);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      stats.statted += 1;
      if (st.isDirectory()) {
        if (excluded.has(name)) excludedDirs.push(toPosix(rel));
        else stack.push(rel);
        continue;
      }
      if (!st.isFile() && !st.isSymbolicLink()) continue;
      if (count >= options.maxFiles) {
        truncated = true;
        break;
      }
      count += 1;
      const key = toPosix(rel);
      const prior = previous?.files[key];
      const kind = st.isSymbolicLink() ? 'symlink' : 'file';
      if (
        prior !== undefined && prior.kind === kind && prior.size === st.size
        && prior.mtimeMs === st.mtimeMs && prior.ino === st.ino && prior.mode === st.mode
      ) {
        files[key] = prior;
        stats.reused += 1;
        continue;
      }
      files[key] = captureEntry(abs, kind, st, store, options);
      stats.hashed += 1;
    }
  }

  stats.ms = Date.now() - started;
  return { root, scannedAt: new Date().toISOString(), files, truncated, excludedDirs: excludedDirs.sort() };
}

function captureEntry(
  abs: string,
  kind: 'file' | 'symlink',
  st: ReturnType<typeof lstatSync> & object,
  store: ContentStore,
  options: ScanOptions,
): FileEntry {
  const base = { kind, size: Number(st.size), mtimeMs: Number(st.mtimeMs), ino: Number(st.ino), mode: Number(st.mode) };
  if (kind === 'symlink') {
    try {
      const linkTarget = readlinkSync(abs);
      return { ...base, hash: null, linkTarget };
    } catch {
      return { ...base, hash: null, skipped: 'unreadable' };
    }
  }
  if (base.size > options.maxFileBytes) return { ...base, hash: null, skipped: 'too_large' };
  try {
    return { ...base, hash: store.putFile(abs) };
  } catch {
    return { ...base, hash: null, skipped: 'unreadable' };
  }
}
