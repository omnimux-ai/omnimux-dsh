# #3111 监控池状态条与账号健康态 · 真实浏览器功能路径验收（变基后复跑）

- 运行时间戳：`20261005-165913`（UTC；本机 2026-10-06 00:59 CST）
- 被测分支：`feat/account-monitor-v2-pool-health-issue-3111`，HEAD `f68a45f53`（已变基到 `origin/main` `5f6e25643`）
- 驱动：ego-browser（真实 Chromium，非无头 jsdom），页面在隔离工作树内以临时端口自建夹具承载
- 结果：**6/6 步骤完成，0 错误**（`errors: []`）

## 夹具构成（供复核）

| 项 | 说明 |
| --- | --- |
| 被测代码 | 真实 `InspirationStage.jsx` + 真实 `dsh-ui-kit`（`packages/dsh-ui-kit`）+ 官方 primitives，未替换任何业务模块 |
| 数据 | `fetch` 被内存假服务端替换：4 个账号覆盖 `idle` / `backoff` / `error(identity-unverified)` / `error(cloud-error)` 四态，`status` 给 `budget_used.global_calls=4`、上限 50 |
| 主题 token | 从官方主题包 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 提取真实 `--dsw-static-*` / `--dsw-alias-*` 定义（亮/暗两套，选择器 `body` 与 `body[data-ds-dark-theme]`），非自造色值 |
| 宿主外壳 | 仅提供 `#host` 容器与页面底色；`dsh-ui-kit` 样式由打包产物自带 |

## 步骤与实测值

| 步骤 | 截图 | 实测 |
| --- | --- | --- |
| 打开「账号监控」Tab | `r2-20261005-165913-01-pool-bar-dark.png` | `监控池 4 个账号 · 正常 1 · 冷却 1 · 待重导入 1 · 已停止 1`；`今日剩余刷新额度 46/50`；`数据更新于 3 分钟前`；刷新按钮 `is-blocked=true` |
| 打开账号筛选弹层 | `r2-20261005-165913-02-account-pop-health-dark.png` | 四态齐全：`ra_ok=normal`、`ra_cool=cooling`、`ra_reimport=reimport+原因行`（无重试）、`ra_stopped=stopped+原因行+重试` |
| 点击置灰「刷新」 | `r2-20261005-165913-03-refresh-blocked-reason-dark.png` | 弹层逐字：`该账号自动刷新已停止，请在账号筛选中处理。`；未发出 `refresh-all` |
| 行内「重试」 | `r2-20261005-165913-04-after-retry-dark.png` | 计数同步为 `正常 2 · 冷却 1 · 待重导入 1 · 已停止 0`；`ra_stopped` 回 `normal`、原因行与重试消失；`POST /omnimux/inspiration/local/rival-accounts/ra_stopped/refresh`；按钮 `is-blocked=false` |
| 亮色主题复查 | `r2-20261005-165913-05-pool-bar-light.png`、`-06-account-pop-health-light.png` | 同一条功能路径在亮色下逐字一致（`监控池 4 个账号 · 正常 1 · 冷却 1 · 待重导入 1 · 已停止 1`） |

## 原始数据

- `r2-20261005-165913-browser-run.json` —— 每步的 DOM 事实快照（状态条文案、四态 `data-health`、原因行、重试有无、实际请求序列）
- `r2-20261005-165913-browser-run.log` —— 驱动进程完整输出

## 证据效力与边界

- 本次为**真实浏览器**中真实组件的真实交互（点击、等待、截图），不是单测或 HTTP 探活；截图由 `Page.captureScreenshot` 产出，1920×929，暗色平均亮度 22.2、亮色 180.7，非空白图。
- 夹具提供宿主外壳与假服务端，因此**证明的是功能路径、文案与状态机**；真实宿主内的首启装配、Dev 应用（45120）观感仍归人工验收。
- 旧证据 `01-…` 至 `06-…` 为变基前基线（2026-10-05 19:41-19:42），保留用于对照，未被本次覆盖。
