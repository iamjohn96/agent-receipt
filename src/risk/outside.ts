import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { isInside } from '../util/paths.js';
import type { OutsideAccess } from '../session/events.js';

const IGNORED_PREFIXES = ['/dev/', '/usr/', '/bin/', '/sbin/', '/opt/homebrew/', '/System/', '/private/var/folders/', '/proc/'];
const IGNORED_EXACT = new Set(['/dev/null', '/tmp', '/usr/bin/env']);
const SENSITIVE = [/^~?\/?\.ssh(?:\/|$)/, /\/\.ssh(?:\/|$)/, /\/\.aws(?:\/|$)/, /\/\.gnupg(?:\/|$)/, /\/\.config\/gh(?:\/|$)/, /\/\.npmrc$/, /\/\.netrc$/, /\/\.docker\/config\.json$/, /\/\.kube(?:\/|$)/, /^\/etc\//, /\/Library\/Keychains(?:\/|$)/, /\/\.claude(?:\/|$)/, /\/\.codex(?:\/|$)/, /\/\.env(?:\.[\w.-]+)?$/];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE.some((p) => p.test(path));
}

/** Exact: a tool received an explicit path argument outside the project root. */
export function outsideFromToolPath(root: string, cwd: string, rawPath: string | undefined): OutsideAccess[] {
  if (rawPath === undefined || rawPath === '') return [];
  const abs = resolveUserPath(cwd, rawPath);
  if (isInside(root, abs)) return [];
  return [{ path: abs, via: 'tool_path', sensitive: isSensitivePath(abs) }];
}

/**
 * Heuristic: path-like tokens in a shell command that resolve outside the root.
 * This is a mention, not proof of access; the receipt labels it that way.
 */
export function outsideFromCommand(root: string, cwd: string, command: string): OutsideAccess[] {
  const found = new Map<string, OutsideAccess>();
  for (const token of tokenize(command)) {
    if (!looksLikePath(token)) continue;
    const abs = resolveUserPath(cwd, token.replace(/[;,)]+$/, ''));
    if (isInside(root, abs) || IGNORED_EXACT.has(abs) || IGNORED_PREFIXES.some((p) => abs.startsWith(p) || abs === p.slice(0, -1))) continue;
    if (!found.has(abs)) found.set(abs, { path: abs, via: 'command_mention', sensitive: isSensitivePath(abs) });
    if (found.size >= 20) break;
  }
  return [...found.values()];
}

function looksLikePath(token: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return false; // URL
  return token.startsWith('/') || token.startsWith('~/') || token === '~' || token === '..' || token.startsWith('../') || token.includes('/../');
}

function resolveUserPath(cwd: string, raw: string): string {
  if (raw === '~') return homedir();
  if (raw.startsWith('~/')) return join(homedir(), raw.slice(2));
  return isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s"'<>|;&]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    // Split redirections/assignments like >/path or FOO=/path
    for (const part of value.split(/^[0-9]*>+|=/)) if (part !== '') tokens.push(part);
  }
  return tokens;
}
