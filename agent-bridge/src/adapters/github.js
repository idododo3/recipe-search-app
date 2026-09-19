/**
 * GitHub adapter — dry run בלבד.
 *
 * ב-MVP הזה אין שום קריאת רשת. המצב היחיד הממומש הוא dry_run, שמתאר
 * בדיוק מה *היה* קורה. מצב live קיים כנתיב מוצהר אך חסום בקוד, כדי
 * שהמעבר אליו יהיה שינוי קוד מכוון ולא מתג סביבה.
 */

export class LiveModeNotImplementedError extends Error {
  constructor(operation) {
    super(`מצב live אינו ממומש ב-MVP (${operation}). נדרש מימוש ואישור מפורש.`);
    this.name = 'LiveModeNotImplementedError';
  }
}

export class GitHubAdapter {
  #mode;
  #hasToken;
  #audit;

  constructor({ mode = 'dry_run', token = null, audit }) {
    this.#mode = mode;
    this.#hasToken = Boolean(token);
    this.#audit = audit;
  }

  get mode() {
    return this.#mode;
  }

  get isDryRun() {
    return this.#mode !== 'live';
  }

  #guard(operation, details) {
    if (!this.isDryRun) {
      // נרשם ליומן ואז נחסם — מצב live לא יוצא לדרך בשקט.
      this.#audit?.record({
        actor: 'github-adapter',
        action: `github.${operation}`,
        target: details.repo ?? null,
        outcome: 'blocked',
        details: { why: 'live mode not implemented', authConfigured: this.#hasToken },
      });
      throw new LiveModeNotImplementedError(operation);
    }
  }

  /** מדמה דחיפת ענף. מחזיר תיאור של הפעולה המתוכננת. */
  async push({ repo, branch }) {
    this.#guard('push', { repo });
    const plan = {
      dryRun: true,
      operation: 'push',
      repo,
      branch,
      wouldRun: `git push -u origin ${branch}`,
    };
    this.#audit?.record({
      actor: 'github-adapter',
      action: 'github.push',
      target: repo,
      outcome: 'dry_run',
      details: plan,
    });
    return plan;
  }

  /** מדמה פתיחת PR. מחזיר תיאור ומזהה מדומה. */
  async openPullRequest({ repo, branch, base = 'main', title, body }) {
    this.#guard('open_pr', { repo });
    const plan = {
      dryRun: true,
      operation: 'open_pr',
      repo,
      head: branch,
      base,
      title,
      bodyPreview: String(body ?? '').slice(0, 200),
      url: `https://github.com/${repo ?? 'OWNER/REPO'}/pull/DRY-RUN`,
    };
    this.#audit?.record({
      actor: 'github-adapter',
      action: 'github.open_pr',
      target: repo,
      outcome: 'dry_run',
      details: plan,
    });
    return plan;
  }
}
