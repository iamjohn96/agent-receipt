import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const MARKER = '--by=jonnylab-agent-receipt';
const MUTATING_MATCHER = '^(Bash|Write|Edit|MultiEdit|NotebookEdit|mcp__.*)$';

type HookHandler = { type: string; command?: string; timeout?: number; [key: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: HookHandler[]; [key: string]: unknown };
type Settings = { hooks?: Record<string, MatcherGroup[]>; [key: string]: unknown };

export function claudeSettingsPath(scope: 'user' | 'project', cwd: string): string {
  return scope === 'user' ? join(homedir(), '.claude', 'settings.json') : join(cwd, '.claude', 'settings.json');
}

export function hookCommand(executable: string): string {
  return `${executable} hook claude ${MARKER}`;
}

function ours(handler: HookHandler): boolean {
  return typeof handler.command === 'string' && handler.command.includes(MARKER);
}

export function withoutOurHooks(settings: Settings): Settings {
  if (settings.hooks === undefined) return settings;
  const hooks: Record<string, MatcherGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !ours(h)) }))
      .filter((group) => group.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  const next: Settings = { ...settings };
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

export function withOurHooks(settings: Settings, command: string): Settings {
  const base = withoutOurHooks(settings);
  const hooks: Record<string, MatcherGroup[]> = { ...(base.hooks ?? {}) };
  const handler = (timeout: number): HookHandler => ({ type: 'command', command, timeout });
  const add = (event: string, group: MatcherGroup) => { hooks[event] = [...(hooks[event] ?? []), group]; };
  add('SessionStart', { hooks: [handler(60)] });
  add('PreToolUse', { matcher: MUTATING_MATCHER, hooks: [handler(60)] });
  add('PostToolUse', { matcher: '*', hooks: [handler(60)] });
  add('PostToolUseFailure', { matcher: '*', hooks: [handler(60)] });
  add('Stop', { hooks: [handler(60)] });
  add('SessionEnd', { hooks: [handler(60)] });
  return { ...base, hooks };
}

export function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  if (text.trim() === '') return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed as Settings;
}

/** Back up the existing file, then write atomically. Returns the backup path, if any. */
export function writeSettings(path: string, settings: Settings): string | undefined {
  mkdirSync(dirname(path), { recursive: true });
  let backup: string | undefined;
  if (existsSync(path)) {
    backup = `${path}.agent-receipt-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(path, backup);
  }
  const tmp = `${path}.agent-receipt-tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmp, path);
  return backup;
}
