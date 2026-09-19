import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { AuditLog } from '../src/core/audit.js';

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), 'agent-bridge-audit-'));
}

test('כל רשומה נשמרת ושרשרת ה-hash תקינה', () => {
  const dir = tempDir();
  try {
    const audit = new AuditLog({ dir });
    audit.record({ actor: 'a', action: 'x' });
    audit.record({ actor: 'b', action: 'y', target: 't' });
    const entries = audit.read();
    assert.equal(entries.length, 2);
    assert.equal(entries[1].prevHash, entries[0].hash);
    assert.deepEqual(audit.verify(), { valid: true, brokenAt: null, count: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('סודות ב-details מורעלים לפני הכתיבה לדיסק', () => {
  const dir = tempDir();
  try {
    const audit = new AuditLog({ dir });
    audit.record({ actor: 'a', action: 'x', details: { githubToken: 'sk-super-secret' } });
    const raw = readFileSync(audit.file, 'utf8');
    assert.ok(!raw.includes('sk-super-secret'));
    assert.ok(raw.includes('[redacted]'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('עריכה רטרואקטיבית שוברת את השרשרת ומתגלה', () => {
  const dir = tempDir();
  try {
    const audit = new AuditLog({ dir });
    audit.record({ actor: 'a', action: 'first' });
    audit.record({ actor: 'b', action: 'second' });
    const entries = audit.read();
    entries[0].action = 'tampered';
    writeFileSync(audit.file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
    const result = audit.verify();
    assert.equal(result.valid, false);
    assert.equal(result.brokenAt, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
