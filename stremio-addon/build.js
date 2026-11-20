#!/usr/bin/env node
// Generates a static Stremio add-on from sources.json.
// sources.json maps a Stremio video id to a list of direct HTTP(S) video URLs:
//   { "tt0182576:1:1": [{ "title": "1080p MP4", "url": "https://my-nas.example/fg/s01e01.mp4" }] }
// Series ids are "<imdb id>:<season>:<episode>", movie ids are "<imdb id>".
// Use H.264/AAC MP4 or HLS (.m3u8) so the LG webOS built-in player can play them.
// An entry may use "externalUrl" instead of "url" to open the episode on a free service's site or app.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const sources = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'));

for (const type of ['series', 'movie']) {
  fs.rmSync(path.join(root, 'stream', type), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'stream', type), { recursive: true });
}

let count = 0;
for (const [id, list] of Object.entries(sources)) {
  if (!/^tt\d+(:\d+:\d+)?$/.test(id)) throw new Error(`Bad id "${id}"`);
  const type = id.includes(':') ? 'series' : 'movie';
  const streams = list.map((s) => {
    if (s.externalUrl) {
      if (!/^https?:\/\//.test(s.externalUrl)) throw new Error(`Bad externalUrl for ${id}: ${s.externalUrl}`);
      return { name: 'Open', title: s.title || 'Open on service', externalUrl: s.externalUrl };
    }
    if (!/^https?:\/\//.test(s.url)) throw new Error(`Bad url for ${id}: ${s.url}`);
    return {
      name: 'Direct',
      title: s.title || 'Direct stream',
      url: s.url,
      behaviorHints: { notWebReady: false, bingeGroup: 'direct-http' },
    };
  });
  fs.writeFileSync(path.join(root, 'stream', type, `${id}.json`), JSON.stringify({ streams }));
  count++;
}
console.log(`Wrote ${count} stream file(s).`);
