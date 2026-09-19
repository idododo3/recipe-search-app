/**
 * אחסון מתמיד ב-JSONL. כל שינוי במשימה נכתב כשורה חדשה (event log),
 * והמצב הנוכחי הוא השורה האחרונה לכל מזהה. פורמט שקוף ובר-בדיקה.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isValidTaskId } from './task.js';

export class TaskStore {
  #file;

  constructor({ dir, file = 'tasks.jsonl' }) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.#file = path.join(dir, file);
    try {
      writeFileSync(this.#file, '', { flag: 'ax', mode: 0o600 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  get file() {
    return this.#file;
  }

  /**
   * קורא את כל הגרסאות ומחזיר Map של מצב נוכחי לפי מזהה.
   * ה-Map שומר על סדר ההופעה הראשונה של כל מזהה — זהו סדר ההכנסה האמיתי,
   * ולא מסתמך על חותמת זמן (שתי משימות עשויות להיווצר באותה אלפית שנייה).
   */
  #snapshot() {
    const text = readFileSync(this.#file, 'utf8');
    const tasks = new Map();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const task = JSON.parse(line);
      if (!isValidTaskId(task.id)) continue;
      // set על מפתח קיים מעדכן את הערך ושומר את מיקומו המקורי ב-Map.
      tasks.set(task.id, task);
    }
    return tasks;
  }

  save(task) {
    if (!isValidTaskId(task.id)) {
      throw new Error('מזהה משימה לא חוקי');
    }
    appendFileSync(this.#file, `${JSON.stringify(task)}\n`, { mode: 0o600 });
    return task;
  }

  get(id) {
    if (!isValidTaskId(id)) return null;
    return this.#snapshot().get(id) ?? null;
  }

  list({ status = null } = {}) {
    const all = [...this.#snapshot().values()];
    return status ? all.filter((task) => task.status === status) : all;
  }

  /** התור: FIFO לפי סדר ההכנסה ליומן, מוגבל למצבים שניתנים לקידום. */
  queue(statuses) {
    const wanted = new Set(statuses);
    return this.list().filter((task) => wanted.has(task.status));
  }

  next(statuses) {
    return this.queue(statuses)[0] ?? null;
  }
}
