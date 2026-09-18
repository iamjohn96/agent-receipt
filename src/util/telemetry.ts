import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ensurePrivateDir } from './paths.js';

/**
 * Collector for opt-in events. An empty endpoint means telemetry is a no-op even for
 * users who said yes — which is the state of any build that has not been pointed at a
 * collector. Both values are overridable so the collector can be self-hosted or faked
 * in tests; neither is a secret (the key is a public insert-only anon key).
 */
const DEFAULT_ENDPOINT = '';
const DEFAULT_KEY = '';

export const TELEMETRY_EVENTS = ['installed', 'third_receipt'] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export interface TelemetryConfig {
  enabled: boolean;
  installId?: string;
  sent: TelemetryEvent[];
}

/** Exactly what leaves the machine. Anything not on this type is never transmitted. */
export interface TelemetryPayload {
  install_id: string;
  event: TelemetryEvent;
  version: string;
  platform: string;
  /** Distinct days on which a receipt was produced. Only on `third_receipt`. */
  days?: number;
}

export function telemetryEndpoint(): { url: string; key: string } {
  const url = (process.env.AGENT_RECEIPT_TELEMETRY_URL ?? DEFAULT_ENDPOINT).trim();
  const key = (process.env.AGENT_RECEIPT_TELEMETRY_KEY ?? DEFAULT_KEY).trim();
  return { url, key };
}

function configPath(dataHome: string): string {
  return join(dataHome, 'config.json');
}

function readRaw(dataHome: string): Record<string, unknown> {
  const path = configPath(dataHome);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function readTelemetryConfig(dataHome: string): TelemetryConfig {
  const data = readRaw(dataHome);
  const sentRaw = Array.isArray(data.telemetry_sent) ? data.telemetry_sent : [];
  const sent = sentRaw.filter((e): e is TelemetryEvent => TELEMETRY_EVENTS.includes(e as TelemetryEvent));
  const config: TelemetryConfig = { enabled: Boolean(data.telemetry_enabled), sent };
  if (typeof data.install_id === 'string' && data.install_id !== '') config.installId = data.install_id;
  return config;
}

export function writeTelemetryConfig(dataHome: string, config: Partial<TelemetryConfig>): void {
  ensurePrivateDir(dataHome);
  const existing = readRaw(dataHome);
  if (config.enabled !== undefined) existing.telemetry_enabled = config.enabled;
  if (config.installId !== undefined) existing.install_id = config.installId;
  if (config.sent !== undefined) existing.telemetry_sent = config.sent;
  // Opting out deletes the identifier, so nothing links this machine to earlier events.
  if (config.enabled === false) {
    delete existing.install_id;
    delete existing.telemetry_sent;
  }
  writeFileSync(configPath(dataHome), JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
}

/** Create the anonymous id on first use, never before consent. */
function ensureInstallId(dataHome: string, config: TelemetryConfig): string {
  if (config.installId !== undefined) return config.installId;
  const installId = randomUUID();
  writeTelemetryConfig(dataHome, { installId });
  return installId;
}

export function buildPayload(installId: string, event: TelemetryEvent, version: string, days?: number): TelemetryPayload {
  const payload: TelemetryPayload = { install_id: installId, event, version, platform: process.platform };
  if (event === 'third_receipt' && days !== undefined) payload.days = days;
  return payload;
}

/**
 * Best-effort, at-most-once delivery of one event. Never throws, never retries within a
 * run, and never blocks longer than the timeout — a receipt must not depend on a network.
 * Failure leaves the event unmarked so a later run can try again.
 */
export async function sendEvent(
  dataHome: string,
  event: TelemetryEvent,
  version: string,
  options: { days?: number; timeoutMs?: number } = {},
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const config = readTelemetryConfig(dataHome);
    if (!config.enabled) return 'skipped';
    if (config.sent.includes(event)) return 'skipped';
    const { url, key } = telemetryEndpoint();
    if (url === '') return 'skipped';

    const installId = ensureInstallId(dataHome, config);
    const payload = buildPayload(installId, event, version, options.days);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      prefer: 'return=minimal,resolution=ignore-duplicates',
    };
    if (key !== '') {
      headers.apikey = key;
      headers.authorization = `Bearer ${key}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 2000),
    });
    if (!response.ok && response.status !== 409) return 'failed';

    writeTelemetryConfig(dataHome, { sent: [...config.sent, event] });
    return 'sent';
  } catch {
    return 'failed';
  }
}

export function describeTelemetry(dataHome: string, version: string): string {
  const config = readTelemetryConfig(dataHome);
  const { url } = telemetryEndpoint();
  const lines = [
    `Telemetry: ${config.enabled ? 'ON (you opted in at init)' : 'OFF'}`,
    `Collector: ${url === '' ? '(none configured — nothing can be sent)' : url}`,
  ];
  if (config.enabled) {
    lines.push(`Anonymous id: ${config.installId ?? '(not created yet)'}`);
    lines.push(`Already sent: ${config.sent.length === 0 ? '(nothing)' : config.sent.join(', ')}`);
    lines.push('', 'Two events, ever. This is the entire payload:');
    lines.push(JSON.stringify(buildPayload(config.installId ?? '<uuid>', 'third_receipt', version, 2), null, 2));
    lines.push('', 'No file names, no paths, no commands, no project or machine names.');
    lines.push('Turn it off with: agent-receipt telemetry off');
  } else {
    lines.push('', 'Nothing is sent. Turn it on with: agent-receipt telemetry on');
  }
  return lines.join('\n');
}
