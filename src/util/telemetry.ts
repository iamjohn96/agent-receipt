import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePrivateDir } from './paths.js';

export interface TelemetryConfig {
  enabled: boolean;
}

export function readTelemetryConfig(dataHome: string): TelemetryConfig {
  const path = join(dataHome, 'config.json');
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return { enabled: Boolean(data.telemetry_enabled) };
    } catch {
      return { enabled: false };
    }
  }
  return { enabled: false };
}

export function writeTelemetryConfig(dataHome: string, config: TelemetryConfig): void {
  ensurePrivateDir(dataHome);
  const path = join(dataHome, 'config.json');
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8'));
    } catch { /* ignore */ }
  }
  existing.telemetry_enabled = config.enabled;
  writeFileSync(path, JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
}
