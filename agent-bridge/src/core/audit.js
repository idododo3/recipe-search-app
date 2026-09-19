/**
 * Audit log append-only בפורמט JSONL, עם שרשרת hash.
 * כל רשומה מכילה את ה-hash של קודמתה, כך שמחיקה או עריכה רטרואקטיבית
 * שוברת את השרשרת ומתגלה ב-verify().
 */

import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { redact } from './config.js';

const GENESIS = '0'.repeat(64);

function hashEntry(entry) {
  const canonical = JSON.stringify([
    entry.seq,
    entry.at,
    entry.actor,
    entry.action,
    entry.target,
    entry.outcome,
    entry.details,
    entry.prevHash,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

export class AuditLog {
  #file;
  #now;

  constructor({ dir, file = 'audit.jsonl', now = () => new Date().toISOString() }) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.#file = path.join(dir, file);
    this.#now = now;
    try {
      writeFileSync(this.#file, '', { flag: 'ax', mode: 0o600 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  get file() {
    return this.#file;
  }

  read() {
    const text = readFileSync(this.#file, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  }

  /**
   * רושם פעולה. details עובר redaction לפני הכתיבה,
   * כך שסוד לא יכול להגיע ליומן גם אם הועבר בטעות.
   */
  record({ actor, action, target = null, outcome = 'ok', details = {} }) {
    const entries = this.read();
    const prev = entries.at(-1);
    const entry = {
      seq: entries.length + 1,
      at: this.#now(),
      actor: String(actor),
      action: String(action),
      target: target === null ? null : String(target),
      outcome: String(outcome),
      details: redact(details),
      prevHash: prev ? prev.hash : GENESIS,
    };
    entry.hash = hashEntry(entry);
    appendFileSync(this.#file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    return entry;
  }

  /** בודק שהשרשרת שלמה. מחזיר { valid, brokenAt }. */
  verify() {
    let prevHash = GENESIS;
    const entries = this.read();
    for (const [index, entry] of entries.entries()) {
      if (entry.prevHash !== prevHash || entry.seq !== index + 1) {
        return { valid: false, brokenAt: index + 1, count: entries.length };
      }
      const { hash, ...rest } = entry;
      if (hashEntry(rest) !== hash) {
        return { valid: false, brokenAt: index + 1, count: entries.length };
      }
      prevHash = hash;
    }
    return { valid: true, brokenAt: null, count: entries.length };
  }
}
