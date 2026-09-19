/**
 * שער האישורים. כל פעולה טעונת-אישור נעצרת כאן ומחכה להחלטה אנושית מפורשת.
 *
 * האישור קשור לא רק לסוג הפעולה אלא גם לפרמטרים המדויקים שלה: בזמן הבקשה
 * מחושבת טביעת אצבע (SHA-256) של הפעולה יחד עם ה-payload שלה, והיא נשמרת
 * בתוך ההחלטה. לפני הביצוע הטביעה מחושבת מחדש מהפרמטרים שעומדים לרוץ בפועל
 * ומושווית. כך אישור ל-push לענף X אינו מאשר push לענף Y, ושינוי התוכנית
 * אחרי האישור פוסל אותו.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { describeAction, requiresApproval } from './policy.js';

export class ApprovalRequiredError extends Error {
  constructor(action, requestId) {
    super(`הפעולה "${describeAction(action)}" דורשת אישור מפורש`);
    this.name = 'ApprovalRequiredError';
    this.action = action;
    this.requestId = requestId;
  }
}

export class ApprovalDeniedError extends Error {
  constructor(action, reason) {
    super(`הפעולה "${describeAction(action)}" נדחתה: ${reason || 'ללא נימוק'}`);
    this.name = 'ApprovalDeniedError';
    this.action = action;
  }
}

/** הפרמטרים שעומדים לרוץ אינם אלה שאושרו — האישור בטל. */
export class ApprovalParamsMismatchError extends Error {
  constructor(action) {
    super(
      `הפרמטרים של "${describeAction(action)}" שונים מאלה שאושרו. האישור בטל ונדרש אישור חדש.`,
    );
    this.name = 'ApprovalParamsMismatchError';
    this.action = action;
  }
}

/**
 * סריאליזציה קנונית: מפתחות ממוינים בכל עומק, כך שאותו תוכן נותן תמיד
 * אותה מחרוזת ללא תלות בסדר ההכנסה.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** טביעת אצבע של פעולה + הפרמטרים המדויקים שלה. */
export function fingerprint(action, payload) {
  return createHash('sha256').update(canonicalize({ action, payload: payload ?? {} })).digest('hex');
}

/** משווה אסימונים בזמן קבוע, כדי לא לדלוף מידע דרך זמן ההשוואה. */
function tokensMatch(a, b) {
  const bufA = createHash('sha256').update(String(a)).digest();
  const bufB = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(bufA, bufB);
}

export class ApprovalGate {
  #audit;
  #now;
  #ttlMs;

  constructor({ audit, now = () => new Date().toISOString(), ttlMs = 60 * 60 * 1000 }) {
    this.#audit = audit;
    this.#now = now;
    this.#ttlMs = ttlMs;
  }

  /** יוצר בקשת אישור ומחזיר את המשימה במצב waiting_approval. */
  request(task, { action, summary, payload = {} }) {
    const requestId = randomUUID();
    const paramsHash = fingerprint(action, payload);
    const pending = {
      requestId,
      action,
      summary,
      payload,
      paramsHash,
      requestedAt: this.#now(),
      decision: null,
    };
    this.#audit.record({
      actor: 'agent-bridge',
      action: 'approval.request',
      target: task.id,
      outcome: 'pending',
      details: { requestId, requestedAction: action, summary, paramsHash },
    });
    return { ...task, pendingApproval: pending };
  }

  /** מאשר בקשה קיימת. דורש התאמה מדויקת של requestId. */
  approve(task, requestId, { approver, reason = '' }) {
    return this.#decide(task, requestId, 'approved', { approver, reason });
  }

  deny(task, requestId, { approver, reason = '' }) {
    return this.#decide(task, requestId, 'denied', { approver, reason });
  }

  #decide(task, requestId, decision, { approver, reason }) {
    const pending = task.pendingApproval;
    if (!pending) {
      throw new Error('אין בקשת אישור פתוחה למשימה זו');
    }
    if (pending.decision) {
      throw new Error('הבקשה כבר הוכרעה');
    }
    if (!tokensMatch(pending.requestId, requestId)) {
      this.#audit.record({
        actor: String(approver),
        action: 'approval.decide',
        target: task.id,
        outcome: 'rejected',
        details: { why: 'requestId לא תואם' },
      });
      throw new Error('מזהה בקשת האישור אינו תואם');
    }

    const decided = {
      ...pending,
      decision,
      decidedAt: this.#now(),
      approver: String(approver),
      reason: String(reason),
    };
    this.#audit.record({
      actor: String(approver),
      action: 'approval.decide',
      target: task.id,
      outcome: decision,
      details: {
        requestId: pending.requestId,
        requestedAction: pending.action,
        paramsHash: pending.paramsHash,
        reason,
      },
    });
    return { ...task, pendingApproval: decided };
  }

  /**
   * בודק האם מותר לבצע את הפעולה עם הפרמטרים האלה, עכשיו.
   *
   * זורק ApprovalRequiredError אם אין אישור או שפג תוקפו,
   * ApprovalDeniedError אם נדחתה,
   * ו-ApprovalParamsMismatchError אם הפרמטרים שונים מאלה שאושרו.
   */
  assertAllowed(task, action, payload = {}) {
    if (!requiresApproval(action)) return;

    const pending = task.pendingApproval;
    if (!pending || pending.action !== action) {
      throw new ApprovalRequiredError(action, pending?.requestId ?? null);
    }
    if (pending.decision === 'denied') {
      throw new ApprovalDeniedError(action, pending.reason);
    }
    if (pending.decision !== 'approved') {
      throw new ApprovalRequiredError(action, pending.requestId);
    }
    const age = Date.parse(this.#now()) - Date.parse(pending.decidedAt);
    if (!Number.isFinite(age) || age > this.#ttlMs) {
      throw new ApprovalRequiredError(action, pending.requestId);
    }
    // הבדיקה האחרונה ולא הראשונה: קודם מוודאים שיש בכלל אישור תקף,
    // ורק אז שהוא מתאים לפרמטרים שעומדים לרוץ.
    if (!tokensMatch(pending.paramsHash ?? '', fingerprint(action, payload))) {
      this.#audit.record({
        actor: 'agent-bridge',
        action: 'approval.params_mismatch',
        target: task.id,
        outcome: 'blocked',
        details: {
          requestId: pending.requestId,
          requestedAction: action,
          approvedHash: pending.paramsHash ?? null,
          attemptedHash: fingerprint(action, payload),
        },
      });
      throw new ApprovalParamsMismatchError(action);
    }
  }
}
