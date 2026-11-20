#!/usr/bin/env node
// Finds legitimate, free ways to watch a TV episode. No torrents, no scraping of
// unlicensed sites.
//
//   1. Internet Archive: direct MP4 links, only from items whose license is
//      public domain or Creative Commons.
//   2. TMDB watch providers (data from JustWatch): which free or ad-supported
//      services (Tubi, Pluto TV, Roku Channel, ...) carry the show in your
//      country. These services don't hand out direct files, so the result is a
//      link that opens the show on that service.
//
// Usage:
//   node find-streams.js "<series title>" [--season N --episode N]
//        [--imdb tt1234567] [--country US] [--check] [--write] [--json]
//
//   --check  send a request to each direct link and keep only those that
//            answer with a video content type
//   --write  add the results to sources.json under "<imdb>:<season>:<episode>"
//            (needs --imdb, --season, --episode), then run build.js
//
// Environment: TMDB_API_KEY (free, https://www.themoviedb.org/settings/api)
// enables the watch-provider search. Without it only Internet Archive is searched.

const fs = require('fs');
const path = require('path');

const IA = 'https://archive.org';
const TMDB = 'https://api.themoviedb.org/3';
const OPEN_LICENSE = /creativecommons\.org\/(publicdomain|licenses)\//i;
// Formats the LG webOS (and most) built-in players can play directly.
const PLAYABLE_FORMATS = new Set(['h.264', 'h.264 ia', 'mpeg4', '512kb mpeg4', 'h.264 hd']);

function parseArgs(argv) {
  const opts = { country: 'US', check: false, write: false, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') opts.season = Number(argv[++i]);
    else if (a === '--episode') opts.episode = Number(argv[++i]);
    else if (a === '--imdb') opts.imdb = argv[++i];
    else if (a === '--country') opts.country = String(argv[++i]).toUpperCase();
    else if (a === '--check') opts.check = true;
    else if (a === '--write') opts.write = true;
    else if (a === '--json') opts.json = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else rest.push(a);
  }
  opts.title = rest.join(' ').trim();
  return opts;
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.split('?')[0]}`);
  return res.json();
}

// "S01E01", "s1e1", "1x01", "Season 1 Episode 1"
function episodePatterns(season, episode) {
  if (!season || !episode) return null;
  const s = String(season), e = String(episode);
  const s2 = s.padStart(2, '0'), e2 = e.padStart(2, '0');
  return [
    new RegExp(`\\bs0*${s}\\s*e0*${e}\\b`, 'i'),
    new RegExp(`\\b0*${s}x0*${e}\\b`, 'i'),
    new RegExp(`season\\s*0*${s}\\D{0,12}episode\\s*0*${e}\\b`, 'i'),
    new RegExp(`\\bS${s2}E${e2}\\b`, 'i'),
  ];
}

function matchesEpisode(text, patterns) {
  return !patterns || patterns.some((p) => p.test(text));
}

function escapeQuery(s) {
  return s.replace(/["\\]/g, ' ').trim();
}

async function searchInternetArchive(opts) {
  const q = [
    `title:("${escapeQuery(opts.title)}")`,
    'mediatype:movies',
    'licenseurl:*creativecommons.org*',
  ].join(' AND ');
  const params = new URLSearchParams({ q, rows: '50', output: 'json' });
  for (const f of ['identifier', 'title', 'licenseurl']) params.append('fl[]', f);
  const search = await getJson(`${IA}/advancedsearch.php?${params}`);
  const docs = (search.response && search.response.docs) || [];
  const patterns = episodePatterns(opts.season, opts.episode);
  const results = [];

  for (const doc of docs) {
    if (!OPEN_LICENSE.test(doc.licenseurl || '')) continue;
    const meta = await getJson(`${IA}/metadata/${encodeURIComponent(doc.identifier)}`);
    const license = (meta.metadata && meta.metadata.licenseurl) || doc.licenseurl;
    if (!OPEN_LICENSE.test(license || '')) continue;
    const itemTitle = String((meta.metadata && meta.metadata.title) || doc.title || '');
    for (const f of meta.files || []) {
      const format = String(f.format || '').toLowerCase();
      if (!PLAYABLE_FORMATS.has(format) && !/\.mp4$/i.test(f.name)) continue;
      if (!matchesEpisode(`${itemTitle} ${f.name} ${f.title || ''}`, patterns)) continue;
      results.push({
        source: 'Internet Archive',
        kind: 'direct',
        title: `${itemTitle} — ${f.name}${f.height ? ` (${f.height}p)` : ''}`,
        url: `${IA}/download/${encodeURIComponent(doc.identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
        license,
        size: f.size ? Number(f.size) : undefined,
      });
    }
  }
  return results;
}

