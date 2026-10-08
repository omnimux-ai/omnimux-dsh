---
title: "系统能力矩阵与真假源清单"
id: "core-capabilities"
type: "core"
status: "living"
authority: "L1"
date: "2026-08-14"
updated: "2026-10-08"
authors: ["x", "agent-architect"]
subsystem: "global"
tags: ["capabilities", "matrix", "truth", "seams"]
---

# Capabilities

Honest surface for both coding agents and the product agent. If a row is stub or absent, do not tell the user it works. **unproven** = 代码已写、仅 mock 测试通过、未对真实 OmniMux 跑通，不得对用户宣称可用。 Hub vs vertical I/O: [contracts/hub.md](contracts/hub.md).

## 当前定位与证据时效

现行方向见[产品定位](contracts/product-positioning.md)。本表含 2026-08 的历史实现与验证记录，状态只对所列版本和场景有效，不证明当前上线，也不决定新产品范围。模型默认值、排除列表与旧目录描述须先核对当前源码和配置，不按旧记录恢复。

角色生图/生视频的简化入口、不展示模型 ID、系统自动匹配分组属于产品要求；本次文档同步没有验证这些要求在桌面插件中全量完成。旧音频、账号、发布等行保留为技术记录，不授权删除功能，不作为当前主线宣传。无当前版本证据时不得提升为可用。

