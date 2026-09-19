/**
 * הממשק המופשט של runner לסוכן קוד.
 * כל מימוש עתידי (סוכן מקומי, שירות חיצוני) חייב לממש את שתי המתודות האלה.
 * הממשק מכוון לכך שה-runner לעולם לא מבצע בעצמו פעולה טעונת-אישור —
 * הוא רק מכריז עליה, והאורקסטרציה עוצרת בשער האישורים.
 */

export class Runner {
  get name() {
    throw new Error('runner חייב לממש name');
  }

  /**
   * מחזיר תוכנית: מערך צעדים { action, summary, payload }.
   * אסור לו לבצע תופעות לוואי.
   */
  // eslint-disable-next-line no-unused-vars
  async plan(task) {
    throw new Error('runner חייב לממש plan');
  }

  /**
   * מבצע צעד יחיד ומחזיר { ok, summary, artifacts }.
   * נקרא רק אחרי שהאורקסטרציה אימתה מדיניות ואישור.
   */
  // eslint-disable-next-line no-unused-vars
  async execute(task, step, context) {
    throw new Error('runner חייב לממש execute');
  }
}
