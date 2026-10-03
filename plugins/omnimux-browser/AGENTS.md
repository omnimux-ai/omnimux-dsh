# omnimux-browser (extension & bridge)

Browser capability plugin: background bridge, page-level overlay/capsule, and side-panel assistant. Root [AGENTS.md](../../AGENTS.md) applies; this file defines browser-specific hard boundaries.

## Owns / does not own

| Owns | Never owns |
| --- | --- |
| Extension targets (`extension/src`: background, content, panel) and build (`extension/dist`) | Core execution hub routes or credentials |
| Media hover assistant (`media-hover/`: capsule, card-region, detection) | Direct modifications to third-party website DOM |
| Surface triggers on social media platforms (`surfaces/` e.g. TikTok, X) | General browser automation infrastructure |
| Local protocol bridge between browser extension and DSH Host | Electron native window or desktop host shell |

## Hard bounds

- **Build output truth**: Browsers load `extension/dist/`. Code edits in `extension/src` MUST be built via `node scripts/build.mjs` before extension reload.
- **Dependency isolation**: `extension/node_modules` MUST NOT contain symlinks pointing into `.worktrees/*`. All symlinks must resolve to root `node_modules/.pnpm/`.
- **Video capsule anchoring**: Video hover capsule MUST anchor at `top-right` with 14px insets, stepping left of player corner controls (14–96px); pinned by CSS `right` to expand leftwards. Never place it near the bottom-left player controls. Image capsule remains `bottom-left`.
- **Hit-test purity**: Corner probe (`probeCornerControl`) MUST skip overlay nodes (`MEDIA_OVERLAY_HOST_ID` and Shadow DOM descendants) via `elementsFromPoint` to avoid self-occlusion.
- **Layout viewport alignment**: Right-pinned geometry MUST clamp against `documentElement.clientWidth` (layout viewport), never raw `innerWidth` with scrollbars.
- **Visibility handling**: The overlay hides on genuine document `visibilitychange: hidden`. Never bypass pointer-loss safety based on synthetic test-tool events.

## Verify

| Scope | Command |
| --- | --- |
| Extension unit tests | `cd plugins/omnimux-browser/extension && pnpm test` |
| Extension bundle build | `cd plugins/omnimux-browser/extension && node scripts/build.mjs` |
| Extension typecheck | `cd plugins/omnimux-browser/extension && pnpm typecheck` |
| Server plugin build | `pnpm --filter omnimux-browser build:server` |
