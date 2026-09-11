# omnimux-inspiration

Pinned first-level plugin for browsing OmniMux inspiration items. It renders its own sidebar row under 新会话 and opens a standalone product page over the conversation column — it does not go through the Apps catalog, the `omnimux-app-open` event, or a Settings seat. The browser only calls Host `/omnimux/inspiration` (JSON) and `/omnimux/inspiration/media/...` (covers). It does not import the hub and does not read `OMNIMUX_*` secrets.

Install:

```sh
dsh plugin --profile omnimux add ./plugins/omnimux-inspiration
```

After install, restart the Host. The **灵感社区** row appears under 新会话 (placed by the shared sidebar coordinator, rank 7) and opens the inspiration stage directly. Filter by type / favorite / sort, search, or open a source URL. Unsigned users see a sign-in hint; login stays on the hub Profile page. Placement: repo `docs/contracts/settings-ui.md`.

v1 is read-first. Creating / bulk import stays on the microservice CLI and hub tools (`omnimux_inspiration_*`).
