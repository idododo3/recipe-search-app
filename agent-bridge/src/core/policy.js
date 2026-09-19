/**
 * מדיניות: אילו פעולות חייבות אישור אנושי מפורש לפני ביצוע.
 * ברירת המחדל היא deny — פעולה לא מוכרת נחשבת מסוכנת.
 */

export const ACTION = Object.freeze({
  READ_REPO: 'read_repo',
  WRITE_WORKSPACE: 'write_workspace',
  RUN_TESTS: 'run_tests',
  GIT_COMMIT: 'git_commit',
  GIT_PUSH: 'git_push',
  OPEN_PR: 'open_pr',
  DEPLOY: 'deploy',
  DELETE: 'delete',
  CHANGE_PERMISSIONS: 'change_permissions',
});

/** פעולות שמותרות ללא אישור: מקומיות בלבד, הפיכות, בלי השפעה חיצונית. */
const AUTO_ALLOWED = new Set([
  ACTION.READ_REPO,
  ACTION.WRITE_WORKSPACE,
  ACTION.RUN_TESTS,
  ACTION.GIT_COMMIT,
]);

/** פעולות שחייבות אישור מפורש, בהתאם לדרישה. */
export const REQUIRES_APPROVAL = Object.freeze([
  ACTION.GIT_PUSH,
  ACTION.OPEN_PR,
  ACTION.DEPLOY,
  ACTION.DELETE,
  ACTION.CHANGE_PERMISSIONS,
]);

export function requiresApproval(action) {
  return !AUTO_ALLOWED.has(action);
}

export function describeAction(action) {
  const labels = {
    [ACTION.READ_REPO]: 'קריאת קוד מהריפו',
    [ACTION.WRITE_WORKSPACE]: 'כתיבה לסביבת עבודה מבודדת',
    [ACTION.RUN_TESTS]: 'הרצת בדיקות',
    [ACTION.GIT_COMMIT]: 'יצירת קומיט מקומי',
    [ACTION.GIT_PUSH]: 'דחיפה לרימוט',
    [ACTION.OPEN_PR]: 'פתיחת Pull Request',
    [ACTION.DEPLOY]: 'פריסה',
    [ACTION.DELETE]: 'מחיקה',
    [ACTION.CHANGE_PERMISSIONS]: 'שינוי הרשאות',
  };
  return labels[action] ?? `פעולה לא מוכרת (${action})`;
}
