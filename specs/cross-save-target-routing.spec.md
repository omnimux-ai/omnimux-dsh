# 保存分流：账号主页 → 账号监控，作品详情 → 灵感库（Issue #3454）

## 1. 目标与背景

侧边栏「保存到灵感库」不区分页面类型。以 TikTok 账号主页为例：面板把 `pageScene.url`（主页链接）交给 host，host 解析不到作品，按链接降级入库，产生一条无封面、无视频的 `type=link / import_status=degraded` 记录（例：`insp_fc5f339c`，标题 `boby.biggsjohnson's Creator Profile`）。用户看到「已保存」，但灵感库里几乎没有可识别的内容，账号监控里也没有这个账号。

目标：保存动作按目标 URL 的类型分流——**账号主页写入账号监控（对标账号），作品详情页写入灵感库**；覆盖 X / TikTok / YouTube / Instagram / 抖音 / 小红书 6 个平台；按钮文案与 toast 说明真实去向。

## 2. 用户旅程与界面反馈

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 在 TikTok 账号主页点保存 | 按钮文案为「保存账号到监控」；点击后 toast「已加入账号监控：@xxx」；账号监控出现该账号；灵感库不新增降级链接行 |
| J2 | 在作品详情页（视频/帖子/笔记）点保存 | 按钮文案为「保存到灵感库」；行为与今天的灵感库保存一致，toast 不变 |
| J3 | 在抖音/小红书账号主页点保存 | 同 J1 入账号监控；该账号刷新状态为终态错误，原因明确为「该平台暂不支持自动刷新（云端采集未接入）」，且不进入退避重试 |
| J4 | 短链（v.douyin.com、xhslink.com、youtu.be 等）或无法分类的 URL | 按作品处理，走灵感库保存，不新增失败态 |
| J5 | 重复保存同一账号 | toast「该账号已在账号监控中」，不新增行（host 返回 `existing: true`） |
| J6 | host 不可达 / 分类接口失败 | 回退到原灵感库保存流程；保存失败时仍显示既有失败提示，绝不出现假成功 |
| J7 | 重复保存同一作品 | 维持现有灵感库去重行为，不新增行 |

## 3. 平台 URL 分类契约（host 单一真源）

分类函数：`plugins/omnimux-inspiration/src/rival/rival-identity.js` 的 `detectInputKind`；平台识别：`plugins/omnimux-inspiration/src/url-normalizer.js` 的 `PLATFORM_PATTERNS` / `detectPlatformFromUrl`。

| 平台 | 账号主页（→ account） | 作品详情（→ content） | external_id_kind |
| --- | --- | --- | --- |
| x / twitter | `/:handle`（单段且非保留词）；`/handle/with_replies` 等子页仍视为账号 | `/status/:id`、`/i/status/:id` 及一切非主页路径 | `username`（`@handle`） |
| tiktok | `/@handle`、`/user/@handle` | `/@handle/video/:id`、`/@handle/photo/:id`、`/t/:id`、`/v/:id`、其余非主页路径 | `username`（`@handle`） |
| youtube | `/@handle`、`/channel/UC…`、`/c/:name`、`/user/:name`、裸 `/:name` | `/watch?v=:id`、`/shorts/:id`、`/live/:id`、`/embed/:id`、`youtu.be/:id` | `channel_id` / `handle-unverified` |
| instagram | `/:handle`（单段且非保留词） | `/p/:code`、`/reel/:code`、`/reels/:code`、`/tv/:code`、`/stories/…` | `username`（`@handle`） |
| douyin | `/user/:sec_uid`、`/share/user/:sec_uid` | `/video/:aweme_id`、`/note/:id`、`/share/video/:id`，短链 `v.douyin.com/:code` | `uid`（sec_uid，不带 `@`） |
| xiaohongshu | `/user/profile/:user_id` | `/explore/:note_id`、`/discovery/item/:note_id`、`/item/:id`，短链 `xhslink.com/:code` | `uid`（user_id，不带 `@`） |

补充规则：
- 平台识别新增：`douyin.com`、`iesdouyin.com` → `douyin`；`xiaohongshu.com`、`xhslink.com` → `xiaohongshu`。使用 `hostMatchesDomain`（点边界匹配），不做子串匹配。
- 短链本身解析不出身份（无网络请求），一律 `kind: 'content'`，交给灵感库流程；host 不发起额外网络解析。
- 未支持的平台（facebook/threads/任意站）维持今天的 `unknown`，调用方按作品处理。

## 4. 接口契约

| 接口 | 请求 | 响应 |
| --- | --- | --- |
| `POST /omnimux/inspiration/local/rival-accounts/classify`（已存在，扩展覆盖） | `{ url }` | `200 { data: { kind: 'account'\|'content'\|'unknown', platform, external_id?, handle? } }` |
| `POST /omnimux/inspiration/local/rival-accounts`（已存在，扩展平台） | `{ url, background: true }` | `201 { data: account }` ；重复：`200 { data: account, existing: true }` |
| 扩展消息 `DSH_CLASSIFY_SAVE_TARGET`（新增） | `{ url }` | `{ ok: true, kind: 'account'\|'content'\|'unknown', platform, handle? }` / `{ ok: false }` |
| 扩展消息 `DSH_SAVE_INSPIRATION_PANEL`（已存在，扩展响应） | 现有 payload | 成功：`{ ok: true, target: 'account'\|'inspiration', handle?, existing? }`；失败：`{ ok: false, code?, message? }` |

分流规则（后台 service worker 唯一决策点）：`kind === 'account'` → 账号监控导入；其余（content/unknown/分类失败）→ 现有灵感库保存。分类失败不得阻断保存。

