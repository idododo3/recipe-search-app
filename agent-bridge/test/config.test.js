import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSecretName, loadConfig, parseEnv, redact } from '../src/core/config.js';

test('parseEnv קורא זוגות, גרשיים והערות', () => {
  const env = parseEnv(`
# הערה
GITHUB_MODE=dry_run
GITHUB_TOKEN="abc 123"
EMPTY=
WITH_COMMENT=value # trailing
BAD LINE
`);
  assert.equal(env.GITHUB_MODE, 'dry_run');
  assert.equal(env.GITHUB_TOKEN, 'abc 123');
  assert.equal(env.EMPTY, '');
  assert.equal(env.WITH_COMMENT, 'value');
  assert.ok(!('BAD LINE' in env));
});

test('redact מסתיר שדות רגישים בכל עומק', () => {
  const out = redact({
    token: 'sk-real',
    nested: { apiKey: 'x', password: 'y', safe: 'ok' },
    list: [{ secret: 'z' }],
  });
  assert.equal(out.token, '[redacted]');
  assert.equal(out.nested.apiKey, '[redacted]');
  assert.equal(out.nested.password, '[redacted]');
  assert.equal(out.nested.safe, 'ok');
  assert.equal(out.list[0].secret, '[redacted]');
});

test('isSecretName מזהה שמות נפוצים', () => {
  assert.ok(isSecretName('GITHUB_TOKEN'));
  assert.ok(isSecretName('api_key'));
  assert.ok(!isSecretName('branch'));
});

test('ברירת המחדל היא dry_run, ומצב לא חוקי נדחה', () => {
  const config = loadConfig({ cwd: '/nonexistent-dir-for-test', env: {} });
  assert.equal(config.githubMode, 'dry_run');
  assert.equal(config.githubToken, null);
  assert.throws(() => loadConfig({ cwd: '/nonexistent-dir-for-test', env: { GITHUB_MODE: 'yolo' } }));
});
