# #3164 账号监控：监控池状态条移除账号统计行

## 结论

监控池状态条不再渲染第一行账号统计（`监控池 N 个账号 · 正常 x · 冷却 x · 待重导入 x ·
已停止 x`）。状态条只剩一行：左侧今日剩余刷新额度，右侧数据新鲜度。账号健康态（四态标记、
原因行、行内「重试」）与刷新置灰优先级不受影响。

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `plugins/omnimux-inspiration/src/client/RivalPoolStatusBar.jsx` | 删除统计行与其取值，`tally` 入参移除；头部注释同步 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 移除 `tally` 传参、`rivalTally` 取值与 `poolTally` 导入；注释同步 |
| `plugins/omnimux-inspiration/src/client/locales.js` | 删除 `rivalAccounts.pool.summary`（zh/en） |
| `plugins/omnimux-inspiration/src/client/rival-styles.js` | 删除 `.omnimux-rival-pool-summary` 样式规则 |
| `plugins/omnimux-inspiration/src/client/rival-health.js`、`use-rival-feed.js` | 提及 `pool.summary` 的注释更正 |
| `plugins/omnimux-inspiration/src/client/rival-pool-health-render.test.js` | 统计行断言改为「只剩一行 + 统计行不存在」；重试恢复用例改判行健康态 |

`poolTally` 保留：仍是池级状态推导的纯函数，单测与端到端用例继续以其为契约（删除它会
迫使改动端到端测试文件，而端到端改动需先有真机证据，与本次 UI 收敛无关）。

## 验收证据

本地检查（任务工作树内）：

- 聚焦渲染测试：10 tests / 10 pass / 0 fail（`REAL_EXIT=0`）
- 插件全量单测：1097 tests / 1095 pass / 0 fail（`REAL_EXIT=0`，无 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`）
- 插件端到端：261 tests / 261 pass / 0 fail
- `pnpm verify:stages`：PASS（14 个 Stage 组件、8 个侧栏注册点）
- `node --test scripts/verify-anti-slop.test.mjs`：3 / 3 pass
- `git diff --check`：干净

真实浏览器（ego-browser，真实 Chromium，`harness/index.html`，静态服务于临时端口）：

- `rowCount = 1`、`summaryPresent = false`、
  `barText = "今日剩余刷新额度 46/50数据更新于 3 分钟前"`
- 打开账号筛选后四态齐备：`normal / cooling / reimport / stopped`，行内「重试」1 个
- 截图：`pool-bar-after.png`（状态条）、`pool-bar-with-health.png`（状态条 + 四态弹层）
- 原始判据：`harness-results.json`

## 复现方式

```bash
node docs/evidence/account-monitor-pool-bar-trim/harness/build-harness.mjs
python3 -m http.server 0 --bind 127.0.0.1 \
  --directory docs/evidence/account-monitor-pool-bar-trim/harness
# 浏览器打开输出的 127.0.0.1:<port>/index.html
```

## 未覆盖 / 已知边界

- 验收页是**真实 `InspirationStage` 的独立挂载**（仓库 react + 仓库 `ui-kit-shim` + 插件自身
  注入的样式表），不含应用外壳，因此截图里信息流空态卡片与浮层有重叠——那是挂载方式的
  产物，不是状态条本身的布局问题。
- 开发版真机验收（端口 45120）归人工，本报告不主张已完成该验收。
