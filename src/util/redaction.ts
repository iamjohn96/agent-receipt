// Key-based redaction ported from agent-permission-guard src/audit/redaction.ts,
// extended with value-pattern redaction: shell commands are plain strings, so a
// key-only redactor lets `export OPENAI_API_KEY=sk-...` through unchanged.
const SECRET_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|passwd|private[_-]?key|secret|token)/i;
const MAX_DEPTH = 12;
const MAX_COLLECTION_ITEMS = 100;
const DEFAULT_MAX_STRING_LENGTH = 2048;

const VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g,          // OpenAI / Anthropic style keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,                    // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,                  // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                            // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g,                        // Google API key
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
];
// NAME=value / NAME: value where NAME looks secret. Keeps the name, hides the value.
const ASSIGNMENT = /\b([A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CREDENTIALS?)[A-Za-z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s'"]+)/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// URL credentials: scheme://user:pass@host
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi;

export function redactString(value: string, maxLength = DEFAULT_MAX_STRING_LENGTH): string {
  let result = value;
  for (const pattern of VALUE_PATTERNS) result = result.replace(pattern, '[REDACTED]');
  result = result.replace(ASSIGNMENT, (_m, name: string, sep: string) => `${name}${sep}[REDACTED]`);
  result = result.replace(BEARER, (_m, scheme: string) => `${scheme} [REDACTED]`);
  result = result.replace(URL_CREDENTIALS, '$1[REDACTED]@');
  return result.length <= maxLength ? result : `${result.slice(0, maxLength)}[TRUNCATED]`;
}

export function redactValue(value: unknown): unknown {
  return redact(value, 0, new WeakSet<object>());
}

function redact(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED:DEPTH]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return '[UNDEFINED]';
  if (typeof value !== 'object') return `[${String(typeof value).toUpperCase()}]`;
  if (ancestors.has(value)) return '[CIRCULAR]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => redact(item, depth + 1, ancestors));
      if (value.length > MAX_COLLECTION_ITEMS) result.push(`[TRUNCATED:${value.length - MAX_COLLECTION_ITEMS}_ITEMS]`);
      return result;
    }
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_COLLECTION_ITEMS);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      result[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(nested, depth + 1, ancestors);
    }
    if (Object.keys(value).length > MAX_COLLECTION_ITEMS) {
      result.__truncated__ = `${Object.keys(value).length - MAX_COLLECTION_ITEMS} fields`;
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}
