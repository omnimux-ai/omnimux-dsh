# 发布资产卡片布局改进（Issue #3961）

## 背景

内容发布中心「全部记录」网格卡片当前渲染出两段可见乱码：封面区「🖼 图文 // exempt-ui04: 历史存量待迁移为矢量 SVG」与底部「exempt-ui04: 历史存量待迁移为矢量…（被裁切）」。根因是 UI04 图标门禁的 `// exempt-ui04` 豁免标记被写在 JSX 正文位置（非注释），React 把它当普通文本节点渲染。同时类型图标（🎬/🖼）与 TikTok 平台角标（🎵）仍用 Emoji，违反图标规范；封面为空白色块且居中重复了「图文/视频」类型字样；卡片高度随标题长短参差，底部状态区易错位。

## 目标

P0（必修，纯清理）：
- 删除 `AssetCard.jsx`（封面、平台簇）与 `RecordsTable.jsx`（平台列）中会漏渲染的 `// exempt-ui04` 标记。
- Emoji 图标换为矢量 SVG：封面类型图标（图片/视频）、TikTok 平台角标。
- 通过 UI04 静态门禁（`node scripts/scan-ui-gates.mjs`，本插件 0 违规）。

P1（布局）：
- 封面展示真实缩略图：优先 `cover_media_id`；图文类型用 `media_ids[0]` 兜底；无图时回退矢量类型图标（`<img>` 加载失败也回退）。
- 去掉封面居中重复的「图文/视频」字样，仅保留右上角类型角标。
- 统一卡片高度：标题固定两行高度、底部信息区位置固定，跨行卡片对齐。

## 非目标

- 不改 Host 校验、HTTP 接口、记录 schema、列表数据来源。
- 不做 P2（失败卡内联「重试」入口与失败原因摘要）。
- 不改列表/日历视图的整体结构，仅复用同一图标与卡片样式。

## 假设

- 记录列表接口返回的每条记录都含 `cover_media_id`、`media_ids` 与 `type` 字段（`store.js` 的 `viewOf` 展开完整记录），客户端可直接据此决定封面缩略图来源，无需新增接口。
- 图文记录的 `media_ids` 均为图片（提交前校验），故 `media_ids[0]` 可作为缩略图；`<img onError>` 兜底可覆盖视频/异常 id 等边界。
- 把 Emoji 换成内联矢量 SVG 不影响既有布局尺寸（原为 14–20px 文字，封面类型图标用 28px、平台角标用 12px），也不会改变任何交互行为。

## 证伪方式

- 若卡片渲染出的 DOM/源码仍包含 `exempt-ui04` 字样或 `\p{Extended_Pictographic}` Emoji，则 P0 未完成：用 `node --test` 的新断言与 `pnpm test:ui` 复跑，命中即红。
- 若 `cover_media_id` 存在的记录仍显示类型图标而非 `<img>`，或 `<img>` `src` 不等于 `mediaContentUrl(cover_media_id)`，则缩略图需求不成立；对无 `cover_media_id` 的图文记录，`src` 应等于 `mediaContentUrl(media_ids[0])`。
- 若卡片标题区高度随 1 行/2 行标题变化（两卡顶部对齐后底部错位），则等高需求不成立；以不同标题长度渲染后量取卡片高度是否一致进行反证。

## 验收

- 封面与底部均不再出现任何 `exempt-ui04` 乱码；两文件无 Emoji 图标；`node scripts/scan-ui-gates.mjs` 中本插件 0 违规（仓库既有 10 处与本改动无关）。
- 有封面记录显示缩略图、无封面显示矢量类型图标；封面不再居中重复「图文/视频」。
- 同一网格行内卡片等高，标题最多两行截断，底部平台与状态 Pill 对齐。
- `pnpm --filter omnimux-publish test` 通过；新增/更新的端到端断言通过。
- 隔离 worktree 真实浏览器（或 worktree-web QA）截图留证。

## 旧标准变更

- `plugins/omnimux-publish/tests/e2e/publish-tiktok-flow.e2e.test.mjs` 不涉及卡片；新增独立 e2e 说明文件，不修改旧断言意图。

## 证据

- 单测/端到端输出、`pnpm test:ui` 结果、截图证据落 `docs/evidence/`。
