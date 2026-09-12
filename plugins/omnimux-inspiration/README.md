# omnimux-inspiration

Pinned first-level plugin for browsing OmniMux inspiration items. It renders its own sidebar row under 新会话 and opens a standalone product page over the conversation column — it does not go through the Apps catalog, the `omnimux-app-open` event, or a Settings seat. The browser only calls Host `/omnimux/inspiration` (JSON) and `/omnimux/inspiration/media/...` (covers). It does not import the hub and does not read `OMNIMUX_*` secrets.

Install:

```sh
dsh plugin --profile omnimux add ./plugins/omnimux-inspiration
```

After install, restart the Host. The **灵感社区** row appears under 新会话 (placed by the shared sidebar coordinator, rank 7) and opens the inspiration stage directly. Filter by type / favorite / sort, search, or open a source URL. Unsigned users see a sign-in hint; login stays on the hub Profile page. Placement: repo `docs/contracts/settings-ui.md`.

v1 is read-first. Creating / bulk import stays on the microservice CLI and hub tools (`omnimux_inspiration_*`).

## Import: outbound requests and how to turn them off

Importing a social link asks the OmniMux cloud resolver (`omnimux_social_data`) first. When that yields no
content, the plugin falls back to public, no-key endpoints and sends **the URL you are importing** to them:

| Host | Purpose |
| --- | --- |
| `www.tikwm.com` | TikTok stream resolver |
| `www.tiktok.com` | TikTok oEmbed (title / cover) |
| `www.youtube.com` | YouTube oEmbed (title / cover) |
| `publish.twitter.com` | X post oEmbed (author / text) |

Only the post URL and a browser user agent are sent — no tokens, no library content, no credentials. The
resolver chain is bounded by a 10 s total budget and an 8 s per-request timeout.

Set the local switch to keep every imported URL on this machine; the import then relies on the cloud
resolver alone:

```sh
OMNIMUX_INSPIRATION_SOCIAL_FALLBACK=off
```

Media downloads are validated separately: only public `http(s)` targets are fetched, loopback / private /
link-local / `.local` / `.internal` targets and `file:` URLs are refused on the target and on every redirect
hop, and each download is bounded by a 60 s timeout and a 512 MB byte ceiling.

