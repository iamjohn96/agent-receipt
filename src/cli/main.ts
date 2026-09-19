#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { parseClaudeHook } from '../hooks/claude.js';
import { Recorder } from '../hooks/recorder.js';
import { buildReceipt, writeReceipt } from '../receipt/build.js';
import { renderText } from '../receipt/render-text.js';
import { executeRestore, planRestore } from '../restore/restore.js';
import { SessionStore } from '../session/store.js';
import { verifyLedger } from '../session/ledger.js';
import { ContentStore } from '../store/cas.js';
import { claudeSettingsPath, hookCommand, readSettings, withOurHooks, withoutOurHooks, writeSettings } from '../install/claude-settings.js';
import { dataHome, displayPath, ensurePrivateDir } from '../util/paths.js';
import { redactString } from '../util/redaction.js';

const VERSION = '0.0.4';

const HELP = `agent-receipt ${VERSION} — see what your coding agent changed (including Bash) and restore files.

Usage:
  agent-receipt init [--project] [--yes]      Add Claude Code hooks (user settings by default)
  agent-receipt uninstall [--project] [--yes] Remove agent-receipt hooks
  agent-receipt list                          Recent sessions
  agent-receipt show [session|last] [--share] [--json] [--all]
  agent-receipt restore [session|last] [paths...] [--deleted] [--modified] [--include-created] [--force] [--yes]
  agent-receipt verify [session|last]         Check the session's event hash chain
  agent-receipt hook claude                   (internal) Claude Code hook entry point

Data lives in ~/.agent-receipt (override with AGENT_RECEIPT_HOME). Nothing leaves your machine, ever.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const home = dataHome();

  switch (command) {
    case 'hook':
      return runHook(home, args[0]);
    case 'list':
      return list(home);
    case 'show':
      return show(home, args[0], flags);
    case 'restore':
      return restore(home, args, flags);
    case 'verify':
      return verify(home, args[0]);
    case 'init':
      return install(flags, 'install');
    case 'uninstall':
      return install(flags, 'uninstall');
    case '--version':
    case '-v':
      console.log(VERSION);
      return 0;
    default:
      console.log(HELP);
      return command === undefined || command === 'help' || command === '--help' ? 0 : 1;
  }
}

async function runHook(home: string, agent: string | undefined): Promise<number> {
  // Observe-only: never print to stdout (SessionStart stdout becomes model context) and never fail the agent.
  try {
    const raw = await readStdin();
    if (agent !== 'claude') return 0;
    const call = parseClaudeHook(raw);
    if (call !== undefined) new Recorder(home, 'claude-code').handle(call);
  } catch (error) {
    try {
      ensurePrivateDir(home);
      const message = redactString(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 500);
      appendFileSync(join(home, 'errors.log'), `${new Date().toISOString()} hook ${agent ?? '?'} ${message}\n`, { mode: 0o600 });
    } catch { /* nothing else we can safely do */ }
  }
  return 0;
}

function resolveSession(home: string, ref: string | undefined): SessionStore | undefined {
  const sessions = SessionStore.list(home);
  if (sessions.length === 0) return undefined;
  if (ref === undefined || ref === 'last') {
    const cwd = process.cwd();
    const here = sessions.find((s) => cwd === s.root || cwd.startsWith(`${s.root}/`));
    return SessionStore.open(home, (here ?? sessions[0])?.id as string);
  }
  const match = sessions.filter((s) => s.id === ref || s.id.startsWith(ref) || s.sessionId.startsWith(ref));
  if (match.length > 1) throw new Error(`Session reference "${ref}" is ambiguous`);
  return match[0] === undefined ? undefined : SessionStore.open(home, match[0].id);
}

function list(home: string): number {
  const sessions = SessionStore.list(home);
  if (sessions.length === 0) {
    console.log('No sessions recorded yet. Run `agent-receipt init`, then start Claude Code in a project folder.');
    return 0;
  }
  for (const meta of sessions.slice(0, 20)) {
    const receiptPath = join(home, 'sessions', meta.id, 'receipt.json');
    let counts = '';
    if (existsSync(receiptPath)) {
      const s = JSON.parse(readFileSync(receiptPath, 'utf8')).summary;
      counts = `  -${s.deleted} ~${s.modified} +${s.created}${s.highRiskCommands > 0 ? `  ⚠${s.highRiskCommands}` : ''}`;
    }
    console.log(`${meta.id.slice(0, 24).padEnd(24)}  ${meta.updatedAt.slice(0, 16).replace('T', ' ')}  ${displayPath(meta.root)}${counts}`);
  }
  return 0;
}

async function show(home: string, ref: string | undefined, flags: Set<string>): Promise<number> {
  const session = resolveSession(home, ref);
  if (session === undefined) return fail('No matching session. See `agent-receipt list`.');
  const store = new ContentStore(home);
  const receipt = session.withLock(() => {
    const built = buildReceipt(session, store);
    writeReceipt(session, built);
    return built;
  });
  if (flags.has('--json')) console.log(JSON.stringify(receipt, null, 2));
  else console.log(renderText(receipt, { share: flags.has('--share'), color: process.stdout.isTTY === true && !process.env.NO_COLOR, maxRows: flags.has('--all') ? 10_000 : 8 }));
  return 0;
}

async function restore(home: string, args: string[], flags: Set<string>): Promise<number> {
  let ref: string | undefined;
  let paths = args;
  const first = args[0];
  if (first !== undefined && (first === 'last' || SessionStore.list(home).some((s) => s.id.startsWith(first) || s.sessionId.startsWith(first)))) {
    ref = first;
    paths = args.slice(1);
  }
  const session = resolveSession(home, ref);
  if (session === undefined) return fail('No matching session. See `agent-receipt list`.');
  const store = new ContentStore(home);
  const selection = { paths, deleted: flags.has('--deleted'), modified: flags.has('--modified'), includeCreated: flags.has('--include-created') };
  if (paths.length === 0 && !selection.deleted && !selection.modified && !selection.includeCreated) {
    return fail('Choose what to restore: file paths, --deleted, --modified, or --include-created.');
  }
  const receipt = buildReceipt(session, store);
  const plan = planRestore(receipt, store, selection, flags.has('--force'));
  if (plan.length === 0) {
    console.log('Nothing to restore for that selection.');
    return 0;
  }
  for (const item of plan) console.log(`${item.status === 'ready' ? '→' : '·'} ${item.path}  [${item.status}] ${item.detail}`);
  const ready = plan.filter((i) => i.status === 'ready');
  if (ready.length === 0) return plan.some((i) => i.status === 'conflict') ? 2 : 0;
  if (!flags.has('--yes')) {
    if (process.stdin.isTTY !== true) return fail(`Dry run: ${ready.length} file(s) ready. Re-run with --yes to apply.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Restore ${ready.length} file(s) in ${displayPath(receipt.root)}? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) return 1;
  }
  const done = executeRestore(session, store, receipt, plan);
  console.log(`Restored ${done.length} file(s). Previous contents were saved, so this can be undone too.`);
  return 0;
}

