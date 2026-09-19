#!/usr/bin/env node
/**
 * ממשק CLI מקומי ל-Agent Bridge.
 * שימוש: node src/cli.js <פקודה> [ארגומנטים]
 */

import { AgentBridge } from './core/bridge.js';
import { loadConfig, redact } from './core/config.js';
import { describeAction } from './core/policy.js';
import { STATUS } from './core/task.js';

const USAGE = `Agent Bridge — MVP מקומי

פקודות:
  submit --title "כותרת" [--description "תיאור"] [--repo owner/repo]
  list [--status <${Object.values(STATUS).join('|')}>]
  show <task-id>
  queue
  plan <task-id>
  run <task-id>
  approve <task-id> <request-id> [--reason "נימוק"]
  deny <task-id> <request-id> [--reason "נימוק"]
  audit [--verify]
  config

הערה: ה-GitHub adapter פועל ב-dry run בלבד. אין קריאות רשת.`;

/** פרסור ארגומנטים: --key value, והשאר positional. */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printTask(task) {
  console.log(`משימה ${task.id}`);
  console.log(`  כותרת:  ${task.title}`);
  console.log(`  סטטוס:  ${task.status}`);
  console.log(`  ריפו:   ${task.repo ?? '—'}`);
  console.log(`  עודכן:  ${task.updatedAt}`);
  if (task.blockedReason) console.log(`  חסום:   ${task.blockedReason}`);
  if (task.plan) {
    console.log(`  תוכנית (${task.plan.runner}):`);
    for (const [i, step] of task.plan.steps.entries()) {
      const done = (task.result?.completedSteps ?? []).includes(i) ? '✓' : '·';
      console.log(`    ${done} ${i + 1}. ${describeAction(step.action)} — ${step.summary}`);
    }
  }
  const pending = task.pendingApproval;
  if (pending && !pending.decision) {
    console.log('  ממתין לאישור:');
    console.log(`    פעולה:     ${describeAction(pending.action)}`);
    console.log(`    request-id: ${pending.requestId}`);
    console.log(`    לאישור:     node src/cli.js approve ${task.id} ${pending.requestId}`);
  }
}

async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const command = positional[0];

  if (!command || command === 'help' || flags.help) {
    console.log(USAGE);
    return 0;
  }

  if (command === 'config') {
    // הסוד עצמו לעולם לא מודפס — רק האם הוא קיים.
    const config = loadConfig();
    console.log(
      JSON.stringify(
        redact({ ...config, githubToken: config.githubToken ? 'set' : null }),
        null,
        2,
      ),
    );
    return 0;
  }

  const bridge = new AgentBridge();

  switch (command) {
    case 'submit': {
      const task = bridge.submit({
        title: flags.title,
        description: flags.description === true ? '' : flags.description ?? '',
        repo: flags.repo === true ? null : flags.repo ?? null,
      });
      console.log(`נוצרה משימה ${task.id} (${task.status})`);
      return 0;
    }
    case 'list': {
      const status = flags.status === true ? null : flags.status ?? null;
      const tasks = bridge.list({ status });
      if (tasks.length === 0) {
        console.log('אין משימות.');
        return 0;
      }
      for (const task of tasks) {
        console.log(`${task.id}  ${task.status.padEnd(17)}  ${task.title}`);
      }
      return 0;
    }
    case 'queue': {
      const tasks = bridge.queue();
      if (tasks.length === 0) {
        console.log('התור ריק.');
        return 0;
      }
      for (const [i, task] of tasks.entries()) {
        console.log(`${i + 1}. ${task.id}  ${task.status.padEnd(17)}  ${task.title}`);
      }
      return 0;
    }
    case 'show': {
      const task = bridge.get(positional[1]);
      if (!task) {
        console.error('משימה לא נמצאה.');
        return 1;
      }
      printTask(task);
      return 0;
    }
    case 'plan': {
      printTask(await bridge.plan(positional[1]));
      return 0;
    }
    case 'run': {
      const task = await bridge.run(positional[1]);
      printTask(task);
      if (task.status === STATUS.WAITING_APPROVAL) {
        console.log('\nהריצה נעצרה בשער האישורים. אשר או דחה כדי להמשיך.');
      }
      return 0;
    }
    case 'approve':
    case 'deny': {
      const [, id, requestId] = positional;
      const reason = flags.reason === true ? '' : flags.reason ?? '';
      const task =
        command === 'approve'
          ? bridge.approve(id, requestId, { reason })
          : bridge.deny(id, requestId, { reason });
      console.log(`${command === 'approve' ? 'אושר' : 'נדחה'}: ${task.id}`);
      if (command === 'approve') {
        console.log(`להמשך: node src/cli.js run ${task.id}`);
      }
      return 0;
    }
    case 'audit': {
      if (flags.verify) {
        const result = bridge.audit.verify();
        console.log(
          result.valid
            ? `שרשרת ה-audit תקינה (${result.count} רשומות).`
            : `שרשרת ה-audit נשברה ברשומה ${result.brokenAt}.`,
        );
        return result.valid ? 0 : 1;
      }
      for (const entry of bridge.audit.read()) {
        console.log(`${entry.at}  ${entry.actor}  ${entry.action}  ${entry.outcome}  ${entry.target ?? '—'}`);
      }
      return 0;
    }
    default:
      console.error(`פקודה לא מוכרת: ${command}\n`);
      console.error(USAGE);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`שגיאה: ${err.message}`);
    process.exit(1);
  });