面板行为：
- 页面 URL 变化时向后台发 `DSH_CLASSIFY_SAVE_TARGET`（去抖），拿到 `kind` 后更新按钮文案：
  - `account`：「保存账号到监控」（en: `Save account to monitor`）
  - 其他：「保存到灵感库」（en: `Save to Inspiration Library`）
  - 保存成功后按钮状态：account →「✓ 已加入账号监控」；其他 →「✓ 已保存到灵感库」
- toast 文案：
  - account 新增：「已加入账号监控：@{handle}」（en: `Added to account monitor: @{handle}`）
  - account 已存在：「该账号已在账号监控中」（en: `Already in account monitor`）
  - 其他：沿用「已保存到 OmniMux 灵感素材库！」/ `Saved to Inspiration Library!`
  - 失败：沿用现有失败文案（含 431 分支）。

## 5. 抖音 / 小红书账号刷新终态

`omnimux_social_data`（hub）的 platform 枚举只有 tiktok/instagram/youtube/x，云端没有抖音/小红书采集能力。

- 在 `rival-accounts-service.runCycle` 进入远端调用前判断：平台不在云端集合（新增常量，如 `CLOUD_RIVAL_PLATFORMS`）→ 抛 `RivalRemoteError`，code `platform-unsupported`，message「该平台暂不支持自动刷新（云端采集未接入）」，`callsUsed: 0`。
- `rival-refresh.onFailure`：`platform-unsupported` 与 `identity-unverified` 同等视为终态——`refresh_state: 'error'`、`next_auto_refresh_at: null`，不进入 backoff，避免重试风暴。
- 手动刷新（`POST .../rival-accounts/:id/refresh`）与 `refresh-all` 走同一路径；错误原因必须在账号行可见。
- 账号导入本身仍成功（201），刷新失败只落到该账号的 error 状态。

## 6. 影响范围

Host（`plugins/omnimux-inspiration`）：
- `src/url-normalizer.js`（平台表）
- `src/rival/rival-identity.js`（6 平台分类 + 身份）
- `src/rival/constants.js`（云端平台集合、错误码、identity kinds）
- `src/rival/rival-accounts-service.js`（runCycle 守卫）
- `src/rival/rival-refresh.js`（终态判定）
- `src/client/RivalPlatformMark.jsx`、`src/client/RivalAccountFilter.jsx`、平台名/筛选展示（抖音/小红书图标与标签）
- 对应 `*.test.js`

Extension（`plugins/omnimux-browser`）：
- `extension/src/panel/App.tsx`（分类状态、按钮文案、toast、响应处理）
- `extension/src/background/index.ts`（分类消息 + 保存分流）
- 新增纯函数模块（如 `extension/src/background/save-target.ts`、面板文案映射），便于行为级单测
- `extension/tests/*.spec.ts`（新增分流 spec，更新既有 save-inspiration 契约）

## 7. 非目标

- 抖音/小红书云端采集接入、作品详情导入解析（现有 `socialFetcher` 无该平台，作品保存仍按现状处理）。
- 历史已保存的 degraded 链接记录迁移/清理。
- 账号监控的其它平台扩展（facebook/threads 等）。
- 侧边栏品牌图标/新的平台 registry 扩展（面板按钮不使用平台图标）。

## 8. 全新用户基线

- 仅依赖本机 OmniMux host（默认候选端口 45120/43120）与浏览器扩展；不依赖开发机私有状态、模型服务或 Dev profile 路径。
- host 不可达时：面板保留原保存流程与失败提示；分类消息返回 `ok: false` 时按钮回退为「保存到灵感库」。
- 抖音/小红书账号监控条目只影响该账号自身状态，不影响其它账号刷新。

## 9. 测试与验收

Host：
- `cd plugins/omnimux-inspiration && npm test`（或 `node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js`）。
- 新增用例：6 平台 × 主页/作品分类（含短链、query 参数、保留词）；抖音/小红书导入后刷新为终态且 `next_auto_refresh_at=null`；classify 路由返回 6 平台身份。
- 客户端平台展示用例：抖音/小红书平台标识与筛选标签存在且不退化为 X 图标。

Extension：
- `cd plugins/omnimux-browser/extension && npx vitest run tests/save-target-routing.spec.ts tests/save-inspiration-rpc.spec.ts`（其余相关 spec 一并跑）。
- 新增用例：纯函数分流（account→账号监控、content/unknown/失败→灵感库）；后台消息分流；面板文案与 toast 文案（zh/en）；失败不显示成功。
- 契约文本用例：`DSH_CLASSIFY_SAVE_TARGET`、`rival-accounts/classify`、`rival-accounts` 调用存在。

浏览器证据：触及灵感库客户端 UI（平台标识/筛选）时，在隔离 worktree 内用真实浏览器验证账号监控中抖音/小红书账号行渲染与筛选，保留截图/结构化报告（见 `docs/contracts/plugin-qa.md`）。侧边栏扩展行为由扩展单测覆盖；Dev 45120 真机验收属人工职责，不作为交付卡点。

## 10. 风险与回滚

- 风险：路由错误会把作品存进账号监控（或反之）。缓解：host 分类为唯一真源，扩展只在 `kind==='account'` 时走账号导入；账号导入失败时回退到灵感库保存并提示真实错误。
- 风险：抖音/小红书账号行在客户端渲染异常（未知平台图标/筛选）。缓解：补平台标识与筛选，缺省不崩。
- 回滚：本改动只新增分流与平台支持，回滚即恢复单一灵感库保存路径；不迁移、不删除任何已有数据。
