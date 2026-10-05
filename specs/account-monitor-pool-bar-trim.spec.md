# 规格：账号监控监控池状态条移除账号统计行（Issue #3164）

## 1. 目标（Objective）

业务方在开发版上确认：监控池状态条的**第一行账号统计**（`监控池 {total} 个账号 ·
正常 {ok} · 冷却 {cooling} · 待重导入 {reimport} · 已停止 {stopped}`）不再展示。
状态条只保留第二行——今日剩余刷新额度（左侧）与数据新鲜度（右侧）。

账号健康态本身不受影响：四种状态标记、原因行、行内「重试」仍保留在账号筛选弹层与账号行；
刷新置灰判据（额度 > 已停止 > 冷却）不依赖该计数行。

用户故事：作为运营者，我在账号监控顶部只想看到"今天还能刷新几次"，不想被一行与筛选弹层
重复的账号计数占据视线。

成功标准（可测）：

1. `[data-rival-pool="true"]` 内 `.omnimux-rival-pool-row` 恰好 **1** 个，且该行包含
   `.omnimux-rival-pool-quota`，有刷新事实时包含 `.omnimux-rival-pool-freshness`。
2. 容器内不存在 `.omnimux-rival-pool-summary`，渲染文本不含 `监控池` 与 `待重导入`。
3. 额度逐字 `今日剩余刷新额度 {left}/{total}`；`last_refresh_at` 全为空时不渲染新鲜度；
   新鲜度 ≤1 分钟时不渲染。
4. 账号行四态标记、原因行、行内「重试」行为与 #3111 一致；重试后该行回 `正常`，
   原因行与重试按钮消失。
5. 无残留：`rivalAccounts.pool.summary`（zh/en）、`.omnimux-rival-pool-summary` 样式、
   `RivalPoolStatusBar` 的 `tally` 入参及其在 `InspirationSection` 的配套取值全部移除；
   提及 `pool.summary` 的注释同步更正。
6. 真实浏览器证据：任务工作树内以真实组件 + 真实 `dsh-ui-kit` + 真实样式表出图，
   人眼确认状态条只剩一行且无留白黑洞或错位。

## 2. 命令（Commands）

全部在任务工作树 `.worktrees/account-monitor-pool-bar-trim` 内执行：

- 安装依赖：`pnpm install --prefer-offline`
- 本插件单测：`pnpm --filter omnimux-inspiration test`（等价 `node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js …`）
- 单文件聚焦：`node --import ./scripts/deny-network.mjs --test plugins/omnimux-inspiration/src/client/rival-pool-health-render.test.js`
- 阶段契约：`pnpm verify:stages`
- 防遮掩门禁：`node --test scripts/verify-anti-slop.test.mjs`
- 空白字符检查：`git diff --check`
- 真实浏览器证据：工作树内以 `ego-browser` 打开自建演示页并截图（端口用 `port: 0`，自清理）。

## 3. 项目结构（Project Structure）

- 业务源码：`plugins/omnimux-inspiration/src/client/`
  - `RivalPoolStatusBar.jsx`：状态条组件（本次移除统计行）
  - `InspirationSection.jsx`：外壳，负责取数与传参（本次移除 `tally` 传参与其取值）
  - `locales.js`：中英文字典（本次删除统计行两条文案）
  - `rival-styles.js`：组件样式表（本次删除统计行样式规则）
  - `rival-health.js`、`use-rival-feed.js`：纯函数与数据钩子（仅注释更正）
- 测试：`plugins/omnimux-inspiration/src/client/*.test.js`（渲染契约）
- 本任务规格：`specs/account-monitor-pool-bar-trim.spec.md`
- 证据：`docs/evidence/account-monitor-pool-bar-trim/`

## 4. 代码风格（Code Style）

函数组件 + 具名导出；样式类名以 `omnimux-rival-` 前缀；文案逐字取自 `locales.js`，
组件内不写死中文。示例（本次改动后的形态）：

```jsx
export function RivalPoolStatusBar({ t, quota, freshnessMinutes }) {
  return (
    <div className="omnimux-rival-pool" data-rival-pool="true">
      <div className="omnimux-rival-pool-row is-meta">
        {quota ? (
          <span className="omnimux-rival-pool-quota">
            {t('rivalAccounts.pool.quota')
              .replace('{left}', String(quota.left))
              .replace('{total}', String(quota.total))}
          </span>
        ) : null}
        {typeof freshnessMinutes === 'number' && freshnessMinutes > 1 ? (
          <span className="omnimux-rival-pool-freshness">
            {t('rivalAccounts.pool.freshness').replace('{n}', String(freshnessMinutes))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
```

注释只写"当前为什么这样做"，不留"曾经有两行"的变更叙述。

## 5. 测试策略（Testing Strategy）

- 渲染契约（jsdom + esbuild + 真实组件）：`rival-pool-health-render.test.js` 中原本断言
  统计行文本的用例，改为断言"状态条只剩一行且统计行不存在"——需求变更驱动，非放宽断言。
- 纯函数契约保持不变：`rival-health.test.js` 继续覆盖 `poolTally` / `accountHealth` /
  `poolQuota` / `poolFreshnessMinutes`；端到端用例继续以 `poolTally` 推导 Host 侧状态。
- 不做仅复述可逆小改动的多余测试。
- 人眼复检：真实浏览器截图（见成功标准 6）。

## 6. 边界（Boundaries）

- **总是**：改动前跑目标测试；改后跑本插件单测 + `pnpm verify:stages` + 防遮掩门禁 +
  `git diff --check`；文案改动走 `locales.js` 两份字典同步。
- **先问**：改账号健康态判定规则、刷新额度口径、刷新置灰优先级；新增依赖；改 CI 配置。
- **绝不**：在界面层遮掩数据不一致（`verify-anti-slop` 硬门禁）；改官方 DSH 源码；
  提交密钥；为让测试变绿而放宽或删除与被删功能无关的断言。

## 关键操作旅程

打开账号监控 → 顶部状态条只显示「今日剩余刷新额度 N/M」（右侧「数据更新于 N 分钟前」）
→ 打开账号筛选弹层，四种健康态与原因行、行内「重试」照旧可用。

## 假设（Assumptions）

1. 业务方要移除的是**第一行账号统计**，第二行额度与新鲜度保留（已由用户在选择中确认）。
2. 账号健康态在筛选弹层中的呈现即满足信息需求，顶部不再需要池级汇总。
3. `poolTally` 作为纯函数保留：单测与端到端测试继续以其为池级状态推导契约。

## 非目标

- 不改动账号筛选弹层与账号行的任何展示。
- 不改动刷新额度口径与刷新置灰优先级。
