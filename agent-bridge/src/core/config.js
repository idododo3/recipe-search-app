/**
 * טעינת הגדרות. סודות מגיעים אך ורק מ-.env (או ממשתני סביבה של התהליך).
 * אין ערכי ברירת מחדל לסודות, ואין סודות בקוד.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** שמות שדות שערכם לעולם לא יודפס ולא ייכתב ל-audit. */
const SECRET_HINTS = ['token', 'secret', 'password', 'passwd', 'apikey', 'api_key', 'key', 'credential'];

export function isSecretName(name) {
  const lower = String(name).toLowerCase();
  return SECRET_HINTS.some((hint) => lower.includes(hint));
}

/**
 * מחליף ערכי שדות רגישים ב-[redacted], רקורסיבית.
 * זהו המסנן היחיד שדרכו עוברים נתונים אל הלוגים.
 */
export function redact(value, depth = 0) {
  if (depth > 8) return '[depth-limit]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSecretName(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

/** פרסור .env מינימלי: KEY=VALUE, תומך בגרשיים ובהערות. */
export function parseEnv(text) {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    result[key] = value;
  }
  return result;
}

/**
 * טוען את .env אם קיים. משתני סביבה קיימים גוברים על הקובץ,
 * כך שאפשר להריץ בלי לכתוב סודות לדיסק.
 */
export function loadConfig({ cwd = process.cwd(), env = process.env } = {}) {
  let fileValues = {};
  try {
    fileValues = parseEnv(readFileSync(path.join(cwd, '.env'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const merged = { ...fileValues, ...env };
  const mode = (merged.GITHUB_MODE ?? 'dry_run').toLowerCase();
  if (!['dry_run', 'live'].includes(mode)) {
    throw new Error(`GITHUB_MODE לא חוקי: ${mode}`);
  }

  const dataDir = merged.AGENT_BRIDGE_DATA_DIR
    ? path.resolve(cwd, merged.AGENT_BRIDGE_DATA_DIR)
    : path.join(cwd, '.agent-bridge-data');

  return {
    dataDir,
    githubMode: mode,
    githubToken: merged.GITHUB_TOKEN ?? null,
    approver: merged.AGENT_BRIDGE_APPROVER ?? 'local-operator',
    runner: (merged.AGENT_BRIDGE_RUNNER ?? 'mock').toLowerCase(),
  };
}
