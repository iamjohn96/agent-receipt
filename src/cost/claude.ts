import { existsSync, readFileSync, statSync } from 'node:fs';

// USD per million tokens. Source: platform.claude.com/docs/en/about-claude/pricing, checked 2026-09-17.
// [input, cacheWrite5m, cacheWrite1h, cacheRead, output]
export const PRICES_CHECKED_AT = '2026-09-17';
const PRICES: Readonly<Record<string, readonly [number, number, number, number, number]>> = {
  'fable-5-1': [10, 12.5, 20, 0.25, 50],
  'mythos-5-1': [10, 12.5, 20, 0.25, 50],
  'fable-5': [10, 12.5, 20, 1, 50],
  'mythos-5': [10, 12.5, 20, 1, 50],
  'opus-5': [5, 6.25, 10, 0.5, 25],
  'opus-4-8': [5, 6.25, 10, 0.5, 25],
  'opus-4-7': [5, 6.25, 10, 0.5, 25],
  'opus-4-6': [5, 6.25, 10, 0.5, 25],
  'opus-4-5': [5, 6.25, 10, 0.5, 25],
  'opus-4-1': [15, 18.75, 30, 1.5, 75],
  'opus-4': [15, 18.75, 30, 1.5, 75],
  'sonnet-5': [2, 2.5, 4, 0.2, 10],
  'sonnet-4-6': [3, 3.75, 6, 0.3, 15],
  'sonnet-4-5': [3, 3.75, 6, 0.3, 15],
  'sonnet-4': [3, 3.75, 6, 0.3, 15],
  'haiku-4-5': [1, 1.25, 2, 0.1, 5],
  'haiku-3-5': [0.8, 1, 1.6, 0.08, 4],
};
const KEYS_LONGEST_FIRST = Object.keys(PRICES).sort((a, b) => b.length - a.length);
const MAX_TRANSCRIPT_BYTES = 200 * 1024 * 1024;

export type TokenTotals = { input: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; output: number };

export type CostEstimate = Readonly<{
  tokens: TokenTotals;
  usd: number | null;
  unpricedModels: readonly string[];
  models: readonly string[];
  basis: 'transcript_usage_list_price';
}>;

export function priceKeyFor(model: string): string | undefined {
  const id = model.toLowerCase().replace(/\./g, '-');
  return KEYS_LONGEST_FIRST.find((key) => new RegExp(`(^|-)${key}($|-\\d{8}|\\[|-[a-z])`).test(id));
}

/**
 * Estimate from the Claude Code transcript. Usage fields are not a documented contract and
 * streaming entries repeat per message, so values are grouped by message id and the maximum
 * of each counter is taken. Always presented as an estimate.
 */
export function estimateClaudeCost(transcriptPath: string | undefined): CostEstimate | undefined {
  if (transcriptPath === undefined || !existsSync(transcriptPath)) return undefined;
  if (statSync(transcriptPath).size > MAX_TRANSCRIPT_BYTES) return undefined;
  const perMessage = new Map<string, { model: string; t: TokenTotals }>();
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry?.message;
    const usage = message?.usage;
    if (typeof usage !== 'object' || usage === null) continue;
    const id = String(message.id ?? entry.requestId ?? entry.uuid ?? perMessage.size);
    const model = typeof message.model === 'string' ? message.model : 'unknown';
    const creation = usage.cache_creation;
    const has1hBreakdown = typeof creation === 'object' && creation !== null;
    const t: TokenTotals = {
      input: num(usage.input_tokens),
      cacheWrite5m: has1hBreakdown ? num(creation.ephemeral_5m_input_tokens) : num(usage.cache_creation_input_tokens),
      cacheWrite1h: has1hBreakdown ? num(creation.ephemeral_1h_input_tokens) : 0,
      cacheRead: num(usage.cache_read_input_tokens),
      output: num(usage.output_tokens),
    };
    const prior = perMessage.get(id);
    perMessage.set(id, prior === undefined ? { model, t } : {
      model,
      t: {
        input: Math.max(prior.t.input, t.input), cacheWrite5m: Math.max(prior.t.cacheWrite5m, t.cacheWrite5m),
        cacheWrite1h: Math.max(prior.t.cacheWrite1h, t.cacheWrite1h), cacheRead: Math.max(prior.t.cacheRead, t.cacheRead),
        output: Math.max(prior.t.output, t.output),
      },
    });
  }
  if (perMessage.size === 0) return undefined;
  const tokens: TokenTotals = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
  let usd = 0;
  const models = new Set<string>();
  const unpriced = new Set<string>();
  for (const { model, t } of perMessage.values()) {
    if (model === '<synthetic>') continue;
    models.add(model);
    for (const k of Object.keys(tokens) as (keyof TokenTotals)[]) tokens[k] += t[k];
    const key = priceKeyFor(model);
    const p = key === undefined ? undefined : PRICES[key];
    if (p === undefined) { unpriced.add(model); continue; }
    usd += (t.input * p[0] + t.cacheWrite5m * p[1] + t.cacheWrite1h * p[2] + t.cacheRead * p[3] + t.output * p[4]) / 1_000_000;
  }
  return {
    tokens, usd: models.size > 0 && unpriced.size === models.size ? null : Math.round(usd * 100) / 100,
    unpricedModels: [...unpriced].sort(), models: [...models].sort(), basis: 'transcript_usage_list_price',
  };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
