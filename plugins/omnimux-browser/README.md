# omnimux-browser

[English](README.md) | [中文](README.zh.md)

OmniMux browser companion plugin and Chrome extension, forked from [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser), under the MIT license.

## Architecture

The host and Chrome extension communicate through the authenticated WebSocket bridge at `/ext/bridge`. The host exposes the `browser_*` tools; the extension executes browser actions and returns structured page text. The extension also provides a native side-panel conversation interface and captures selected text for composer references.

The endpoint belongs to the running host; do not assume a fixed port. Browser automation reads structured text rather than treating a page snapshot as an image.

## Saving inspiration

The panel, sticky header, media preview and video hover actions share one worker-owned save flow. X saves target the selected post's permanent URL. Image hover saves still go to the asset library.

Only a complete host record earns the saved state. Incomplete saves retain the original text, source and available files, report partial completion, and can retry in place. Browser-local cache writes are not host-library saves. Saving never starts analysis, publication or media generation.

Submitted receipts retain the host and record identities so closing the panel or restarting the worker can resume reconciliation. Unknown results are read back before any retry; they never trigger a submission to another host. An unavailable host prompts the user to start it rather than adding an offline collection queue.

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

Host-plugin installation, extension build, distribution-copy update and the browser's loaded version are separate delivery states. Verify each applicable state rather than treating source changes as a browser update.

## License and attribution

Forked from [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser). MIT; retain the original copyright notice for Yuxiang Lin.
