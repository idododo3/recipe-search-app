// Runs with mocked network responses: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const fsx = require('../find-streams.js');

const CC0 = 'http://creativecommons.org/publicdomain/mark/1.0/';
const routes = {
  'https://archive.org/advancedsearch.php': () => ({ response: { docs: [
    { identifier: 'open-show-s1', title: 'Open Show Season 1', licenseurl: CC0 },
    { identifier: 'no-license-show', title: 'Open Show Bootleg' },
  ] } }),
  'https://archive.org/metadata/open-show-s1': () => ({
    metadata: { title: 'Open Show Season 1', licenseurl: CC0 },
    files: [
      { name: 'Open Show S01E01.mp4', format: 'h.264', height: '480', size: '1000' },
      { name: 'Open Show S01E02.mp4', format: 'h.264' },
      { name: 'Open Show S01E01.ogv', format: 'Ogg Video' },
    ],
  }),
  'https://archive.org/metadata/no-license-show': () => { throw new Error('should not be fetched'); },
  'https://api.themoviedb.org/3/find/tt0000001': () => ({ tv_results: [{ id: 42, name: 'Open Show' }] }),
  'https://api.themoviedb.org/3/tv/42/watch/providers': () => ({ results: { US: {
    link: 'https://www.themoviedb.org/tv/42/watch?locale=US',
    free: [{ provider_name: 'Tubi TV' }],
    ads: [{ provider_name: 'Pluto TV' }],
    flatrate: [{ provider_name: 'Paid Service' }],
  } } }),
};
const calls = [];
global.fetch = async (url, init = {}) => {
  calls.push(url);
  const base = url.split('?')[0];
  if (base.startsWith('https://archive.org/download/')) {
    const type = base.endsWith('.mp4') ? 'video/mp4' : 'text/html';
    return new Response('x', { status: 206, headers: { 'content-type': type } });
  }
  const route = routes[base];
  if (!route) return new Response('nf', { status: 404, statusText: 'Not Found' });
  return new Response(JSON.stringify(route()), { status: 200, headers: { 'content-type': 'application/json' } });
};

test('parses arguments', () => {
  const o = fsx.parseArgs(['Open', 'Show', '--season', '1', '--episode', '2', '--imdb', 'tt1', '--country', 'gb', '--check']);
  assert.deepStrictEqual([o.title, o.season, o.episode, o.imdb, o.country, o.check], ['Open Show', 1, 2, 'tt1', 'GB', true]);
});

test('matches episode naming styles', () => {
  const p = fsx.episodePatterns(1, 1);
  for (const t of ['S01E01', 's1e1', '1x01', 'Season 1 - Episode 1']) assert.ok(fsx.matchesEpisode(t, p), t);
  for (const t of ['S01E10', 'S11E01', '1x11']) assert.ok(!fsx.matchesEpisode(t, p), t);
});

test('Internet Archive: only openly licensed, playable, matching episode files', async () => {
  const r = await fsx.searchInternetArchive({ title: 'Open Show', season: 1, episode: 1 });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].url, 'https://archive.org/download/open-show-s1/Open%20Show%20S01E01.mp4');
  assert.strictEqual(r[0].kind, 'direct');
  assert.strictEqual(r[0].license, CC0);
  assert.ok(!calls.includes('https://archive.org/metadata/no-license-show'));
});

test('TMDB: only free and ad-supported providers', async () => {
  const r = await fsx.searchTmdbProviders({ title: 'Open Show', imdb: 'tt0000001', country: 'US' }, 'k');
  assert.deepStrictEqual(r.map((x) => x.source), ['Tubi TV', 'Pluto TV']);
  assert.ok(r.every((x) => x.kind === 'external' && x.url.includes('/tv/42/watch')));
});

test('findStreams combines sources and --check drops non-video links', async () => {
  const { results, errors } = await fsx.findStreams({ title: 'Open Show', imdb: 'tt0000001', season: 1, episode: 1, country: 'US', check: true }, { TMDB_API_KEY: 'k' });
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(results.map((x) => x.kind), ['direct', 'external', 'external']);
  assert.strictEqual(results[0].check.contentType, 'video/mp4');
  assert.strictEqual(await fsx.checkDirect({ url: 'https://archive.org/download/x/page.html' }), false);
});

test('reports errors instead of crashing when a source is down', async () => {
  const { results, errors } = await fsx.findStreams({ title: 'Open Show', imdb: 'tt0000001', country: 'US' }, { TMDB_API_KEY: 'k' });
  assert.ok(results.length >= 1);
  assert.deepStrictEqual(errors, []);
  const saved = global.fetch;
  global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  try {
    const out = await fsx.findStreams({ title: 'Open Show', country: 'US' }, {});
    assert.deepStrictEqual(out.results, []);
    assert.match(out.errors[0], /Internet Archive: getaddrinfo ENOTFOUND/);
  } finally { global.fetch = saved; }
});

test('--write adds sources and build.js emits Stremio stream files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-'));
  fs.copyFileSync(path.join(__dirname, '..', 'build.js'), path.join(dir, 'build.js'));
  fs.writeFileSync(path.join(dir, 'sources.json'), '{}');
  const opts = { title: 'Open Show', imdb: 'tt0000001', season: 1, episode: 1, country: 'US' };
  const { results } = await fsx.findStreams(opts, { TMDB_API_KEY: 'k' });
  const id = fsx.writeSources(opts, results, dir);
  fsx.writeSources(opts, results, dir); // second run must not duplicate
  execFileSync(process.execPath, [path.join(dir, 'build.js')]);
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'stream', 'series', `${id}.json`), 'utf8'));
  assert.strictEqual(out.streams.length, 2); // one direct + one shared TMDB watch link
  assert.strictEqual(out.streams[0].url, 'https://archive.org/download/open-show-s1/Open%20Show%20S01E01.mp4');
  assert.ok(out.streams[1].externalUrl.includes('themoviedb.org'));
  assert.throws(() => fsx.writeSources({ title: 'x' }, results, dir), /--write needs/);
});
