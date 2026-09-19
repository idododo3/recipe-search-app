/**
 * שער האישורים. כל פעולה טעונת-אישור נעצרת כאן ומחכה להחלטה אנושית מפורשת.
 * אין מסלול עוקף: מי שמבקש לבצע פעולה חייב לקבל grant תקף לאותה משימה ולאותה פעולה.
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
    const pending = {
      requestId,
      action,
      summary,
      payload,
      requestedAt: this.#now(),
      decision: null,
    };
    this.#audit.record({
      actor: 'agent-bridge',
      action: 'approval.request',
      target: task.id,
      outcome: 'pending',
      details: { requestId, requestedAction: action, summary },
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
      details: { requestId: pending.requestId, requestedAction: pending.action, reason },
    });
    return { ...task, pendingApproval: decided };
  }

  /**
   * בודק האם מותר לבצע פעולה עכשיו.
   * זורק ApprovalRequiredError אם אין אישור, ApprovalDeniedError אם נדחתה.
   */
  assertAllowed(task, action) {
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
  }
}
