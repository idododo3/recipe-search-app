/**
 * האורקסטרציה: מחברת תור, runner, שער אישורים, adapter ו-audit.
 * זהו המקום היחיד שמקדם משימות בין מצבים.
 */

import { GitHubAdapter } from '../adapters/github.js';
import { MockCodeAgentRunner } from '../runners/mock-runner.js';
import { ApprovalGate, ApprovalDeniedError, ApprovalRequiredError } from './approval.js';
import { AuditLog } from './audit.js';
import { loadConfig } from './config.js';
import { ACTION, requiresApproval } from './policy.js';
import { TaskStore } from './store.js';
import { STATUS, createTask, transition } from './task.js';

function buildRunner(name) {
  if (name === 'mock') return new MockCodeAgentRunner();
  // אין נתיב שקט ל-runner לא מוכר: כישלון מפורש עדיף על ביצוע לא צפוי.
  throw new Error(`runner לא מוכר: ${name}. ב-MVP קיים רק "mock".`);
}

export class AgentBridge {
  constructor({ config = loadConfig(), audit, store, runner, github, now } = {}) {
    this.config = config;
    this.now = now ?? (() => new Date().toISOString());
    this.audit = audit ?? new AuditLog({ dir: config.dataDir, now: this.now });
    this.store = store ?? new TaskStore({ dir: config.dataDir });
    this.runner = runner ?? buildRunner(config.runner);
    this.gate = new ApprovalGate({ audit: this.audit, now: this.now });
    this.github =
      github ??
      new GitHubAdapter({ mode: config.githubMode, token: config.githubToken, audit: this.audit });
  }

  #save(task, action, details = {}, outcome = 'ok') {
    this.store.save(task);
    this.audit.record({
      actor: 'agent-bridge',
      action,
      target: task.id,
      outcome,
      details: { status: task.status, ...details },
    });
    return task;
  }

  submit(input) {
    const task = createTask(input, { now: this.now });
    return this.#save(task, 'task.submit', { title: task.title, repo: task.repo });
  }

  get(id) {
    return this.store.get(id);
  }

  list(options) {
    return this.store.list(options);
  }

  /** התור: משימות שממתינות לקידום כלשהו. */
  queue() {
    return this.store.queue([STATUS.NEW, STATUS.PLANNED, STATUS.WAITING_APPROVAL, STATUS.RUNNING]);
  }

  async plan(id) {
    const task = this.#require(id);
    const steps = await this.runner.plan(task);
    const planned = transition({ ...task, plan: { steps, runner: this.runner.name } }, STATUS.PLANNED, {
      reason: 'תוכנית נוצרה',
      now: this.now,
    });
    return this.#save(planned, 'task.plan', { steps: steps.length, runner: this.runner.name });
  }

  /**
   * מריץ את המשימה עד לסיום או עד לצעד שדורש אישור.
   * צעד טעון-אישור מייצר בקשה ומעביר את המשימה ל-waiting_approval.
   */
  async run(id) {
    let task = this.#require(id);
    if (!task.plan) {
      throw new Error('אין תוכנית למשימה. יש להריץ plan תחילה.');
    }

    if (task.status !== STATUS.RUNNING) {
      task = this.#save(
        transition(task, STATUS.RUNNING, { reason: 'התחלת ריצה', now: this.now }),
        'task.run.start',
      );
    }

    const completed = new Set(task.result?.completedSteps ?? []);

    for (const [index, step] of task.plan.steps.entries()) {
      if (completed.has(index)) continue;

      if (requiresApproval(step.action)) {
        try {
          this.gate.assertAllowed(task, step.action);
        } catch (err) {
          if (err instanceof ApprovalRequiredError) {
            const requested = this.gate.request(task, {
              action: step.action,
              summary: step.summary,
              payload: step.payload,
            });
            task = this.#save(
              transition(requested, STATUS.WAITING_APPROVAL, {
                reason: `ממתין לאישור: ${step.action}`,
                now: this.now,
              }),
              'task.run.pause',
              { waitingFor: step.action, requestId: requested.pendingApproval.requestId },
              'pending',
            );
            return task;
          }
          if (err instanceof ApprovalDeniedError) {
            task = this.#save(
              transition(task, STATUS.BLOCKED, { reason: err.message, now: this.now }),
              'task.run.blocked',
              { deniedAction: step.action },
              'denied',
            );
            return task;
          }
          throw err;
        }
      }

      const outcome = await this.#executeStep(task, step);
      if (!outcome.ok) {
        task = this.#save(
          transition(task, STATUS.BLOCKED, { reason: outcome.summary, now: this.now }),
          'task.step.fail',
          { action: step.action, summary: outcome.summary },
          'error',
        );
        return task;
      }

      completed.add(index);
      task = {
        ...task,
        // אישור שנוצל נסגר, כדי שלא ישמש שוב לצעד אחר.
        pendingApproval: requiresApproval(step.action) ? null : task.pendingApproval,
        result: {
          completedSteps: [...completed],
          artifacts: { ...(task.result?.artifacts ?? {}), [step.action]: outcome.artifacts },
        },
      };
      this.#save(task, 'task.step.ok', { action: step.action, summary: outcome.summary });
    }

    task = this.#save(
      transition(task, STATUS.DONE, { reason: 'כל הצעדים הושלמו', now: this.now }),
      'task.done',
    );
    return task;
  }

  async #executeStep(task, step) {
    // צעדים חיצוניים עוברים דרך ה-adapter (dry run), השאר דרך ה-runner.
    if (step.action === ACTION.GIT_PUSH) {
      const plan = await this.github.push({ repo: task.repo, branch: step.payload.branch });
      return { ok: true, summary: `push (dry run): ${plan.wouldRun}`, artifacts: plan };
    }
    if (step.action === ACTION.OPEN_PR) {
      const plan = await this.github.openPullRequest({
        repo: task.repo,
        branch: step.payload.branch,
        title: step.payload.title,
        body: step.payload.body,
      });
      return { ok: true, summary: `PR (dry run): ${plan.url}`, artifacts: plan };
    }
    return this.runner.execute(task, step, { github: this.github });
  }

  approve(id, requestId, { approver = this.config.approver, reason = '' } = {}) {
    const task = this.#require(id);
    const decided = this.gate.approve(task, requestId, { approver, reason });
    return this.#save(decided, 'task.approve', { requestId, approver });
  }

  deny(id, requestId, { approver = this.config.approver, reason = '' } = {}) {
    const task = this.#require(id);
    const decided = this.gate.deny(task, requestId, { approver, reason });
    const blocked = transition(decided, STATUS.BLOCKED, {
      reason: `האישור נדחה: ${reason || 'ללא נימוק'}`,
      now: this.now,
    });
    return this.#save(blocked, 'task.deny', { requestId, approver }, 'denied');
  }

  #require(id) {
    const task = this.store.get(id);
    if (!task) throw new Error(`משימה לא נמצאה: ${id}`);
    return task;
  }
}