| Surface | Status | Evidence |
|---|---|---|
| `dsh plugin add ./plugins/omnimux` | **real** | 2026-08-14：`DSH_SRC=… pnpm dsh --help` 启动正常；`scripts/verify-cordis-propagate.mjs` |
| `dsh plugin add ./plugins/omnimux-workflow` | **real** | 画布工作流：DAG 编排与多模态生成节点执行 |
| Third-party compatible endpoint via `OMNIMUX_BASE_URL` env | **unproven** | 仅 OpenAI-video 兼容形；只有 OmniMux 本身经真实任务验证过 |
| `omnimux_video_submit` | **real** | [docs/evidence/2026-08-14-omnimux-video.md](evidence/2026-08-14-omnimux-video.md). Routed through `Config.media` (`omnimux` + `openai-media`) |
| Media provider route table | **real** (keyless) | `src/media/route.js`. Unknown provider/protocol fail at resolve. One live vendor row: OmniMux |
| `textComplete` / `omnimux_text_complete` | **unproven** | One-shot `ctx.llm.stream` over the enabled `Config.text.models` whitelist. Default model `gemini-3.7-flash` (`OMNIMUX_TEXT_DEFAULT_MODEL` overlays). Image-capable set measured live: [docs/evidence/2026-08-18-omnimux-modality.md](evidence/2026-08-18-omnimux-modality.md). Image stays on that request; not a second chat |
| OmniMux chat as default dsh model | **absent** | no adapter; Settings custom provider still works |
| `identity` provide for other plugins | **real** (keyless) | `ctx.get('identity').status` / `require`. PAT never in the payload. HTTP `/omnimux/auth/*` still for the browser. |
| `imageGenerate` / `omnimux_image_submit` | **real** | Default `gpt-image-2`. Live: [docs/evidence/2026-08-16-omnimux-image.md](evidence/2026-08-16-omnimux-image.md). Also live: `grok-imagine-image`. `nano_banana_2` excluded (tokens-flow 403) |
| `audioGenerate` / `omnimux_audio_submit` | **real** (keyless) | Default `suno`. Also routes `gpt-4o-mini-tts` and `whisper-1`. Full seam + workflow mapping |
| `needs-omnimux` error | **real** (keyless) | `identity.require()` throws `needs-omnimux` when unsigned. Official-only tools throw the same code when unsigned |
| `omnimux_social_data` | **partial** (live `x/tweet` probed) | Posts top-level business fields (`tweet_id`, `aweme_id`, …) with dummy `messages`; parses TikHub-style `{code,data}` envelope. Live 2026-08-30: `x/tweet` returned `text`/`display_text`, `author`, engagement, `media.video[].variants[].url` (mp4/m3u8) + thumbs. Other pairs mapped from docs but not all live-proven. Needs `OMNIMUX_API_KEY` |
| Analytics tools / routes | **unproven** | `omnimux_analytics_*` (`daily_metrics`, `best_time`, `frequency`, `content_decay`, `follower_stats`, `posts`, `sync_external`, `inbox`) + Host `/omnimux/analytics/*` wrap `/api/social/v1/analytics/*`. Unauthenticated → `needs-omnimux` |
| `omnimux_page_fetch` | **real** (unit + live HTTP + L2 Agent session) | Hub `src/reader/*`. Live 2026-08-23 HTTP probe + 2026-08-24 ego L2: Agent called `omnimux_page_fetch` → `mode live` / `jina-reader-v1` / `Title: Example Domain`; `ftp://` → `url must be http(s)`; products URL-create fetched then `products_create` (`prd_fb7ab277`). Tool `response.text()`, never `withSk` JSON. Resolves `OMNIMUX_API_KEY` from env then `$DSH_HOME/.credentials.yaml`. App window QA still needs a new session after reopen |
| Accounts / publish tools | **unproven** | `omnimux_accounts_*` + `omnimux_publish_*` wrap `/api/social/v1`. Unauthenticated → `needs-omnimux` |
| omnimux-publish publish center (plugin) | **unproven** | Migrated from personal tree (PR #80). Host `/omnimux/publish` + 9 `publish_*` agent tools (drafts, assign accounts, submit per-account subtask ledger, refresh/retry) + client stage. Keyless unit tests 175 pass; execution rides hub `omnimux_publish_*` official channel only — no live OmniMux publish claimed |
| Apps hub capability list | **real** (keyless) | Host `GET /omnimux/capabilities`. Apps overlay does not render this list |
| `modelCatalog` / `GET /omnimux/model-catalog` | **real** (keyless) | Hub seam + public HTTP. Canvas / workflow model dropdowns consume this (via workflow `/api/capabilities`). Sorted by display name; defaults overlay env → Settings → Config. Issue #314 |
| Custom provider in Settings (manual) | **upstream** | dsh Web → Add a custom provider → `https://api.omnimux.ai/v1` |
| Drama Center login / upload / payout | **docs only** | skill `tiktok-drama-center`; no tool |
| Official dsh plugin marketplace | **absent** | install via `dsh plugin add`; discover via `dsh-plugin` topic |
| OmniMux settings login (device HTTP, no CLI) | **unproven** | Host `/omnimux/auth/*` + settings 个人资料登录 + 侧栏「应用」. Keyless unit tests only; live login not claimed until a manual pass |
| OmniMux product chrome (logo / wordmark / tab title / favicon) | **real** (keyless) | Hub `src/brand` overlay + `tapIndex` boot. Tests in `plugins/omnimux/src/brand/*.test.js`. No sibling `omnimux-brand` package |
| OmniMux Apps catalog (bundled + optional remote JSON) | **real** (keyless) | Host `GET /omnimux/apps` + Apps overlay. Remote is `Config.apps.remote` (default off). Tests inject fetchers. Contract: [contracts/apps-catalog.md](contracts/apps-catalog.md) |
| Official Apps row `accounts` | **real** (keyless) | Bundled catalog lists `omnimux-accounts` (`source: bundled`). Shelf install posts the bare name to `/omnimux/plugins`; the package must be on disk (Desktop seed or a local add). Isolated add/remove: `scripts/accept-apps-install.sh` |
| Apps card actions (action-slot matrix + overflow menu + confirm bubbles + login gate) | **real** (keyless) | Hub `PluginsSection` + `open-app-flow`. Matrix tests in `plugins/omnimux/src/client/app-actions.test.js`; stage placement in `src/client/settings-placement.test.js`. Contract: [contracts/apps-catalog.md](contracts/apps-catalog.md) |
| App tabs (sidebar dynamic tab rows, `tabs.json` 0600 persistence) | **real** (keyless) | Host `GET/POST/PATCH/DELETE /omnimux/apps/tabs*` + `$DSH_HOME/omnimux/apps/tabs.json` (0600, dir 0700) + sidebar rows after 应用. Tests: `src/apps/tabs.test.js`, `src/apps/http-routes.test.js`, `src/plugins/http-routes.test.js`, `src/client/app-tabs.test.js`. Contract: [contracts/sidebar-extra-entries.md](contracts/sidebar-extra-entries.md) |
| Accounts app UI | **unproven** | App stage page (`shell.overlay`, opened from the Apps card / sidebar tab; no longer a Settings tab). v0.2 visual rebuild over `GET/POST/PATCH/DELETE /omnimux/accounts`: overview strip, card grid + table view (sortable headers, view persisted), bulk disconnect / bulk Agent toggle (serial), Agent-usable switch (optimistic PATCH), connect dialog (platform picker + auth_url + 5s poll), empty state with platform support list. Keyless-tested in `plugins/omnimux-accounts/src/client/view.test.js` + `src/filter.test.js` and hub-side in `plugins/omnimux/src/official/{http-routes,public-account,account-meta}.test.js`. Live OmniMux account list not claimed |
| Profile avatar (blobatar) | **real** (keyless) | Host `GET`/`PATCH /omnimux/avatar`; the profile page hover-**编辑** dialog re-rolls, pins a hue, uploads an image (≤200KB raster data URI), or resets. Default is `blobatarUri(username)`; customized rows persist a snapshot URI under `$DSH_HOME/omnimux/avatar.json`. Tests in `plugins/omnimux/src/avatar/*.test.js`. No network. |
| `dsh web --host 0.0.0.0` | **blocked upstream** | official CLI rejects it |

Phase labels in older notes (`A` / `B` / `C`) are history. Read each table row with its recorded date and evidence; revalidate against the current revision before claiming availability.

Do not put `fetch` to OmniMux inside a vertical. Verticals I/O only through hub seams.

Promote `omnimux_video_submit` / live generate to **real** only with: 真实 `task_id` + 产物 URL + 磁盘 mp4 + `mode: "live"` 返回日志.
