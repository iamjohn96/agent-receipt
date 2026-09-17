// Structure (deduplicated signals, additive points, fixed bands) ported from
// agent-permission-guard src/risk/scorer.ts. Detectors rewritten for shell commands
// and file paths instead of MCP tool names.

export type RiskSignalCode =
  | 'recursive_delete'
  | 'history_rewrite'
  | 'discard_uncommitted'
  | 'remote_push'
  | 'pipe_to_shell'
  | 'privilege'
  | 'permission_change'
  | 'secret_file'
  | 'outside_root'
  | 'mass_delete';

export type RiskSignal = Readonly<{ code: RiskSignalCode; points: number }>;
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';
export type RiskAssessment = Readonly<{ score: number; band: RiskBand; signals: readonly RiskSignal[] }>;

const POINTS: Readonly<Record<RiskSignalCode, number>> = {
  recursive_delete: 35,
  history_rewrite: 35,
  discard_uncommitted: 35,
  remote_push: 20,
  pipe_to_shell: 30,
  privilege: 30,
  permission_change: 15,
  secret_file: 25,
  outside_root: 15,
  mass_delete: 30,
};

const COMMAND_DETECTORS: ReadonlyArray<Readonly<{ code: RiskSignalCode; pattern: RegExp }>> = [
  { code: 'recursive_delete', pattern: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b|\bfind\b[^|;&]*\s-delete\b|\brimraf\b/ },
  { code: 'history_rewrite', pattern: /\bgit\s+(?:push\s+[^;&|]*(?:--force\b|-f\b|--force-with-lease\b)|rebase\b|filter-branch\b|filter-repo\b)/ },
  { code: 'discard_uncommitted', pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+(?:--\s+)?\.(?:\s|$)|restore\s+(?:--\S+\s+)*\.(?:\s|$)|stash\s+drop|stash\s+clear)/ },
  { code: 'remote_push', pattern: /\bgit\s+push\b|\bnpm\s+publish\b|\bgh\s+(?:pr\s+merge|release\s+create|repo\s+delete)\b/ },
  { code: 'pipe_to_shell', pattern: /\b(?:curl|wget)\b[^|;]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/ },
  { code: 'privilege', pattern: /(?:^|[\s;&|(])sudo\s/ },
  { code: 'permission_change', pattern: /\bchmod\s+(?:-R\s+)?(?:777|a\+w|-R)|\bchown\s+-R\b/ },
  { code: 'secret_file', pattern: /(?:^|[\s'"=/])(?:\.env(?:\.[\w.-]+)?|id_rsa|id_ed25519|\.npmrc|\.pypirc|credentials(?:\.json)?|\.netrc)(?:$|[\s'"])|\.ssh\/|\.aws\/|\.gnupg\// },
];

export function scoreCommand(command: string, extra: Readonly<{ outsideRoot: boolean; deletedCount: number }>): RiskAssessment {
  const signals = new Map<RiskSignalCode, RiskSignal>();
  const add = (code: RiskSignalCode) => { if (!signals.has(code)) signals.set(code, { code, points: POINTS[code] }); };
  for (const detector of COMMAND_DETECTORS) if (detector.pattern.test(command)) add(detector.code);
  if (extra.outsideRoot) add('outside_root');
  if (extra.deletedCount >= 5) add('mass_delete');
  return finish(signals);
}

export function scorePathAction(path: string, extra: Readonly<{ outsideRoot: boolean }>): RiskAssessment {
  const signals = new Map<RiskSignalCode, RiskSignal>();
  const add = (code: RiskSignalCode) => { if (!signals.has(code)) signals.set(code, { code, points: POINTS[code] }); };
  if (COMMAND_DETECTORS.find((d) => d.code === 'secret_file')?.pattern.test(` ${path} `)) add('secret_file');
  if (extra.outsideRoot) add('outside_root');
  return finish(signals);
}

function finish(signals: Map<RiskSignalCode, RiskSignal>): RiskAssessment {
  const ordered = [...signals.values()].sort((a, b) => a.code.localeCompare(b.code));
  const score = Math.min(100, ordered.reduce((sum, s) => sum + s.points, 0));
  return { score, band: bandForScore(score), signals: ordered };
}

function bandForScore(score: number): RiskBand {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}
