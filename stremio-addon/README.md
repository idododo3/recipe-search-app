# Direct HTTP Streams (Stremio add-on)

A static Stremio add-on: no server needed. It's hosted free from this GitHub repo through raw.githubusercontent.com, which sends `Access-Control-Allow-Origin: *`.

Install URL (paste into Stremio → Add-ons → search box):

```
https://raw.githubusercontent.com/idododo3/recipe-search-app/ccr-eee302ae-vqbbf9/stremio-addon/manifest.json
```

## Adding streams

1. Put direct video links for content you have the rights to (your own NAS, Jellyfin direct-play URLs, a cloud bucket) in `sources.json`. See `sources.example.json` for the format.
2. Run `node build.js` to regenerate `stream/`.
3. Commit and push. Stremio picks up the new files right away.

For the LG webOS built-in player, use H.264 video with AAC audio in MP4, or HLS (`.m3u8`). URLs must be HTTPS reachable from the TV.

## Finding legitimate free sources: `find-streams.js`

Searches only legitimate sources, never torrents or unlicensed sites:

- **Internet Archive**: direct MP4 links (`[DIRECT]`), only from items licensed public domain or Creative Commons.
- **TMDB watch providers** (JustWatch data): free and ad-supported services that carry the show in your country, such as Tubi, Pluto TV or The Roku Channel. These services don't give out direct files, so the result is a link that opens the show on that service (`[OPEN IN APP]`). Set `TMDB_API_KEY` to a free key from themoviedb.org to turn this on.

```
node find-streams.js "Show Title" --season 1 --episode 1 --imdb tt0000000 --country US --check
node find-streams.js "Show Title" --season 1 --episode 1 --imdb tt0000000 --check --write   # adds to sources.json and rebuilds
```

`--check` keeps only direct links whose server answers with a video content type. Tests (with mocked network): `node --test test/*.test.js`.
