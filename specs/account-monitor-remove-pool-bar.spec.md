# 规格：账号监控移除「额度/更新于」状态条整行

## 1. 目标（Objective）

业务方在开发版上确认：账号监控页顶部那一行「今日剩余刷新额度 {left}/{total} …
数据更新于 {n} 分钟前」状态条整条移除，不再展示。

- 刷新主按钮（筛选行的「刷新」主按钮、额度角标、置灰原因弹层）保留不变；
- 额度口径 `poolQuota` 仍服务刷新按钮的置灰判据与角标，不改；
- 账号健康态、筛选弹层、行内重试不受影响。

用户故事：作为运营者，我在账号监控顶部不想看到一行额度/更新时间的常驻状态条，
页面更干净；我需要"还能刷新几次"时，刷新按钮上的角标（N/M）已给出同一信息。

成功标准（可测）：

1. 账号监控有账号时，内容区不再出现 `[data-rival-pool="true"]` 容器，
   页面文本不含 `今日剩余刷新额度` 与 `数据更新于`。
2. 刷新按钮及其置灰弹层（额度 > 已停止 > 冷却优先级）、额度角标 `N/M` 行为不变。
3. 无残留：`RivalPoolStatusBar` 导出与其在 `InspirationSection` 的引用、
   `rivalAccounts.pool.quota` / `rivalAccounts.pool.freshness` 两条字典（zh/en）、
   `.omnimux-rival-pool*` 样式规则全部移除；`poolFreshnessMinutes` 若无其他调用方一并移除。
4. 真实浏览器证据：任务工作树内以真实组件 + 真实样式表出图，人眼确认状态条消失、
   账号列表与筛选行无错位或留白黑洞。

## 2. 命令（Commands）

全部在任务工作树 `.worktrees/account-monitor-remove-pool-bar` 内执行：

- 本插件单测：`pnpm --filter omnimux-inspiration test`
- 单文件聚焦：`node --import ./scripts/deny-network.mjs --test plugins/omnimux-inspiration/src/client/rival-pool-health-render.test.js`
- 阶段契约：`pnpm verify:stages`
- 防遮掩门禁：`node --test scripts/verify-anti-slop.test.mjs`
- 空白字符检查：`git diff --check`
- 真实浏览器证据：工作树内打开页面截图（端口用 `port: 0`，自清理）。

## 3. 项目结构（Project Structure）

- `plugins/omnimux-inspiration/src/client/RivalPoolStatusBar.jsx`：删 `RivalPoolStatusBar`，留 `RivalRefreshButton` 与 `refreshGate`、`hoursToMidnight`。
- `plugins/omnimux-inspiration/src/client/InspirationSection.jsx`：删状态条引用与 `rivalFreshness` 取值（刷新按钮仍用 `quota`/`gate`/`cooldownLeft`；`fresh` 传参若无新鲜度来源则删该入参）。
- `plugins/omnimux-inspiration/src/client/locales.js`：删 `pool.quota`/`pool.freshness` 两条（zh/en）。
- `plugins/omnimux-inspiration/src/client/rival-styles.js`：删 `.omnimux-rival-pool*` 样式块。
- `plugins/omnimux-inspiration/src/client/rival-health.js`：`poolFreshnessMinutes` 若无其他调用方则删（含其单测）。
- `plugins/omnimux-inspiration/src/client/rival-pool-health-render.test.js`：R3 断言改为"状态条不存在"，R4 等待条件改为刷新按钮出现。
- 证据：`docs/evidence/account-monitor-remove-pool-bar/`

## 4. 代码风格（Code Style）

函数组件 + 具名导出；文案逐字取自 `locales.js`；注释只写"当前为什么这样做"，
不留"曾经有一行状态条"的变更叙述。

## 5. 测试策略（Testing Strategy）

- 渲染契约：R3 块改为断言状态条容器不存在、页面无额度/更新于文案（需求变更驱动）。
- R4 刷新置灰用例不变，仅把 settle 等待目标从额度文本改为刷新按钮。
- 纯函数：`poolQuota` / `manualCooldownMinutesLeft` 契约不变；`poolFreshnessMinutes`
  若删则同步删其单测块。
- 人眼复检：真实浏览器截图（成功标准 4）。

## 6. 边界（Boundaries）

- **总是**：改后跑本插件单测 + `pnpm verify:stages` + 防遮掩门禁 + `git diff --check`。
- **先问**：改刷新额度口径、刷新置灰优先级、账号健康态判定。
- **绝不**：界面层遮掩数据不一致；改官方 DSH 源码；为让测试变绿放宽无关断言。

## 关键操作旅程

打开灵感社区 → 账号监控 → 顶部直接进入账号筛选行与内容区，没有额度/更新时间状态行；
点「刷新」按钮，额度角标与置灰原因弹层照旧。

## 假设（Assumptions）

1. 用户确认移除的是红圈标注的整行状态条（额度 + 更新于），非整个账号监控功能。
2. 刷新按钮上的 `N/M` 角标已能满足"还剩几次"的信息需求。
