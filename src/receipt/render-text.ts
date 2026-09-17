import { basename } from 'node:path';

import type { Receipt, ReceiptFile } from './build.js';
import { displayPath } from '../util/paths.js';

export type RenderOptions = Readonly<{ share: boolean; color: boolean; maxRows: number }>;

const WIDTH = 64;

export function renderText(receipt: Receipt, options: RenderOptions): string {
  const c = palette(options.color);
  const root = options.share ? `<${basename(receipt.root)}>` : displayPath(receipt.root);
  const lines: string[] = [];
  const rule = c.dim('─'.repeat(WIDTH));
  const s = receipt.summary;

  lines.push(c.bold(`AGENT RECEIPT`) + c.dim(`  ${receipt.agent} · ${formatRange(receipt.startedAt, receipt.lastEventAt)}${receipt.ended ? '' : ' · in progress'}`));
  lines.push(c.dim(root));
  lines.push(rule);

  const section = (label: string, files: readonly ReceiptFile[], paint: (t: string) => string) => {
    if (files.length === 0) return;
    lines.push(`${paint(label.padEnd(10))}${String(files.length).padStart(3)}`);
    for (const file of files.slice(0, options.maxRows)) {
      const cause = describeCause(file);
      const tag = file.net === 'deleted' || file.net === 'modified'
        ? (file.restorable ? c.green(' restorable') : c.red(' not captured'))
        : '';
      lines.push(`   ${file.path}${tag}${cause === '' ? '' : c.dim(`  ← ${cause}`)}`);
    }
    if (files.length > options.maxRows) lines.push(c.dim(`   … ${files.length - options.maxRows} more`));
  };
  section('DELETED', receipt.files.filter((f) => f.net === 'deleted'), c.red);
  section('MODIFIED', receipt.files.filter((f) => f.net === 'modified'), c.yellow);
  section('CREATED', receipt.files.filter((f) => f.net === 'created'), c.green);
  if (s.created + s.modified + s.deleted === 0) lines.push(c.dim('No file changes under the project folder.'));

  lines.push(rule);
  const risky = receipt.commands.filter((cmd) => cmd.risk !== null && (cmd.risk.band === 'high' || cmd.risk.band === 'critical'));
  lines.push(`${'COMMANDS'.padEnd(10)}${String(s.commands).padStart(3)}${s.highRiskCommands > 0 ? c.red(`   ⚠ ${s.highRiskCommands} high risk`) : ''}`);
  for (const cmd of risky.slice(0, options.maxRows)) {
    lines.push(`   ${c.red('⚠')} ${truncate(cmd.summary, WIDTH - 6)}${c.dim(`  (${cmd.risk?.signals.map((sig) => sig.code).join(', ')})`)}`);
  }
  if (s.outside > 0) {
    const unique = new Map(receipt.outside.map((o) => [o.path, o]));
    lines.push(`${'OUTSIDE'.padEnd(10)}${String(unique.size).padStart(3)}${s.sensitiveOutside > 0 ? c.red(`   ⚠ ${s.sensitiveOutside} sensitive`) : ''}`);
    for (const access of [...unique.values()].slice(0, options.maxRows)) {
      const shown = options.share ? maskHome(access.path) : displayPath(access.path);
      lines.push(`   ${access.sensitive ? c.red(shown) : shown}${c.dim(access.via === 'command_mention' ? '  (mentioned in command)' : `  (${access.tool})`)}`);
    }
  }
  if (receipt.cost !== null) {
    const t = receipt.cost.tokens;
    const total = t.input + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead + t.output;
    const usd = receipt.cost.usd === null ? 'unpriced model' : `≈ $${receipt.cost.usd.toFixed(2)} est.`;
    lines.push(`${'COST'.padEnd(10)}${usd}${c.dim(`  ${formatTokens(total)} tokens, list price`)}`);
  }
  lines.push(rule);

  if (s.restorableDeleted > 0 || receipt.files.some((f) => f.net === 'modified' && f.restorable)) {
    lines.push(`restore:  ${c.bold(`agent-receipt restore ${options.share ? '<session>' : receipt.sessionKey} --deleted`)}`);
  }
  if (s.unattributedChanges > 0) lines.push(c.dim(`${s.unattributedChanges} change(s) happened between tool calls (not attributed).`));
  lines.push(c.dim(`not observed: ${receipt.coverage.notObserved.filter((n) => !n.startsWith('excluded_dir:')).join(', ')}`));
  lines.push(c.dim(`chain: ${receipt.chain.ok ? 'verified' : `BROKEN at event ${receipt.chain.brokenAt}`} (${receipt.chain.count} events) · ${receipt.digest.slice(0, 19)}…`));
  return lines.join('\n');
}

function describeCause(file: ReceiptFile): string {
  const last = [...file.touches].reverse().find((t) => t.attribution !== 'restore') ?? file.touches.at(-1);
  if (last === undefined) return '';
  if (last.attribution === 'unattributed') return 'between tool calls';
  const who = last.tool === 'Bash' ? `Bash: ${truncate(last.summary ?? '', 40)}` : truncate(last.summary ?? last.tool ?? '', 44);
  return last.attribution === 'shared' ? `${who} (parallel calls)` : who;
}

function maskHome(path: string): string {
  return displayPath(path).replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, '~');
}

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ');
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}

function formatRange(start: string, end: string): string {
  const a = new Date(start);
  const b = new Date(end);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
  return `${day} ${pad(a.getHours())}:${pad(a.getMinutes())}–${pad(b.getHours())}:${pad(b.getMinutes())}`;
}

function formatTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function palette(enabled: boolean) {
  const wrap = (code: string) => (text: string) => (enabled ? `[${code}m${text}[0m` : text);
  return { bold: wrap('1'), dim: wrap('2'), red: wrap('31'), green: wrap('32'), yellow: wrap('33') };
}
