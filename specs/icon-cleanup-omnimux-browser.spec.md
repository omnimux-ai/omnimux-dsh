# Spec: omnimux-browser icon residue cleanup

## Goal

Remove stale / duplicated extension icon files under `plugins/omnimux-browser/extension/` so that only the lavender `#b8b7ff` OmniMux ghost set used by `manifest.json` remains in the source tree.

## Background

The brand has converged on a single lavender ghost icon (RGBA 184,183,255). `manifest.json` and `manifest.firefox.json` reference only `assets/icons/icon{16,32,48,128}.png`. The source tree additionally carries:

- `extension/assets/icons/deepseek-256.png` — misleading name; byte-identical to `icon128.png` (128×128 lavender ghost). Referenced by `extension/src/panel/App.tsx` via `import whaleUrl from '../../assets/icons/deepseek-256.png'` as the assistant-avatar image in the panel.
- `extension/assets/icons/deepseek.ico` — 209,762-byte single-frame ICO of the legacy DeepSeek whale. Zero source references.
- `extension/assets/icons/icon-{16,48,128}.png` — hyphen-named duplicates of `icon{16,48,128}.png` (MD5-identical). Zero source references.
- `extension/icons/` — parallel top-level directory holding `icon-{16,48,128}.png`. **Build-time copy source**: `extension/vite.shared.ts:30` unconditionally `cpSync`s this dir into `outDir/icons`, and `manifest.json` `web_accessible_resources` still lists `"icons/*"`. Deleting it causes `ENOENT` in the `copy-manifest` `closeBundle` step. **Keep.**
- `extension/assets/icons/omnimux-256.png` — byte-identical lavender ghost, the brand-correct name; currently unreferenced.

`extension/dist/` and `extension/dist-firefox/` are build artifacts and are out of scope.

## Changes

1. `extension/src/panel/App.tsx`: repoint `whaleUrl` import `../../assets/icons/deepseek-256.png` → `../../assets/icons/omnimux-256.png`. Pixel-identical asset (same MD5), no visual change.
2. Delete `extension/assets/icons/deepseek-256.png`.
3. Delete `extension/assets/icons/deepseek.ico`.
4. Delete `extension/assets/icons/icon-{16,48,128}.png` (hyphen series duplicates).
5. Keep `extension/icons/` — `vite.shared.ts:30` cpSync hardcodes it as the build copy source; `manifest.json` `web_accessible_resources` wildcard `icons/*` also resolves against it. Removing it ENOENTs the build.
6. Leave `extension/dist/` and `extension/dist-firefox/` untouched (next build regenerates).
7. Leave `assets/icons/icon.svg`, `icon{16,32,48,128}.png`, `omnimux-256.png` in place.

## 假设

这是一次纯清理（chore/bugfix 性质），不改任何运行时行为。根因假设：品牌收敛到 lavender ghost 后，早期残留的 deepseek 命名、连字符命名副本被遗忘，而 `App.tsx` 里对 `deepseek-256.png` 的引用只是因为该文件恰好存在且内容正确——把它换成语义正确的 `omnimux-256.png`（MD5 相同）不会引起任何视觉或 bundle 差异。所有待删文件都经 `grep -rIn` 在源码与 manifest 中确认零引用。

修正：原假设把 `extension/icons/` 顶层目录误判为冗余。实际上 manifest 的 `assets/icons/*` 声明走 `assets/icons/`（运行时资源），但 `extension/icons/` 是 `vite.shared.ts:30` `cpSync` 的**构建期无条件复制源**（产物落到 `dist/icons/`），且 `manifest.json` `web_accessible_resources` 的 `"icons/*"` 通配也指向它。grep 查不到「源码 import」不代表它无消费者——它是构建脚本硬编码路径，删了 `closeBundle` 直接 `ENOENT`。

## 证伪方式

如果假设错误，下列可观测结果会证伪：

1. `grep -rIn "deepseek-256\|deepseek\.ico\|icon-\(16\|32\|48\|128\)\.png" plugins/omnimux-browser/extension --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.html" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-firefox` 仍能命中**除** `.agent-backups` / `.agent-reports` / `.workbuddy` / research 之外的源码引用 → 说明还有未发现的消费者，删除会破坏它。
2. `extension/src/panel/App.tsx` 改指向 `omnimux-256.png` 后 `md5 extension/assets/icons/omnimux-256.png` ≠ `5fbd77728d48e0b79475af40a021ae60`（deepseek-256.png 的 MD5）→ 说明视觉会变，不能删。
3. `pnpm --filter omnimux-browser exec tsc --noEmit` 或 panel 构建报 `Cannot find module '../../assets/icons/omnimux-256.png'` → 说明新路径解析失败。
4. 删除后 `ls plugins/omnimux-browser/extension/assets/icons/icon{16,32,48,128}.png` 任何一个缺失 → manifest 引用的资源被破坏。
5. `extension/icons/` 若被删除，`vite.shared.ts:30` 的 `cpSync(resolve(import.meta.dirname, 'icons'), ...)` 在 `closeBundle` 抛 `ENOENT: no such file or directory` → 构建失败，证明该目录是构建依赖而非冗余残留。

## Acceptance

- `grep -rIn "deepseek-256\|deepseek\.ico" extension/src extension/manifest*.json` → no hits.
- `grep -rIn "icon-\(16\|32\|48\|128\)\.png" extension/src extension/manifest*.json` → no hits.
- `manifest.json` unchanged; the four `assets/icons/icon*.png` it references still exist.
- Panel assistant avatar still renders (bundler import resolves to `omnimux-256.png`, same MD5).

## Out of scope

- No manifest changes. No `dist/`/`dist-firefox/` rebuild. No node_modules. No `.agent-backups/` / `.agent-reports/` / `.workbuddy/` / research docs.
