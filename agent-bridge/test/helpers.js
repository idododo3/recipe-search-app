import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AgentBridge } from '../src/core/bridge.js';

/** סביבת בדיקה מבודדת עם תיקיית נתונים זמנית. */
export function makeBridge(overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-bridge-test-'));
  const bridge = new AgentBridge({
    config: {
      dataDir: dir,
      githubMode: 'dry_run',
      githubToken: null,
      approver: 'tester',
      runner: 'mock',
    },
    ...overrides,
  });
  return { bridge, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
