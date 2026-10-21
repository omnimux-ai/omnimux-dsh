# Issue #3528 证据：首页自定义排序写失败的客户端留痕 + 真实浏览器验收

- Issue：#3528（fix / omnimux-market / 初始 R2；新增 `scripts/` 证据脚本按合同上调 **R1**）
- 前置：#3509 / PR #3531（服务端重置语义、同源校验、错误体去路径）
- Worktree：`.worktrees/market-home-order-feedback-3528`（分支 `agent/market-home-order-feedback-3528-issue-3528`）
- base：`origin/main` = `2ad989bdd`（提交时以 PR head 为准；报告记录 `headCommitAtRun`）
- Spec：`specs/home-order-client-feedback-3528.spec.md`

## 改动

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/client/plaza/plazaUtils.js` | 新增 `reportHomeOrderWriteFailure(action, error)`：`console.warn('[omnimux-market] home custom order write failed (<action>): <detail>')`；内部 try/catch 保证诊断留痕不会反向打断调用链；`handleMoveToTop` / `handleResetOrder` 的 `.catch(() => {})` 改为显式报告，不抛错、保持乐观状态 |
| `plugins/omnimux-market/src/client/plazaUtils.test.js` | 5 个客户端单测：两类动作 reject → warn 一次、无 unhandled rejection、乐观状态保持；非 Error 字符串化；无 apiFn 不发请求；console.warn 被替换为抛错时仍不产生 unhandled rejection |
| `plugins/omnimux-market/tests/e2e/home-order-feedback.spec.js` | 2 个真实 local-api 联调：只读目录 500 → warn 含服务端错误且无 unhandled；可写目录成功 → 等客户端请求 settled 后断言无 warn、GET `source:'custom'` |
| `scripts/evidence-home-order-feedback-3528.mjs` | 真实浏览器证据脚本：worktree 源码 esbuild 打包 → ego TaskSpace 加载 → 点击两次失败动作 → DOM/console 断言 + PNG/JSON；已在 `scripts/governance-manifest.json` 的 `manual` 库存登记 |
| `docs/evidence/home-order-client-feedback-3528/` | 本 README + `report.json` + `browser-console.png` |

## 真实浏览器验收（ego TaskSpace，非首页打卡）

脚本：`node scripts/evidence-home-order-feedback-3528.mjs`

- 页面加载的是**由本 worktree `src/client/plaza/plazaUtils.js` esbuild 0.25.12 打包的 bundle**（报告记录源文件 sha256 `fff538a7…`、bundle sha256 `b35eabd1…` / 121733B、`headCommitAtRun`、`loadedUrl`、`cleanup`），不是手写副本；`source.sha256` 可用 `shasum -a 256` 复算。
- 在真实 Chrome（ego lite，TaskSpace 128，Chrome 154，实测 viewport 960×640 @dpr2）点击「重置排序/置顶排序」两个按钮，注入 reject 的 `apiFn`（模拟服务端 500）。
- 结果 **PASS**：10 条断言全过 —— warnings=2（reset / move-to-top，含 `home order state not writable (EACCES)`）、unhandled=0、乐观状态历史 `[null, ["b","a"]]`、DOM 日志/状态文本渲染正确、截图 100898 bytes（1920×1280 @2x，sha256 `bd32555e…`）。
- TaskSpace 由 driver 在 finally 中 `finish({ keep: [] })` 清理（报告的 `cleanup` 字段与 driver 实现对应；ego 空间列表无本任务空间）；不读 Dev profile、不写共享状态。
- 报告：`report.json`（含 headCommitAtRun / loadedUrl / esbuild 版本 / source+bundle+PNG 哈希 / 实测 viewport / cleanup / 10 条断言）；截图：`browser-console.png`（可见两条黄色 warn 与 `warnings: 2 · unhandled: 0`）。
- 复算说明：bundle sha256 依赖锁文件内 esbuild 版本（当前 0.25.12）；报告显式记录 `esbuild.version` 与 `absWorkingDir`，换安装环境需按同版本重算。

## 测试与检查（实际执行）

| 命令 | 结果 |
|---|---|
| `pnpm --filter omnimux-market test` | exit 0；**1000 pass / 0 fail**（含 build、单测、e2e、全部 spec） |
| `node --test src/client/plazaUtils.test.js` | 5 pass / 0 fail |
| `node --test tests/e2e/home-order-feedback.spec.js` | 2 pass / 0 fail |
| `node scripts/evidence-home-order-feedback-3528.mjs` | PASS（10/10 断言，真实 Chrome TaskSpace） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | `isUiChange=true`，`browser.required=true`（已由上面真实浏览器证据覆盖） |
| `pnpm verify:stages` / `node --test scripts/verify-anti-slop.test.mjs` | 通过 |
| `node scripts/verify-silent-catch.mjs --json` | 改动源码无新增 SC1/SC2（delta hits=[]） |
| `pnpm check:boundaries` / governance registry tests | 通过 |
| `git diff --check` | exit 0 |
| `pnpm test:ui` | exit 1，与干净 `origin/main` 逐字节一致（8 条既有 UI01/UI02/UI10，跨 4 文件），非本 PR 引入，未写成 PASS |

## 行为说明

- 写失败时：本地排序仍按乐观更新生效（与改动前一致），控制台出现 `[omnimux-market]` 前缀 warn，含动作（`reset`/`move-to-top`）与服务端错误消息；不含 token、不含安装路径（服务端 #3509 已去路径）。
- 诊断留痕自身失败（console.warn 被宿主/扩展替换为抛错，或错误值 toString 异常）不会反向造成 unhandled rejection（单测覆盖）。
- 不新增用户可见 toast/文案：本 Issue 验收口径是「至少留痕」；用户可见反馈另立 UI 任务并走文案规范。
- 失败留痕只在真实请求被拒绝时出现；成功路径等请求 settled 后断言无 warn（e2e）。

## 残留

- 用户可见失败反馈（toast/文案）未做，按 non-goal 留待后续 UI 任务。
- 证据脚本只覆盖 `shell.overlay` 中的排序动作；完整 market overlay 端到端旅程仍依赖 Dev 45120 人工验收（Agent 不 gate、不声称）。
