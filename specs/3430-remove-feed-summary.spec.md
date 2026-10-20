---
status: active
issue: 3430
base: 0abb16c33345214474655ba850b38c2e155ae426
---

# 3430 移除账号监控作品流上方的浏览说明行

## 目标与用户旅程

Issue #3430。用户在「灵感社区 → 账号监控」看到作品流上方有一整行状态说明：左侧「正在浏览：已监控账号的发布作品（仅聚合已加监控的博主作品流）」，右侧「显示 N 个作品」。该行只解释用途、不提供操作，认为它占掉一条本可用于作品的垂直空间，要求整行移除。

旅程：

1. 用户打开账号监控，筛选行（搜索 / 账号 / 刷新额度 / 平台 / 排序）保持不变。
2. 筛选行下直接进入作品瀑布流：不再出现说明行、计数行或它的占位。
3. 作品卡、账号筛选弹层、空态、分页追加与卡片动作全部沿用现有行为。

## 根因与范围

- `src/client/RivalAccountsPanel.jsx` 在 `feed.cards.length > 0` 时渲染 `.omnimux-rival-summary`（`data-rival-summary="true"`）。
- 文案 `rivalFeed.summary` / `rivalFeed.count`（中英各两条）只被这一行消费；`.omnimux-rival-summary` / `.omnimux-rival-summary-count` 只服务这一行。
- 渲染门禁 `account-monitor-feed-render.test.js` 当前断言该行存在并显示计数（含空态「不得出现」的反向断言）。

改动：

- 删除 `RivalAccountsPanel.jsx` 中的摘要行 JSX。
- 删除 `rival-styles.js` 中 `.omnimux-rival-summary*` 规则。
- 删除 `locales.js` 中 `rivalFeed.summary` / `rivalFeed.count`（中英）。
- 渲染门禁改为：有作品时 `[data-rival-summary]` 与旧文案都不存在；保留卡片/筛选/空态/分页断言。
- 不改：作品流数据、`feed.total` 的 Host 返回、排序、筛选、卡片形态、其他 Tab。

## 验收用例

| # | 用例 | 期望 |
|---|---|---|
| A1 | 有作品时渲染账号监控 | 不存在 `[data-rival-summary]` / `.omnimux-rival-summary`，页面文本不含旧说明与「显示 N 个作品」 |
| A2 | 有作品时 | 作品卡数量与内容不变，筛选行控件仍存在 |
| A3 | 空态 | 仍渲染既有空态，且不含摘要行（沿用原反向断言） |
| A4 | 分页/刷新/导入反馈 | 既有渲染门禁用例保持通过 |

## 验证

- `cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/client/account-monitor-feed-render.test.js src/client/*.e2e.test.js`（先红后绿）
- 插件核心套件与 `src/*.test.js`，`node scripts/verify-stage-contracts.mjs`，`node --test scripts/verify-anti-slop.test.mjs`
- 隔离 worktree 真实浏览器（ego-browser，动态端口）：用真实 `RivalAccountsPanel` + 合成 feed 渲染，断言摘要行不存在、卡片与筛选存在，留存截图与结构化事实
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`

## 文档影响

行文案与布局变更：新增本 spec；旧设计稿 `docs/specs/2026-09-13-account-monitor-feed-system-design.md` 中的副标题行属于历史记录，不回写历史，由本 spec 声明其被移除。不改合同、README、模型或接口文档。

## 新用户基线

新用户安装登录后打开账号监控，看到的仍是筛选行 + 作品瀑布流；该行删除不引入对开发机状态、凭据或特定云端渠道的依赖。空数据时仍显示既有空态，缺凭据/额度时保持原有明确错误。
