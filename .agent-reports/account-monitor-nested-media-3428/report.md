---
title: "账号监控嵌套媒体/统计映射与无封面兜底（#3428）"
id: "evidence-account-monitor-nested-media-3428"
type: "evidence"
status: "verified"
authority: "L3"
date: "2026-10-20"
authors: ["agent"]
subsystem: "omnimux-inspiration"
---

# 账号监控嵌套媒体/统计映射与无封面兜底（#3428）

任务 Issue [#3428](https://github.com/omnimux-ai/omnimux-dsh/issues/3428)，base `01647e1c5539d7e014e1260eadf6798da6c0b657`，任务工作树 `.worktrees/inspiration-rival-media-issue-3428`，分支 `agent/inspiration-rival-media-issue-3428`。本文件只记录实际执行的检查与真实浏览器结果，不把单元测试、HTTP 200 或 Dev 人工验收混为一谈。

## 问题与范围

云端 `omnimux_social_data` 返回 TikHub 原始结构，作品媒体与统计在 `video.cover.url_list`、`video.play_addr.url_list`、`video.duration`、`image_post_info.images[]`、`statistics.*`、X `media` 等嵌套层；账号监控解析器只探顶层扁平键，作品以空媒体入库。客户端又对 TikTok 固定渲染 9:16 `<img>`，无封面时成为黑板；`-1` 排序哨兵被显示成「播放 -1」。

本次改动：

- `src/rival/rival-parsers.js`：新增 `nestedPostFields` 单层嵌套白名单取值（封面/视频/时长/比例/图片列表/统计），只在扁平字段缺失时回填并把来源写回 `field_probe`；`normalizeRivalPost` 输出 `ratio`。
- `src/client/RivalPostCard.jsx`：无封面时渲染命名占位（平台标记 + `noCover` 文案），不再输出空 `src` 的 `<img>`；未知播放量（`-1`）显示 `--`。
- `src/client/rival-styles.js`：占位沿用媒体块几何与暗底，仅补充布局样式。
- 单测：嵌套 TikTok aweme / X media 夹具、占位渲染、未知播放量断言；`account-monitor-feed-render` 的静态接线断言随新写法更新。

## 离线检查

命令均在任务工作树直接执行（不经 `pnpm` 自动安装；依赖目录指向主检出已安装版本）。

| 检查 | 实际结果 |
| --- | --- |
| `node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js`（工作树 `plugins/omnimux-inspiration`） | 1639 项，1639 通过，0 失败，0 skip（含本次新增的 host 端到端 `src/rival/rival-media.e2e.test.js`）；`DENY-NETWORK RECEIPT: 0 outbound attempts` |
| `node --test src/explore/*.test.js …`（同上） | 261 项，261 通过，0 失败，0 skip |
| `node scripts/verify-stage-contracts.mjs` | PASS：14 个 Stage 组件、8 个侧栏注册 |
| `node --test scripts/verify-anti-slop.test.mjs` | 3 项全部通过 |
| `node scripts/scan-ui-gates.mjs` | 退出 1；与干净 `main` 同为 8 条既有违规（UI01 3、UI02 4、UI10 1），`omnimux-inspiration` 0 条，本次未新增 |
| `node scripts/build-client.mjs` | 成功产出 `lib/client.js`（2,376,033 bytes，gitignored） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | `isUiChange: true`，`browser.required: true`，Dev 真机验收为人工职责 |

先红后绿说明：新增解析断言针对的字段在修复前的真实缓存中正是 `field_probe: null`（本机 `~/.omnimux-dev/.../posts/*.json`，5 账号 76 条），修复后同批断言通过；未再构造一次旧代码运行以免篡改工作树历史。

## 真实浏览器（隔离工作树）

组件级真实浏览器验收：用 esbuild 打包**真实** `RivalMasonry → RivalPostCard` 链（与账号监控面板同一组件链，仅把 `dsh-ui-kit` 换成测试装置 shim），在 `localhost` 动态端口 52453 由 ego-browser 真实 Chromium 渲染，数据为 5 张卡（有封面 / 无封面 / 未知播放量 / 封面 404 / X 纯文本），断言后截图并关闭任务空间。

| 观察点 | 实际结果 |
| --- | --- |
| 有封面卡 | `<img src="/cover.svg">`，`naturalWidth×naturalHeight = 360×640`，卡宽高 276×531，`--rival-media-ratio = 0.5625`；截图中封面蓝色区域实际绘制 |
| 无封面卡 | 媒体节点为 `DIV.omnimux-rival-media-empty`，`<img>` 不存在，占位文本「无封面」，平台标记存在，几何仍为 276×531 |
| 未知播放量卡 | 悬停层「播放 -- · 点赞 0 · 评论 0 · 分享 0」，无 `-1`；wire 行 `stats.views` 已归一为 `null`（`-1` 只留给排序） |
| 封面 404 卡 | `<img>` 触发 error 后自动移除并降级为同一占位（`DIV.omnimux-rival-media-empty`，文案「无封面」） |
| X 纯文本卡 | `data-card-type="text"`，无媒体节点 |
| 瀑布流 | 4 列，5 张卡均有可测几何 |

证据：[截图](./browser-card-3428.png) 与 [结构化事实](./browser-facts.json)，ego 任务空间 107 已 `finish`（`closedSpace: true`，closed `p1`）；完整事实 JSON 与运行装置在 `.workbuddy/evidence/live-qa/3428-account-monitor-media/`（本机、被忽略）。

限制：这是组件级浏览器证据，不证明完整应用装配、宿主调度或真实云端采集；真实 5 账号重采由任务授权在合并并物化 Dev 后执行，其结果不在此文件预写。

## 独立评审与整改

PR 合入前由独立评审者复核 diff、证据与授权，结论为 CHANGES REQUESTED（无 P0/P1）。已在本提交修复：

- 封面 URL 404/过期：`RivalPostCard` 增加按地址记录的加载失败状态，失败后复用占位，不再保留 broken `<img>`（浏览器证据新增 404 卡）。
- 未知播放量：`toFeedRow` 的 wire `stats.views` 改为 `null`（`-1` 只作排序哨兵），卡片与详情弹窗统一显示 `--`。
- 毫秒换算按平台门控：仅 TikTok 把 `video.duration` 从毫秒换算为秒，其他平台保持秒。
- 无 bitrate 的 X variants 按 URL 分辨率兜底；扁平 `images[]` 已派生的封面不再被嵌套 `media[]` 覆盖。
- 测试补齐：跨平台 duration 负例、X 图片帖、bitrate-free variants、封面加载失败、`播放 --` 精确断言；spec 验证命令修正。

## 残留风险

- 云端封面多为带过期签名的 CDN 地址；刷新只更新地址不落盘。封面失效时客户端按本次兜底显示占位，需刷新/重采拿到新地址后恢复。
- 嵌套形状按平台标准结构与同插件导入管线既有解析口径实现；`image_post_info`、X `media.video[]`/`extended_entities` 尚无真实样本逐字段确认，真实 5 账号重采待合并物化后执行，本文件不预写其结论。
- 旧缓存不保存原始 payload，修复后必须重新采集才能回填封面与统计（额度：2 次/账号/轮）。
- X 的点赞/评论/转发若位于更深的 engagement 容器，本次未扩展；空描述回退 URL 的标题行为未改。
