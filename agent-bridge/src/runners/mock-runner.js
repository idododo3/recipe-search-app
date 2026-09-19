/**
 * מימוש mock של סוכן קוד: דטרמיניסטי, ללא רשת, ללא shell, ללא כתיבה לדיסק.
 * מטרתו לאפשר לבדוק את זרימת התור, המצבים, האישורים וה-audit מקצה לקצה
 * בלי להריץ שום קוד חיצוני.
 */

import { ACTION } from '../core/policy.js';
import { Runner } from './runner.js';

export class MockCodeAgentRunner extends Runner {
  #diffLines;

  constructor({ diffLines = 12 } = {}) {
    super();
    this.#diffLines = diffLines;
  }

  get name() {
    return 'mock';
  }

  async plan(task) {
    const branch = `agent-bridge/${task.id.slice(0, 8)}`;
    return [
      {
        action: ACTION.READ_REPO,
        summary: `קריאת הקוד הרלוונטי למשימה "${task.title}"`,
        payload: { repo: task.repo },
      },
      {
        action: ACTION.WRITE_WORKSPACE,
        summary: 'כתיבת השינוי בסביבת עבודה מבודדת',
        payload: { branch },
      },
      {
        action: ACTION.RUN_TESTS,
        summary: 'הרצת בדיקות בסביבה המבודדת',
        payload: {},
      },
      {
        action: ACTION.GIT_COMMIT,
        summary: 'יצירת קומיט מקומי',
        payload: { branch, message: task.title },
      },
      {
        action: ACTION.GIT_PUSH,
        summary: `דחיפת הענף ${branch} לרימוט`,
        payload: { branch },
      },
      {
        action: ACTION.OPEN_PR,
        summary: 'פתיחת Pull Request לבדיקה אנושית',
        payload: { branch, title: task.title, body: task.description },
      },
    ];
  }

  async execute(task, step) {
    switch (step.action) {
      case ACTION.READ_REPO:
        return { ok: true, summary: 'נקראו קבצים (mock)', artifacts: { filesRead: 3 } };
      case ACTION.WRITE_WORKSPACE:
        return {
          ok: true,
          summary: 'נכתב diff בסביבה מבודדת (mock)',
          artifacts: { diffLines: this.#diffLines, branch: step.payload.branch },
        };
      case ACTION.RUN_TESTS:
        return { ok: true, summary: 'כל הבדיקות עברו (mock)', artifacts: { passed: 4, failed: 0 } };
      case ACTION.GIT_COMMIT:
        return {
          ok: true,
          summary: 'נוצר קומיט מקומי (mock)',
          artifacts: { sha: `mock${task.id.slice(0, 7)}` },
        };
      default:
        // צעדים חיצוניים מטופלים ע"י ה-adapter, לא ע"י ה-runner.
        return { ok: false, summary: `ה-runner אינו מבצע את ${step.action}`, artifacts: {} };
    }
  }
}
