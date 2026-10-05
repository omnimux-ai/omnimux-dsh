# #3111 监控池状态条与账号健康态（含「已停止」）— 任务规格

> 真源：`docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`（§2.2 R3、§3 字典、§8.1、回填表 B19）与 GitHub Issue #3111 票面验收清单。本文件只做实施侧收敛，不改写任何逐字文案。

## 目标

账号监控 Tab 内新增：

1. **R3 监控池状态条**：第一行 `监控池 {total} 个账号 · 正常 {ok} · 冷却 {cooling} · 待重导入 {reimport} · 已停止 {stopped}`（四段计数互斥、闭合到 total、零值分段不省略）；第二行左 `今日剩余刷新额度 {left}/{total}`、右 `数据更新于 {n} 分钟前`（无数据时不渲染该段）。
2. **账号行四态健康标记**：`正常` / `冷却中 · {n} 分钟后恢复` / `需要重新导入`（+常驻原因行 `该 YouTube 频道尚未验证身份，请改用 channel/UC… 链接重新导入`）/ `已停止`（+常驻原因行 `连续 {n} 次刷新失败`，`{n}` 未上报时整行不渲染）+ 行内 `重试`（仅 `已停止` 行）。
3. **刷新按钮三条件置灰**：冷却中 / 额度耗尽 / 筛选集内存在 `已停止` 账号；置灰但可点，弹 D4 原因（优先级 额度 > 停止 > 冷却，只显示一条）。
4. **行内 `重试`**：触发该账号单账号刷新，健康态立即回 `正常`、原因行消失、`pool.summary` 计数同步变化；额度为 0 时按钮置灰可点、弹 `refresh.quota`。

## 判据（一事一源）

四态判据落在 Client 唯一纯函数 `rival-health.js`：`accountHealth` / `coolingMinutesLeft` / `poolTally` / `stoppedReasonText`。Host 只报事实（E1 的 `refresh_state` / `error_code` / `consecutive_failures` / `next_auto_refresh_at`），不新增派生字段。

- `error` + `error_code === 'identity-unverified'` → `reimport`
- `error` + 其余 error_code → `stopped`
- `backoff` + 可解析 `next_auto_refresh_at` → `cooling`（n = ceil(剩余/60000)，最小 1）
- 其余（含 `paused`）→ `normal`（用户已拍板：`paused` 归入正常，保证计数闭合）

## 用户关键操作旅程

1. 打开账号监控 Tab → 状态条显示五段计数与额度/新鲜度行。
2. 打开账号筛选 Popover → 每行按其健康态显示标记，终态行常驻原因行。
3. 点 `已停止` 行的 `重试` → 该账号回 `正常`、计数同步变化。
4. 存在 `已停止` 账号时点击置灰的 `刷新` → 弹出 `该账号自动刷新已停止，请在账号筛选中处理。`

## 验收（票面逐条）

见 Issue #3111 Acceptance criteria，共 10 条，逐条以单测 + e2e + 真机截图举证。

## 边界

- 不新增云调用（每账号每周期仍恰好 2 次）。
- `paused` 不做第五态；`refresh.confirm.skip` 不改（T3 未实现）。
- 共享文件（`InspirationSection.jsx` / `rival-filter.js` / `locales.js`）只做追加式最小改动，不重排不重构（#3112 并行）。
- 状态条写 `待重导入`、账号行写 `需要重新导入`，两处逐字锁定不统一。