async function searchTmdbProviders(opts, apiKey) {
  const key = `api_key=${encodeURIComponent(apiKey)}`;
  let show;
  if (opts.imdb) {
    const found = await getJson(`${TMDB}/find/${encodeURIComponent(opts.imdb)}?external_source=imdb_id&${key}`);
    show = (found.tv_results || [])[0];
  }
  if (!show && opts.title) {
    const found = await getJson(`${TMDB}/search/tv?query=${encodeURIComponent(opts.title)}&${key}`);
    show = (found.results || [])[0];
  }
  if (!show) return [];
  const providers = await getJson(`${TMDB}/tv/${show.id}/watch/providers?${key}`);
  const region = (providers.results || {})[opts.country];
  if (!region) return [];
  const out = [];
  for (const tier of ['free', 'ads']) {
    for (const p of region[tier] || []) {
      out.push({
        source: p.provider_name,
        kind: 'external',
        title: `${show.name || show.original_name} on ${p.provider_name} (${tier === 'ads' ? 'free with ads' : 'free'})`,
        url: region.link,
      });
    }
  }
  return out;
}

// Keeps a direct link only if the server answers with a video type.
async function checkDirect(item) {
  try {
    const res = await fetch(item.url, { method: 'GET', headers: { Range: 'bytes=0-1023' }, redirect: 'follow' });
    const type = res.headers.get('content-type') || '';
    if (res.body && res.body.cancel) await res.body.cancel();
    item.check = { status: res.status, contentType: type };
    return (res.status === 200 || res.status === 206) && /^(video\/|application\/(x-mpegurl|vnd\.apple\.mpegurl))/i.test(type);
  } catch (err) {
    item.check = { error: err.message };
    return false;
  }
}

function writeSources(opts, results, dir = __dirname) {
  if (!opts.imdb || !opts.season || !opts.episode) {
    throw new Error('--write needs --imdb, --season and --episode');
  }
  const file = path.join(dir, 'sources.json');
  const sources = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const id = `${opts.imdb}:${opts.season}:${opts.episode}`;
  const existing = sources[id] || [];
  const seen = new Set(existing.map((s) => s.url || s.externalUrl));
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    existing.push(r.kind === 'direct' ? { title: r.title, url: r.url } : { title: r.title, externalUrl: r.url });
  }
  sources[id] = existing;
  fs.writeFileSync(file, JSON.stringify(sources, null, 2) + '\n');
  return id;
}

async function findStreams(opts, env = process.env) {
  const results = [];
  const errors = [];
  const tasks = [searchInternetArchive(opts).then((r) => results.push(...r), (e) => errors.push(`Internet Archive: ${e.message}`))];
  if (env.TMDB_API_KEY) {
    tasks.push(searchTmdbProviders(opts, env.TMDB_API_KEY).then((r) => results.push(...r), (e) => errors.push(`TMDB: ${e.message}`)));
  }
  await Promise.all(tasks);
  if (opts.check) {
    const keep = [];
    for (const r of results) if (r.kind !== 'direct' || (await checkDirect(r))) keep.push(r);
    return { results: keep, errors };
  }
  return { results, errors };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.title) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 25).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(opts.help ? 0 : 1);
  }
  const { results, errors } = await findStreams(opts);
  if (opts.json) {
    console.log(JSON.stringify({ results, errors }, null, 2));
  } else {
    for (const e of errors) console.error(`! ${e}`);
    if (!results.length) console.log('No legitimate free sources found.');
    for (const r of results) {
      console.log(`[${r.kind === 'direct' ? 'DIRECT' : 'OPEN IN APP'}] ${r.source}: ${r.title}\n    ${r.url}${r.license ? `\n    license: ${r.license}` : ''}`);
    }
  }
  if (opts.write && results.length) {
    const id = writeSources(opts, results);
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
    console.log(`Added ${results.length} source(s) to ${id}.`);
  }
  if (errors.length && !results.length) process.exit(2);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { parseArgs, episodePatterns, matchesEpisode, searchInternetArchive, searchTmdbProviders, checkDirect, writeSources, findStreams };
