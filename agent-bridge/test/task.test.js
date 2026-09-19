import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STATUS,
  TaskStateError,
  ValidationError,
  canTransition,
  createTask,
  transition,
} from '../src/core/task.js';

test('משימה חדשה נוצרת במצב new עם מזהה תקין', () => {
  const task = createTask({ title: 'תקן באג' });
  assert.equal(task.status, STATUS.NEW);
  assert.match(task.id, /^[0-9a-f-]{36}$/);
  assert.equal(task.history.length, 1);
});

test('ולידציה דוחה כותרת ריקה, ארוכה מדי או עם תווי בקרה', () => {
  assert.throws(() => createTask({ title: '   ' }), ValidationError);
  assert.throws(() => createTask({ title: 'a'.repeat(201) }), ValidationError);
  assert.throws(() => createTask({ title: 'ok\u0000bad' }), ValidationError);
  assert.throws(() => createTask({ title: 123 }), ValidationError);
});

test('ולידציה דוחה repo שאינו owner/repo', () => {
  for (const repo of ['../../etc', 'https://github.com/a/b', 'a/b/c', 'a b/c', 'owner']) {
    assert.throws(() => createTask({ title: 'x', repo }), ValidationError, repo);
  }
  assert.equal(createTask({ title: 'x', repo: 'owner/repo' }).repo, 'owner/repo');
});

test('מכונת המצבים מתירה רק מעברים חוקיים', () => {
  assert.ok(canTransition(STATUS.NEW, STATUS.PLANNED));
  assert.ok(canTransition(STATUS.WAITING_APPROVAL, STATUS.RUNNING));
  assert.ok(!canTransition(STATUS.NEW, STATUS.DONE));
  assert.ok(!canTransition(STATUS.DONE, STATUS.RUNNING));
});

test('transition לא משנה את המקור וזורק על מעבר אסור', () => {
  const task = createTask({ title: 'x' });
  const planned = transition(task, STATUS.PLANNED);
  assert.equal(task.status, STATUS.NEW);
  assert.equal(planned.status, STATUS.PLANNED);
  assert.throws(() => transition(task, STATUS.DONE), TaskStateError);
  assert.throws(() => transition(task, 'made_up'), TaskStateError);
});

test('מעבר ל-blocked שומר את הסיבה', () => {
  const blocked = transition(createTask({ title: 'x' }), STATUS.BLOCKED, { reason: 'אין הרשאה' });
  assert.equal(blocked.blockedReason, 'אין הרשאה');
});