function verify(home: string, ref: string | undefined): number {
  const session = resolveSession(home, ref);
  if (session === undefined) return fail('No matching session.');
  const result = verifyLedger(session.events());
  console.log(result.ok ? `ok: ${result.count} events, head ${result.head.slice(0, 16)}…` : `BROKEN at event ${result.brokenAt}`);
  return result.ok ? 0 : 2;
}

async function install(flags: Set<string>, mode: 'install' | 'uninstall'): Promise<number> {
  const path = claudeSettingsPath(flags.has('--project') ? 'project' : 'user', process.cwd());
  const current = readSettings(path);
  const executable = resolveExecutable();
  if (mode === 'install' && executable === undefined) {
    return fail('Install agent-receipt globally first so hooks can find it:\n  npm install -g @jonnylab/agent-receipt\nthen run: agent-receipt init');
  }
  const next = mode === 'install' ? withOurHooks(current, hookCommand(executable as string)) : withoutOurHooks(current);
  if (JSON.stringify(next) === JSON.stringify(current)) {
    console.log(mode === 'install' ? 'Hooks already installed.' : 'No agent-receipt hooks found.');
    return 0;
  }
  console.log(`${mode === 'install' ? 'Will add' : 'Will remove'} agent-receipt hooks in ${displayPath(path)}:`);
  console.log('  SessionStart, PreToolUse (Bash/Write/Edit/MCP), PostToolUse, PostToolUseFailure, Stop, SessionEnd');
  if (mode === 'install') console.log(`  command: ${hookCommand(executable as string)}\n  Hooks only observe. They never block or change what the agent does.`);

  if (!flags.has('--yes')) {
    if (process.stdin.isTTY !== true) return fail('Re-run with --yes to apply.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Continue? [y/N] ');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) return 1;
  }

  const backup = writeSettings(path, next);
  if (backup !== undefined) console.log(`Backup: ${displayPath(backup)}`);

  console.log(mode === 'install' ? 'Done. Start a new Claude Code session, then run `agent-receipt show`.' : 'Removed.');
  return 0;
}

/** Hooks need a stable command. Refuse to wire an npx cache path that may be deleted later. */
function resolveExecutable(): string | undefined {
  const script = realpathSync(fileURLToPath(import.meta.url));
  if (/[\\/]_npx[\\/]/.test(script)) return undefined;
  return `"${process.execPath}" "${script}"`;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    process.stdin.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) reject(new Error('hook input too large'));
      else chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function fail(message: string): number {
  console.error(message);
  return 1;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
