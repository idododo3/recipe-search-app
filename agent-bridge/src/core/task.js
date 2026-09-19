/**
 * מודל המשימה ומכונת המצבים שלה.
 * המצבים והמעברים ביניהם הם המקור היחיד לאמת לגבי מחזור החיים של משימה.
 */

import { randomUUID } from 'node:crypto';

export const STATUS = Object.freeze({
  NEW: 'new',
  PLANNED: 'planned',
  WAITING_APPROVAL: 'waiting_approval',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  DONE: 'done',
});

export const ALL_STATUSES = Object.freeze(Object.values(STATUS));

/** מעברים חוקיים בלבד. כל מעבר אחר נדחה. */
const TRANSITIONS = Object.freeze({
  [STATUS.NEW]: [STATUS.PLANNED, STATUS.BLOCKED],
  [STATUS.PLANNED]: [STATUS.WAITING_APPROVAL, STATUS.RUNNING, STATUS.BLOCKED],
  [STATUS.WAITING_APPROVAL]: [STATUS.RUNNING, STATUS.BLOCKED],
  [STATUS.RUNNING]: [STATUS.WAITING_APPROVAL, STATUS.DONE, STATUS.BLOCKED],
  [STATUS.BLOCKED]: [STATUS.PLANNED, STATUS.WAITING_APPROVAL],
  [STATUS.DONE]: [],
});

export class TaskStateError extends Error {}
export class ValidationError extends Error {}

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const MAX_REPO = 200;
/** owner/repo בלבד — חוסם נתיבים, URL-ים ותווי מעטפת. */
const REPO_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;
/** מזהה משימה: UUID v4 בלבד, כדי שלא ישמש כנתיב קובץ. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** תווי בקרה שאין להם מקום בקלט טקסט חופשי (למעט שורה חדשה וטאב). */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function isValidTaskId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function requireText(value, field, max, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`שדה ${field} חייב להיות מחרוזת`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    throw new ValidationError(`שדה ${field} לא יכול להיות ריק`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`שדה ${field} ארוך מהמותר (${max} תווים)`);
  }
  if (CONTROL_RE.test(trimmed)) {
    throw new ValidationError(`שדה ${field} מכיל תווי בקרה אסורים`);
  }
  return trimmed;
}

/**
 * יוצר משימה חדשה אחרי ולידציה מלאה של הקלט.
 * קלט לא תקין נדחה כאן ולא נכנס לתור.
 */
export function createTask(input = {}, { now = () => new Date().toISOString() } = {}) {
  const title = requireText(input.title, 'title', MAX_TITLE);
  const description = requireText(input.description ?? '', 'description', MAX_DESCRIPTION, {
    allowEmpty: true,
  });

  let repo = null;
  if (input.repo !== undefined && input.repo !== null && input.repo !== '') {
    repo = requireText(input.repo, 'repo', MAX_REPO);
    if (!REPO_RE.test(repo)) {
      throw new ValidationError('שדה repo חייב להיות בצורה owner/repo');
    }
  }

  const timestamp = now();
  return {
    id: randomUUID(),
    title,
    description,
    repo,
    status: STATUS.NEW,
    createdAt: timestamp,
    updatedAt: timestamp,
    plan: null,
    pendingApproval: null,
    result: null,
    blockedReason: null,
    history: [{ at: timestamp, from: null, to: STATUS.NEW, reason: 'created' }],
  };
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * מחזיר עותק חדש של המשימה במצב היעד. לא משנה את המקור.
 * זורק TaskStateError אם המעבר אינו חוקי.
 */
export function transition(task, to, { reason = '', now = () => new Date().toISOString() } = {}) {
  if (!ALL_STATUSES.includes(to)) {
    throw new TaskStateError(`סטטוס לא מוכר: ${to}`);
  }
  if (!canTransition(task.status, to)) {
    throw new TaskStateError(`מעבר אסור: ${task.status} → ${to}`);
  }
  const at = now();
  return {
    ...task,
    status: to,
    updatedAt: at,
    blockedReason: to === STATUS.BLOCKED ? reason || task.blockedReason : null,
    history: [...task.history, { at, from: task.status, to, reason }],
  };
}
