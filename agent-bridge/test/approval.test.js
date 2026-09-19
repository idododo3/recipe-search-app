import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  ApprovalDeniedError,
  ApprovalGate,
  ApprovalParamsMismatchError,
  ApprovalRequiredError,
  fingerprint,
} from '../src/core/approval.js';
import { AuditLog } from '../src/core/audit.js';
import { ACTION, requiresApproval } from '../src/core/policy.js';
import { createTask } from '../src/core/task.js';

function makeGate(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-bridge-gate-'));
  const audit = new AuditLog({ dir });
  return {
    gate: new ApprovalGate({ audit, ...options }),
    audit,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('המדיניות מסמנת push, PR, deploy, delete ושינוי הרשאות כטעוני אישור', () => {
  for (const action of [
    ACTION.GIT_PUSH,
    ACTION.OPEN_PR,
    ACTION.DEPLOY,
    ACTION.DELETE,
    ACTION.CHANGE_PERMISSIONS,
  ]) {
    assert.ok(requiresApproval(action), action);
  }
  assert.ok(!requiresApproval(ACTION.RUN_TESTS));
  // ברירת מחדל deny: פעולה לא מוכרת נחשבת מסוכנת.
  assert.ok(requiresApproval('something_new'));
});

test('פעולה טעונת אישור נחסמת ללא אישור', () => {
  const { gate, cleanup } = makeGate();
  try {
    const task = createTask({ title: 'x' });
    assert.throws(() => gate.assertAllowed(task, ACTION.GIT_PUSH), ApprovalRequiredError);
    // פעולה מקומית עוברת בלי אישור.
    gate.assertAllowed(task, ACTION.RUN_TESTS);
  } finally {
    cleanup();
  }
});

test('אישור פותח בדיוק את הפעולה שאושרה ולא אחרת', () => {
  const { gate, cleanup } = makeGate();
  try {
    let task = createTask({ title: 'x' });
    task = gate.request(task, { action: ACTION.GIT_PUSH, summary: 'push' });
    task = gate.approve(task, task.pendingApproval.requestId, { approver: 'tester' });
    gate.assertAllowed(task, ACTION.GIT_PUSH);
    assert.throws(() => gate.assertAllowed(task, ACTION.DEPLOY), ApprovalRequiredError);
  } finally {
    cleanup();
  }
});

test('requestId שגוי נדחה', () => {
  const { gate, cleanup } = makeGate();
  try {
    let task = createTask({ title: 'x' });
    task = gate.request(task, { action: ACTION.OPEN_PR, summary: 'pr' });
    assert.throws(() => gate.approve(task, 'not-the-right-id', { approver: 'tester' }), /אינו תואם/);
  } finally {
    cleanup();
  }
});

test('דחייה מייצרת ApprovalDeniedError', () => {
  const { gate, cleanup } = makeGate();
  try {
    let task = createTask({ title: 'x' });
    task = gate.request(task, { action: ACTION.DEPLOY, summary: 'deploy' });
    task = gate.deny(task, task.pendingApproval.requestId, { approver: 'tester', reason: 'לא עכשיו' });
    assert.throws(() => gate.assertAllowed(task, ACTION.DEPLOY), ApprovalDeniedError);
  } finally {
    cleanup();
  }
});

test('אישור פג תוקף אינו תקף יותר', () => {
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const { gate, cleanup } = makeGate({
    now: () => new Date(clock).toISOString(),
    ttlMs: 1000,
  });
  try {
    let task = createTask({ title: 'x' });
    task = gate.request(task, { action: ACTION.GIT_PUSH, summary: 'push' });
    task = gate.approve(task, task.pendingApproval.requestId, { approver: 'tester' });
    gate.assertAllowed(task, ACTION.GIT_PUSH);
    clock += 5000;
    assert.throws(() => gate.assertAllowed(task, ACTION.GIT_PUSH), ApprovalRequiredError);
  } finally {
    cleanup();
  }
});

test('אישור קשור לפרמטרים המדויקים: שינוי payload פוסל אותו', () => {
  const { gate, cleanup } = makeGate();
  try {
    let task = createTask({ title: 'x' });
    task = gate.request(task, {
      action: ACTION.GIT_PUSH,
      summary: 'push',
      payload: { branch: 'agent-bridge/safe' },
    });
    task = gate.approve(task, task.pendingApproval.requestId, { approver: 'tester' });

    // אותם פרמטרים — עובר.
    gate.assertAllowed(task, ACTION.GIT_PUSH, { branch: 'agent-bridge/safe' });

    // ענף אחר — נפסל.
    assert.throws(
      () => gate.assertAllowed(task, ACTION.GIT_PUSH, { branch: 'main' }),
      ApprovalParamsMismatchError,
    );
    // שדה שנוסף — נפסל.
    assert.throws(
      () => gate.assertAllowed(task, ACTION.GIT_PUSH, { branch: 'agent-bridge/safe', force: true }),
      ApprovalParamsMismatchError,
    );
    // payload חסר — נפסל.
    assert.throws(() => gate.assertAllowed(task, ACTION.GIT_PUSH, {}), ApprovalParamsMismatchError);
  } finally {
    cleanup();
  }
});

test('סדר המפתחות ב-payload אינו משנה את טביעת האצבע', () => {
  assert.equal(
    fingerprint(ACTION.OPEN_PR, { a: 1, b: { c: 2, d: 3 } }),
    fingerprint(ACTION.OPEN_PR, { b: { d: 3, c: 2 }, a: 1 }),
  );
  assert.notEqual(fingerprint(ACTION.OPEN_PR, { a: 1 }), fingerprint(ACTION.GIT_PUSH, { a: 1 }));
});
