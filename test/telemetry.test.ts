import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPayload,
  describeTelemetry,
  readTelemetryConfig,
  sendEvent,
  writeTelemetryConfig,
} from '../src/util/telemetry.js';
import { tempDir } from './helpers.js';

const URL = 'https://collector.example/rest/v1/install_events';

function withCollector(): void {
  process.env.AGENT_RECEIPT_TELEMETRY_URL = URL;
  process.env.AGENT_RECEIPT_TELEMETRY_KEY = 'anon-key';
}

afterEach(() => {
  delete process.env.AGENT_RECEIPT_TELEMETRY_URL;
  delete process.env.AGENT_RECEIPT_TELEMETRY_KEY;
  vi.unstubAllGlobals();
});

describe('telemetry consent', () => {
  it('sends nothing when the user never opted in', async () => {
    const home = tempDir('tele');
    withCollector();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when opted in but no collector is configured', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    // An explicitly empty endpoint is the "unpublished build" state, and must stay silent
    // even for a user who said yes.
    process.env.AGENT_RECEIPT_TELEMETRY_URL = '';
    process.env.AGENT_RECEIPT_TELEMETRY_KEY = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opting out deletes the anonymous id and the sent history', () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true, installId: 'abc', sent: ['installed'] });
    expect(readTelemetryConfig(home).installId).toBe('abc');

    writeTelemetryConfig(home, { enabled: false });
    const after = readTelemetryConfig(home);
    expect(after.enabled).toBe(false);
    expect(after.installId).toBeUndefined();
    expect(after.sent).toEqual([]);
  });
});

describe('telemetry payload', () => {
  it('carries only the five documented fields and no identifying detail', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEvent(home, 'third_receipt', '0.0.3', { days: 2 })).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    // resolution=ignore-duplicates would make PostgREST upsert, which RLS rejects
    // without an UPDATE policy. Regression guard for the 09-18 401.
    const prefer = String((init.headers as Record<string, string>).prefer ?? '');
    expect(prefer).not.toContain('resolution');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['days', 'event', 'install_id', 'platform', 'version']);
    expect(body.event).toBe('third_receipt');
    expect(body.days).toBe(2);
    expect(body.version).toBe('0.0.3');
    expect(typeof body.install_id).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\/);
  });

  it('omits days for the installed event', () => {
    const payload = buildPayload('id-1', 'installed', '0.0.3', 5);
    expect(payload.days).toBeUndefined();
  });

  it('reuses one anonymous id across events', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));

    await sendEvent(home, 'installed', '0.0.3');
    const first = readTelemetryConfig(home).installId;
    await sendEvent(home, 'third_receipt', '0.0.3', { days: 3 });
    expect(readTelemetryConfig(home).installId).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('telemetry delivery is at-most-once and never fatal', () => {
  it('does not resend an event it already delivered', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('sent');
    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('skipped');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a network failure and stays retryable', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND'); }));

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('failed');
    expect(readTelemetryConfig(home).sent).toEqual([]);
  });

  it('treats a server error as retryable rather than delivered', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('failed');
    expect(readTelemetryConfig(home).sent).toEqual([]);
  });

  it('treats a duplicate as delivered', async () => {
    const home = tempDir('tele');
    writeTelemetryConfig(home, { enabled: true });
    withCollector();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 409 })));

    expect(await sendEvent(home, 'installed', '0.0.3')).toBe('sent');
    expect(readTelemetryConfig(home).sent).toEqual(['installed']);
  });
});

describe('telemetry is inspectable', () => {
  it('shows the exact payload when on, and says nothing is sent when off', () => {
    const home = tempDir('tele');
    expect(describeTelemetry(home, '0.0.3')).toMatch(/Telemetry: OFF/);

    writeTelemetryConfig(home, { enabled: true, installId: 'uuid-here' });
    withCollector();
    const text = describeTelemetry(home, '0.0.3');
    expect(text).toMatch(/Telemetry: ON/);
    expect(text).toContain('"install_id": "uuid-here"');
    expect(text).toContain(URL);
  });
});

describe('release hygiene', () => {
  it('keeps the CLI version in step with package.json', () => {
    const root = new globalThis.URL('..', import.meta.url).pathname;
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    const main = readFileSync(join(root, 'src/cli/main.ts'), 'utf8');
    const declared = /const VERSION = '([^']+)'/.exec(main)?.[1];
    expect(declared).toBe(pkg.version);
  });
});
