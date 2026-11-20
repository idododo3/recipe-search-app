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
