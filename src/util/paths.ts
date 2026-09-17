import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function dataHome(): string {
  const override = process.env.AGENT_RECEIPT_HOME;
  return resolve(override !== undefined && override !== '' ? override : join(homedir(), '.agent-receipt'));
}

/** Create a directory owned by the current user with 0700 permissions; refuse symlinks. */
export function ensurePrivateDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing non-directory data path: ${path}`);
  if ((stat.mode & 0o077) !== 0) chmodSync(path, 0o700);
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Session ids come from hook stdin. Never let them become path segments unless they are
 * plainly safe (Entire CLI shipped a path-traversal bug through exactly this input).
 */
export function safeSegment(raw: string): string {
  if (SAFE_ID.test(raw) && !raw.includes('..')) return raw;
  return `h-${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

export function displayPath(path: string): string {
  const home = homedir();
  return isInside(home, path) ? `~${path.slice(home.length)}` : path;
}
