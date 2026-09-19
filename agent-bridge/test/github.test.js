import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { GitHubAdapter, LiveModeNotImplementedError } from '../src/adapters/github.js';
import { AuditLog } from '../src/core/audit.js';

function makeAudit() {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-bridge-gh-'));
  return { audit: new AuditLog({ dir }), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('ברירת המחדל היא dry run, ו-push מחזיר תיאור בלבד', async () => {
  const { audit, cleanup } = makeAudit();
  try {
    const gh = new GitHubAdapter({ audit });
    assert.ok(gh.isDryRun);
    const plan = await gh.push({ repo: 'owner/repo', branch: 'feature/x' });
    assert.equal(plan.dryRun, true);
    assert.equal(plan.wouldRun, 'git push -u origin feature/x');
    assert.equal(audit.read().at(-1).outcome, 'dry_run');
  } finally {
    cleanup();
  }
});

test('פתיחת PR ב-dry run לא יוצרת PR אמיתי', async () => {
  const { audit, cleanup } = makeAudit();
  try {
    const gh = new GitHubAdapter({ audit });
    const plan = await gh.openPullRequest({
      repo: 'owner/repo',
      branch: 'feature/x',
      title: 'כותרת',
      body: 'גוף',
    });
    assert.equal(plan.dryRun, true);
    assert.match(plan.url, /DRY-RUN$/);
  } finally {
    cleanup();
  }
});

test('מצב live חסום ונרשם ל-audit, גם כשיש טוקן', async () => {
  const { audit, cleanup } = makeAudit();
  try {
    const gh = new GitHubAdapter({ mode: 'live', token: 'placeholder', audit });
    await assert.rejects(() => gh.push({ repo: 'owner/repo', branch: 'x' }), LiveModeNotImplementedError);
    const entry = audit.read().at(-1);
    assert.equal(entry.outcome, 'blocked');
    assert.equal(entry.details.authConfigured, true);
  } finally {
    cleanup();
  }
});
