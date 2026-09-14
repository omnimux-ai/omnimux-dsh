# omnimux-browser

[English](README.md) | [中文](README.zh.md)

OmniMux browser companion plugin and Chrome extension, forked from [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser), under the MIT license.

## Architecture

The host and Chrome extension communicate through the authenticated WebSocket bridge at `/ext/bridge`. The host exposes the `browser_*` tools; the extension executes browser actions and returns structured page text. The extension also provides a native side-panel conversation interface and captures selected text for composer references.

The endpoint belongs to the running host; do not assume a fixed port. Browser automation reads structured text rather than treating a page snapshot as an image.

## Source layout

- `package.json`: server package metadata and build commands.
- `cordis.patch.yml`: host service declaration.
- `tsconfig.json`, `tsdown.config.ts`: server compilation and bundling.
- `src/index.ts`: plugin entry and host integration.
- `src/server.ts`: WebSocket sessions and connection registry.
- `src/tools.ts`: browser tool definitions.
- `src/protocol.ts`: shared protocol frames.
- `src/client.js`: host web-client helper.
- `lib/`: compiled server output.
- `extension/`: Chrome Manifest V3 extension, with background, content and panel sources under `extension/src/`; bundled output goes to `extension/dist/`.

## Development

Run the following from `plugins/omnimux-browser` after installing the workspace dependencies:

```sh
pnpm run build:server
pnpm run build:extension
# Or build both:
pnpm run build
```

For an isolated extension preview, open `chrome://extensions/`, enable developer mode, choose **Load unpacked**, and select this checkout's `plugins/omnimux-browser/extension/dist`. Rebuild after source changes and reload that extension card. This does not update another installed copy automatically.

A separately installed distribution may use `~/.dsh/browser-extension` or `~/.omnimux-dev/browser-extension`; do not confuse it with the current checkout's output or overwrite it during isolated development.

## License and attribution

Forked from [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser). MIT; retain the original copyright notice for Yuxiang Lin.
