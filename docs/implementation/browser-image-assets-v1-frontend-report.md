---
title: "V1 前端首次实施报告"
id: "implementation-browser-image-assets-v1-frontend"
type: "log"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 前端实施报告 · 浏览器图片经悬浮胶囊真实入资产库（#3052）

> 主理人及 QA 后续发现批准目标地址绑定、媒体代次、重复保存、title/unknown 渠道及首动作 busy 分离仍需补齐，已退回前端。本文保留首次自报，不是 PM_SIGN_OFF 或真实扩展端到端通过证据；整批模块缺失 RED 不能代表逐切片 TDD 已合规。

实施者：前端开发工程师 · 裴像素。日期：2026-10-03。
工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`；分支 `agent/cross-browser-image-assets-issue-3051`；基线 `d95764912e36da01d879ab65d6340469b48a4625`。
范围：仅 `plugins/omnimux-browser/extension/src/` 与 `extension/tests/` 新增两个测试文件。未改 `media-trigger.ts`（V2）、Host `src/`、`src/assets`、根配置/依赖、既有测试断言，未 git add/commit（主理人统一提交）。

## 1. 四件套与 design 核定

- 已读 `design.md`（v2.0）：胶囊沿用既有小尺寸/材质例外（media-hover-instant-reveal 已批准），图标全部为矢量 SVG，无 Emoji/字符图标、无裸色新增、无第四动作、无徽章/副标题/横条。
- 已读四件套：PRD（仅两入口图片第一动作改目的地）、Prototype（角标/胶囊展开三动作）、UI-Spec（§2 白名单、§3 逐字文案、§5 图标核定、§6 矩阵）、Plan（前置检查与验收层次）、PM_PREFLIGHT（PASS，待确认项沿用建议口径）。
- 已读技术 spec `specs/browser-image-assets.spec.md`、V1 票、wire 合同 `browser-image-assets-wire-contract.md`、`plan-notes.md`。
- 文案字典 100% 取自 UI-Spec §3.1 逐字表（zh/en 各 10 条：idle/busy/done/hostUnavailable/downloadFailed/saveFailed/unavailable/typeUnknown/unconfirmed/defaultName），写入 `copy.ts` 的 `image` 子表；视频/复制/对话原表一字未改。
- 资产图标逐字复用 `omnimux-assets/src/client/sidebar-entry.js:10` 的 viewBox=22 `currentColor` path 几何，绘于胶囊既有 14px 字形槽；busy=既有 plus、done=既有 check、视频 star 不变；SVG 根属性前缀契约未变（media-brand-icon 回归全绿）。

## 2. 实现文件

| 文件 | 改动 |
|---|---|
| `src/content/media-hover/copy.ts` | 新增 `ImagePrimaryCopy` 接口与 `image` 字典（zh/en 逐字） |
| `src/content/media-hover/save-intent.ts` | 新增：`resolveSaveIntent`（image→image-asset / video→video-inspiration / 其他→unknown），独立于复制/对话 payload 语义 |
| `src/content/media-hover/messages.ts` | 新增 `RUNTIME_MESSAGE.mediaToAssets = 'DSH_MEDIA_TO_ASSETS'` |
| `src/content/media-hover/overlay-icons.ts` | 新增 `asset` 图标（核定 path 原样，专用 fill root），CapsuleIcon 扩键 |
| `src/content/media-hover/capsule.ts` | 第一槽按意图绘 asset/bulb；idle/busy/done aria-label 走 UI-Spec 字典；`aria-busy` 落位；按钮加 `data-icon` 可断言标记；视频 star/灯泡原样 |
| `src/content/media-hover/actions.ts` | 新增 `saveImageToAssets`：发 DSH_MEDIA_TO_ASSETS+requestId；严格校验 `saved/duplicate+非空 assetId/fileId+有限 lrev` 才算成功；全状态映射逐字文案；outer ok 空 result→unconfirmed |
| `src/content/media-hover/overlay.ts` | 第一动作显示与点击共用 `resolveSaveIntent`；busy 单飞沿用；`runAction` 捕获 payload.id，回执落地前比对 activeId，旧回执不串新媒体；`resolveHint` 使 hover/busy/done 提示同源 |
| `src/background/save-image-assets.ts` | 新增：`saveImageAssetRpc` 仅经当前已握手 bridge 调 `omnimux.saveImageAsset`（`{requestId,url,pageUrl,title?}`，限长）；无连接/无 `imageAssetSave` cap→host-unavailable；未发送→host-unavailable；发出后回执丢失→save-unconfirmed；业务失败 outer-ok 透传；空 result/形状不符→save-unconfirmed |
| `src/background/index.ts` | 注册 `DSH_MEDIA_TO_ASSETS` handler（校验 image+https src）；`pendingImageAssetSaves` 按 requestId 跟踪，断连即 fail-all→save-unconfirmed，绝不跨代次/跨 host 重投；无灵感库/storage/多端口兜底 |
| `tests/image-assets-capsule-v1.spec.ts` | 新增 29 用例：意图路由、双语逐字、图标、bridge 消息合同、overlay busy/done/失败/未确认/防重/旧回执隔离、视频与复制不回归 |
| `tests/image-assets-background-v1.spec.ts` | 新增 15 用例：RPC 形状、requestId、dup、缺 cap/无 bridge 拒绝、无灵感兜底、video/blob 拒绝、空 result/假 saved/断连均 unconfirmed、不重投其他 host |

## 3. 红 → 绿证据

- 胶囊 spec：先红（模块不存在 → 29 用例全失败于 import）→ 实现后 6 个 locale 断言失败（jsdom 默认 en）→ 修语言环境后 **29/29 绿**。
- 背景 spec：首跑 12/15（2 个 error.message 形状断言 + 1 个不重投断言）→ 最小实现修正后 **15/15 绿**，断连反馈由 30s RPC 超时降为立即 fail-pending。
- 回归：media-hover 相关 16 文件 **206/206**；background 相关 17 文件 **150/150**；全量 extension **1343 通过 / 0 失败**（34 个 unhandled undici WebSocket 噪音与主检出基线一致，同一两 spec 基线复跑同样 23 个，与本改动无关）。
- 既有断言未改一处；`media-brand-icon` 对 svgIcon 前缀契约的断言仍绿。

## 4. 类型与构建

- `tsc -p tsconfig.json --noEmit`：本改动文件零错误；仓库基线预存错误（App.tsx、twitter-copilot、media-hover-video-visibility.spec、overlay 两个基线 unused）未动。
- `node scripts/build.mjs`（Chrome）：✓ built，dist 产物正常。
- `node scripts/build.mjs --firefox`：✓ built。
- `node scripts/verify-plugin-boundaries.mjs`：3882 文件 PASS。
- `git diff --check`：PASS。
- 门禁：两份新测试已在主检出 `.tmp/anti-cheat-exemptions.json` 预登记（EXEMPT-3052-CAPSULE / EXEMPT-3052-WORKER）；guard-quality-loop 经 `.agent-reports/browser-image-assets/v1-frontend-seam-evidence.md` 任务专属证据放行；所有命令直接 node 入口，未触发 pnpm 自动安装。

## 5. wire 合同遵守核对

- `DSH_MEDIA_TO_ASSETS` payload 沿用 HoveredMedia 且仅 type=image 才发出；`requestId` ≤128、`url`/`pageUrl` ≤8192、`title` ≤200。
- `omnimux.saveImageAsset` 只经当前 hello 完成且 `imageAssetSave===true` 的本机 bridge；不轮询端口、不写多 host、不碰 `dshMediaInspiration`/storage。
- 成功仅认 `{status:'saved'|'duplicate', assetId≠'', fileId≠'', finite lrev}`；明确业务失败仍 outer-ok 透传 status；空 result/坏形状→save-unconfirmed；传输级未发送→host-unavailable。
- 配对 token 与批准 URL 由既有 settings+bridge.start 绑定，未新增扫描写入；异步代次断连即失效，不重投。
- 后端已实现同合同（protocol.ts `BRIDGE_SAVE_IMAGE_ASSET_METHOD`、hello caps `imageAssetSave?: true`、rpc.result ok:true+outcome），前端消费形状与其一致。

## 6. UI-Spec 终验自查（FRONTEND_SELF_CHECK: PASS）

- 三动作顺序 inspiration/copy/attach 未变；仅图片第一动作换图标/文案/目的地；胶囊 24×24→128×24 几何、材质、动效未动。
- idle `加入资产库` / busy `正在加入资产库` / done `已加入资产库` / 五类失败与未知原位短提示逐字一致（zh/en 均验证）；失败不亮勾、恢复 idle；done 仅真实 strict receipt 后 check；视频 bulb/star/Add to library 原样；复制 `复制`/`复制素材链接`、对话 `加入对话` 原样。
- 无第四动作、徽章、副标题、横条、弹窗、Emoji；单条原位 tooltip 复用既有 3 秒 dismiss 与离开隐藏规则；`aria-busy` 与 aria-label 同状态更新。
- 同一媒体会话 saved 保持；重复点击不取消、不发第二请求；切媒体重渲染重派生意图，旧回执不点亮新媒体。
- 未知/不可保存：payload 非 image 或无 http(s) src 时 worker 拒 invalid-media（动作层映为 `该图片无法保存`）；resolveSaveIntent unknown 时反馈 typeUnknown 且不发起写入。

## 7. 未测项（如实缺项，不冒充通过）

- **真实浏览器 E2E 未执行**：真实扩展 + 真实宿主点击入库、资产库可见可预览闭环未验证（#47 真实浏览器空间归主理人，不自行开空间；本机未授权自行跑真机验收）。
- host RPC 真实回执、下载/解码/落库链路未端到端实测（后端角色侧另有 `image-assets-v1` / `image-assets-rpc-v1` 测试证据，本报告只覆盖 extension 侧行为）。
- Firefox 实际运行时未验证（仅构建通过）。
- Chrome MV3 service worker 回收期间在飞保存：worker 回收即丢弃 pending 与 sendResponse 通道，行为等效“未确认”，未实测。
- 双宿主并存切换实例的真实投送（V3 范围）未测。
- 角标（media-trigger.ts）、TikTok `/video/` 封面语义、X 播放器 poster 语义属 V2，本票未实现、未触碰。
- `caps` 与握手代次的细粒度：hello.ok 后至 rpc 发出之间若桥切换，按 `bridgeConnected`+pending fail 处理为 unconfirmed；极端时序未测。
- 视觉验收截图：本票为逻辑/状态级实现，胶囊视觉与几何未改，未截取新页面截图。
