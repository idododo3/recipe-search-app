# Agent Bridge — MVP מקומי

מערכת שמקבלת משימת קוד, מנהלת אותה בתור, מפעילה סוכן קוד דרך שכבת runner מופשטת,
ועוצרת לאישור אנושי לפני כל פעולה בעלת השפעה חיצונית.

> **מה זה לא:** אין כאן אינטגרציה רשמית לשום שירות. לא קיים כאן API של Instinct,
> של WhatsApp או של Claude Code. ה-runner הוא mock, וה-GitHub adapter פועל ב-dry run
> בלבד — אין שום קריאת רשת בקוד הזה.

## דרישות

Node.js 20 ומעלה. אפס תלויות חיצוניות — אין צורך ב-`npm install`.

## הפעלה

```bash
cd agent-bridge
cp .env.example .env     # אופציונלי; ברירות המחדל בטוחות גם בלי הקובץ
npm test                 # הרצת הבדיקות
```

זרימה מלאה:

```bash
node src/cli.js submit --title "הוסף כפתור ביטול" --repo owner/repo
node src/cli.js list                     # מציג את המזהה
node src/cli.js plan <task-id>           # new → planned
node src/cli.js run <task-id>            # planned → running → waiting_approval
node src/cli.js show <task-id>           # מציג את ה-request-id לאישור
node src/cli.js approve <task-id> <request-id> --reason "אושר"
node src/cli.js run <task-id>            # ממשיך עד האישור הבא ואז → done
node src/cli.js audit --verify           # בדיקת שלמות יומן הביקורת
```

פקודות נוספות: `queue`, `deny`, `audit`, `config`, `help`.

## מצבי משימה

```
new → planned → waiting_approval → running → done
        ↑                ↓            ↓
        └───────────── blocked ───────┘
```

| מצב | משמעות |
| --- | --- |
| `new` | התקבלה ונכנסה לתור, עוד אין תוכנית |
| `planned` | ה-runner ייצר תוכנית צעדים |
| `waiting_approval` | הריצה נעצרה; צעד טעון-אישור ממתין להחלטה אנושית |
| `running` | צעדים מבוצעים |
| `blocked` | אישור נדחה או שצעד נכשל |
| `done` | כל הצעדים הושלמו |

מעברים לא חוקיים נדחים ב-`src/core/task.js`; אין דרך לעקוף את מכונת המצבים.

## שער האישורים

הפעולות הבאות **תמיד** דורשות אישור מפורש לפני ביצוע:
דחיפה לרימוט (`git_push`), פתיחת PR (`open_pr`), פריסה (`deploy`),
מחיקה (`delete`) ושינוי הרשאות (`change_permissions`).

המדיניות היא **deny by default**: פעולה שאינה ברשימת המותרות המפורשת
(קריאה, כתיבה לסביבה מבודדת, הרצת בדיקות, קומיט מקומי) נחשבת טעונת-אישור.

כל אישור תקף לפעולה אחת בלבד, למשימה אחת, ופג אחרי שעה. אישור ל-push
אינו מאשר פתיחת PR.

## אבטחה

* **סודות** — נטענים רק מ-`.env` (ב-`.gitignore`) או ממשתני סביבה. `.env.example`
  לא מכיל שום ערך אמיתי. כל שדה ששמו רומז על סוד מוחלף ב-`[redacted]` לפני
  כתיבה ליומן או הדפסה.
* **Audit log** — `audit.jsonl` בפורמט append-only עם שרשרת SHA-256. עריכה או
  מחיקה רטרואקטיבית שוברת את השרשרת ומתגלה ב-`audit --verify`.
* **אין רשת** — ה-adapter מחזיר תיאור של מה שהיה מתבצע. מצב `live` זורק
  `LiveModeNotImplementedError` גם כשמוגדר טוקן; מעבר אליו דורש שינוי קוד מכוון.
* **ולידציית קלט** — כותרת, תיאור ו-repo נבדקים (אורך, סוג, תווי בקרה) לפני
  שהמשימה נכנסת לתור. `repo` חייב להיות `owner/repo`, ומזהה משימה חייב להיות UUID,
  כדי שלא ישמש כנתיב קובץ.
* **ה-runner לא מריץ כלום** — ה-mock דטרמיניסטי, בלי shell, בלי רשת, בלי כתיבה לדיסק.

## מבנה

```
src/core/task.js       מודל המשימה ומכונת המצבים
src/core/store.js      אחסון JSONL ותור FIFO
src/core/policy.js     אילו פעולות טעונות אישור
src/core/approval.js   שער האישורים
src/core/audit.js      יומן ביקורת עם שרשרת hash
src/core/config.js     טעינת .env ו-redaction
src/core/bridge.js     האורקסטרציה
src/runners/           ממשק runner + מימוש mock
src/adapters/github.js GitHub adapter, dry run בלבד
src/cli.js             ממשק שורת הפקודה
test/                  בדיקות
```

## נתונים

נשמרים ב-`.agent-bridge-data/` (ניתן לשינוי דרך `AGENT_BRIDGE_DATA_DIR`),
בתיקייה עם הרשאות `0700`. התיקייה ב-`.gitignore`.
