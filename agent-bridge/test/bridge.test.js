import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACTION } from '../src/core/policy.js';
import { STATUS } from '../src/core/task.js';
import { makeBridge } from './helpers.js';

test('זרימה מלאה: submit → plan → run נעצר לאישור → approve → done', async () => {
  const { bridge, cleanup } = makeBridge();
  try {
    const submitted = bridge.submit({ title: 'הוסף בדיקה', repo: 'owner/repo' });
    assert.equal(submitted.status, STATUS.NEW);

    const planned = await bridge.plan(submitted.id);
    assert.equal(planned.status, STATUS.PLANNED);
    assert.ok(planned.plan.steps.length > 0);

    // עצירה ראשונה: push.
    let task = await bridge.run(submitted.id);
    assert.equal(task.status, STATUS.WAITING_APPROVAL);
    assert.equal(task.pendingApproval.action, ACTION.GIT_PUSH);

    bridge.approve(task.id, task.pendingApproval.requestId, { reason: 'בסדר' });

    // עצירה שנייה: פתיחת PR — אישור אחד לא מכסה את הפעולה הבאה.
    task = await bridge.run(task.id);
    assert.equal(task.status, STATUS.WAITING_APPROVAL);
    assert.equal(task.pendingApproval.action, ACTION.OPEN_PR);

    bridge.approve(task.id, task.pendingApproval.requestId, { reason: 'בסדר' });
    task = await bridge.run(task.id);

    assert.equal(task.status, STATUS.DONE);
    assert.match(task.result.artifacts[ACTION.OPEN_PR].url, /DRY-RUN$/);
    assert.equal(bridge.audit.verify().valid, true);
  } finally {
    cleanup();
  }
});

test('דחיית אישור חוסמת את המשימה', async () => {
  const { bridge, cleanup } = makeBridge();
  try {
    const submitted = bridge.submit({ title: 'משימה', repo: 'owner/repo' });
    await bridge.plan(submitted.id);
    const paused = await bridge.run(submitted.id);
    const denied = bridge.deny(paused.id, paused.pendingApproval.requestId, { reason: 'לא מאושר' });
    assert.equal(denied.status, STATUS.BLOCKED);
    assert.match(denied.blockedReason, /נדחה/);
  } finally {
    cleanup();
  }
});

test('אי אפשר להריץ משימה בלי תוכנית', async () => {
  const { bridge, cleanup } = makeBridge();
  try {
    const submitted = bridge.submit({ title: 'משימה' });
    await assert.rejects(() => bridge.run(submitted.id), /אין תוכנית/);
  } finally {
    cleanup();
  }
});

test('התור שומר סדר FIFO ומדלג על משימות שהסתיימו', async () => {
  const { bridge, cleanup } = makeBridge();
  try {
    const first = bridge.submit({ title: 'ראשונה' });
    const second = bridge.submit({ title: 'שנייה' });
    const ids = bridge.queue().map((t) => t.id);
    assert.deepEqual(ids, [first.id, second.id]);
  } finally {
    cleanup();
  }
});

test('מזהה לא קיים או לא חוקי אינו מחזיר משימה', async () => {
  const { bridge, cleanup } = makeBridge();
  try {
    assert.equal(bridge.get('../../etc/passwd'), null);
    assert.equal(bridge.get('00000000-0000-4000-8000-000000000000'), null);
  } finally {
    cleanup();
  }
});

test('המצב נשמר ונטען מחדש מהדיסק', async () => {
  const { bridge, dir, cleanup } = makeBridge();
  try {
    const submitted = bridge.submit({ title: 'נשמר' });
    await bridge.plan(submitted.id);
    const { AgentBridge } = await import('../src/core/bridge.js');
    const reloaded = new AgentBridge({
      config: { dataDir: dir, githubMode: 'dry_run', githubToken: null, approver: 't', runner: 'mock' },
    });
    assert.equal(reloaded.get(submitted.id).status, STATUS.PLANNED);
  } finally {
    cleanup();
  }
});
