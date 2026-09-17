import type { FileEntry, SnapshotIndex } from './scan.js';

export type ChangeKind = 'created' | 'modified' | 'deleted';

export type FileChange = Readonly<{
  path: string;
  kind: ChangeKind;
  before: FileEntry | null;
  after: FileEntry | null;
}>;

export function diffIndexes(before: SnapshotIndex, after: SnapshotIndex): FileChange[] {
  const changes: FileChange[] = [];
  for (const [path, prior] of Object.entries(before.files)) {
    const next = after.files[path];
    if (next === undefined) {
      // A truncated scan cannot prove a deletion.
      if (!after.truncated) changes.push({ path, kind: 'deleted', before: prior, after: null });
    } else if (!sameContent(prior, next)) {
      changes.push({ path, kind: 'modified', before: prior, after: next });
    }
  }
  for (const [path, next] of Object.entries(after.files)) {
    if (before.files[path] === undefined) changes.push({ path, kind: 'created', before: null, after: next });
  }
  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function sameContent(a: FileEntry, b: FileEntry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'symlink') return a.linkTarget === b.linkTarget;
  if (a.hash !== null && b.hash !== null) return a.hash === b.hash && (a.mode & 0o777) === (b.mode & 0o777);
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
}
