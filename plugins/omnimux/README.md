# omnimux

Execution hub for landing OmniMux on official dsh. Not a gateway: OmniMux cloud owns HTTP; this package exposes seams and tools. Product chrome, identity, model routes, and media seams live here. Verticals send requests in and take results out. Do not split chrome or identity into a sibling plugin. Third-party compatible media endpoints are configured here. Official-only tools stay here because only OmniMux cloud implements them.

I/O and the seam list: repo `docs/contracts/hub.md`.

`ctx.provide('videoGenerate' | 'imageGenerate')` then `api.execute({ prompt, dest, … })`. Default waits until the file is on disk (`mode: "live"`). `wait: false` returns `{ mode: "submitted", taskId }`. `{ dest, taskId }` skips submit and only polls then downloads. Tools: `omnimux_video_submit`, `omnimux_image_submit`. Default image model is `gpt-image-2` (`OMNIMUX_IMAGE_MODEL`). The hub resolves `Config.media` (provider → protocol → vendor fields). The hub does not keep a task ledger.

Polling is bounded (Issue #1382): one media task polls for **20 minutes** — `{ taskId, submittedAt }` anchors that window at the original submit time, so finishing a task from a previous process does not restart the clock; passing a `submittedAt` already past the window fails immediately with `omnimux-task-timeout` and issues no request. Speech keeps its historical 10 minutes. One poll GET has a 10-second timeout that really reaches `fetch`, transient failures (connection jitter, a request timeout, 429/408/409, retryable 5xx) are retried with backoff inside a 7-second budget, and a task the upstream does not know fails as `omnimux-invalid-request` — the answer a caller reads as "nothing to reconcile, submit again". Quota, authentication, an unavailable channel, upstream terminal failures and caller cancellation are never retried. A synchronous call (`metadata.wait`, i.e. no `wait: false`) is bounded by a 21-minute outer budget — strictly above the poll window, so the task-level `omnimux-task-timeout` is the error a caller sees rather than an opaque provider-runtime abort. Override per request with `deadlineMs` / `pollIntervalMs` / `requestTimeoutMs`; there is no environment variable. The single source is `src/media/task-deadline.js`, and every default stays strictly below the workflow's 30-minute whole-run timeout.

`ctx.provide('textComplete')` then `api.execute({ prompt, model?, image?, … })` runs one `ctx.llm.stream` call on an enabled `Config.text.models` row. Tool: `omnimux_text_complete`. Not a second chat: no parent messages, no tools, image stays on that request. A text-only call must name `model`. An image call may omit it and uses `grok-4.6` (`OMNIMUX_VISION_MODEL`). The eleven chat-directory models start enabled.

Official-only page fetch: `omnimux_page_fetch({ url })` POSTs `/v1/reader` with locked model `jina-reader-v1` (`OMNIMUX_API_KEY`). Success is `text/plain` markdown parsed to `{ mode, model, url, title, pageContent }`. Do not reuse the JSON `withSk` client. Verticals must not open this HTTP themselves.

## Identity (settings)

The Web client registers **个人资料** as a Settings page (`settings.section`) and **DSH 插件** as a tab under official **设置 → 插件** (`settings.plugins.tab`). **应用** sits in the left sidebar. **DSH 插件** is mounted only when the OmniMux desktop injects `OMNIMUX_DSH_CLI`; it installs npm packages into the `omnimux` profile through packaged `dsh plugin`. Clicking Apps fills the conversation column (`shell.overlay` over `[data-slot="conversation"]`); it is not a sidebar menu. The button is injected under 新会话 (same DOM seat as 任务看板), immediately above that family block. Host talks to OmniMux device-login HTTP itself (`POST /api/user/device/code` and `/token` on the site origin). The OmniMux CLI is not required. Plugin UI seats: repo `docs/contracts/settings-ui.md`.

The agent's `web_search` (official `web-search-deepseek` provider) needs a DeepSeek API key under the `DEEPSEEK_API_KEY` credential reference. The canonical configuration surface is the official **Settings → 插件 → Web Search** card (`settings.plugin.item`), which writes the key through the credentials domain — the same store this plugin's login token uses. No product settings page is registered for it.

Host plugins read `ctx.get('identity')`: `status({ verify })` returns the public profile; `require()` throws `needs-omnimux` when unsigned. The browser still only calls `/omnimux/auth/*`.

The signed-in **个人资料** page shows a deterministic [blobatar](https://github.com/Alain00/blobatar) from the username. Hover the face and click **编辑** for the avatar dialog: **换一个** re-rolls, the colour row pins a hue, **上传图片** accepts a PNG/JPEG/WebP/GIF under 200KB, and **恢复默认** clears everything. Host `GET`/`PATCH /omnimux/avatar` reads and writes per-profile overrides (`$DSH_HOME/omnimux/avatar.json`). A first login with no stored row is the default; any change persists a snapshot URI so a later library upgrade never moves a customized face.

Two keys, two URLs:

| Key / URL | Purpose |
|---|---|
| `OMNIMUX_ACCESS_TOKEN` in `$DSH_HOME/.credentials.yaml` (or `$DSH_HOME/omnimux/access-token`) | Who you are. Issued by device login. Never sent to the browser. |
| `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN` | Metered video/API calls. Unchanged. |
| `DEEPSEEK_API_KEY` in `$DSH_HOME/.credentials.yaml` | Agent `web_search` (official `web-search-deepseek` provider). Configured from the official **Settings → 插件 → Web Search** card; never sent to the browser. |
| `OMNIMUX_SITE_URL` or config `siteBaseUrl` (default `https://omnimux.ai`) | Login and `/api/user/self` |
| `OMNIMUX_BASE_URL` (default `https://api.omnimux.ai/v1`) | Video API |

Startup only describes the stored access token. Settings **个人资料** can start device login (`client_name: omnimux`). **应用** lists official catalog rows from `GET /omnimux/apps` without a login gate.

Official Apps rows come from `apps/catalog.json` (floor) plus an optional Host GET of `{siteBaseUrl}/apps/catalog.json` when `Config.apps.remote` is true. The cache is `$DSH_HOME/omnimux/apps/`. The browser never fetches the site file. Install uses the catalog's pinned `install_spec` through `/omnimux/plugins`. The first official row is `accounts` (`omnimux-accounts@0.1.0`). Connected accounts are listed on Host `GET /omnimux/accounts`. Contract: repo `docs/contracts/apps-catalog.md`.

## Product chrome

The host half embeds overlay config in the Web index (`window.__OMNIMUX_BRAND__`). The browser half covers official whale / wordmark / tab title / favicon without detaching React nodes. Empty-session hero mark prefers the official `conversation.hero.brand.mark` slot (`priority: -10`); `coverHeroFish` remains the DOM fallback. Config fields (all optional): `productName`, `logoSvg`, `wordmarkText`, `replaceHeroMark`, `hidePreviewBadge`, `rewriteWelcome`, `heroHeadline`, `heroHeadlineFit`, `heroHeadlineMaxPx`, `heroHeadlineMinPx`. Defaults are OmniMux (`heroHeadline` = `属于你的AI社媒运营团队`; headline fit on, 26px→16px) so a narrow session column does not wrap a trailing CJK glyph.

Do not export a `sk-` as `OMNIMUX_ACCESS_TOKEN`. Do not split chrome into a sibling plugin.
