# 首页自定义排序写失败客户端留痕 + 真实浏览器验收路径（Issue #3528）

- 关联 Issue：#3528（type: fix / plugin: omnimux-market / track: D / 初始 risk: R2；本任务新增 `scripts/` 证据脚本，按 [plugin-git-pr](../docs/contracts/plugin-git-pr.md) 上调为 **R1**）
- 前置：#3509 / PR #3531（服务端重置语义、同源校验、错误体去路径）
- 合同：[plugin-qa](../docs/contracts/plugin-qa.md)、[anti-agent-fake-completion-guard §1.1](../docs/contracts/anti-agent-fake-completion-guard.md)

## 目标

1. **客户端不再静默吞写失败**：`plugins/omnimux-market/src/client/plaza/plazaUtils.js` 的 `handleMoveToTop` / `handleResetOrder` 结尾 `runApi('homeCustomOrder', …).catch(() => {})` 改为留痕（`console.warn`，含动作与服务端错误消息，不含 token），不产生未处理 rejection，不影响乐观 UI 与后续交互。
2. **补失败路径测试**：
   - 客户端单测：reject 时 warn 一次、state 仍按乐观语义更新、无 unhandled rejection、非 Error 值可字符串化；
   - e2e：客户端调用真实 `local-api`（只读目录 → 500）时 warn 含服务端错误；可写目录成功时无 warn。
3. **真实浏览器验收路径**：新增 task 级证据脚本，用仓库既有 ego Step driver 在真实 Chrome TaskSpace 中加载「由 worktree 源码 esbuild 打包的 plazaUtils」页面，点击触发失败请求，断言 warn 留痕/无 unhandled rejection 并截图 + 结构化报告；不改 Stage 清单、不伪造首页打卡。

## 范围

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/client/plaza/plazaUtils.js` | 新增 `reportHomeOrderWriteFailure(action, error)`（warn 留痕）；两处 `.catch` 改为显式报告 |
| `plugins/omnimux-market/src/client/plazaUtils.test.js` | 新增客户端失败路径单测 |
| `plugins/omnimux-market/tests/e2e/home-order-feedback.spec.js` | 新增客户端 ↔ 真实 local-api 的失败/成功联调 |
| `scripts/evidence-home-order-feedback-3528.mjs` | 新增真实浏览器证据脚本（ego TaskSpace + worktree 源码 bundle + PNG/JSON 报告） |
| `docs/evidence/home-order-client-feedback-3528/` | README + 浏览器截图 + 结构化报告 |
| `specs/home-order-client-feedback-3528.spec.md` | 本规格 |

## 非目标

- 不重做首页推荐排序交互、不改 catalog 数据结构、不改服务端语义（#3509 已交付）。
- 不新增用户可见 toast/文案（本任务口径是「至少留痕」；若要用户可见反馈另立 UI 任务并走文案规范）。
- 不改 `worktree-web-qa.mjs` 的 Stage 清单、不改 Dev 45120 人工验收边界。

## 新用户基线

- 写失败时用户本地排序仍按乐观更新生效；控制台有 `[omnimux-market]` 前缀的可诊断 warn，含动作与错误消息，不含 token/绝对路径（服务端 #3509 已去路径）。
- 无开发机私有依赖：真实浏览器验收使用 ego lite TaskSpace（唯一命名、结束 `keep: []`），页面与 bundle 全部来自本 worktree，不读 Dev profile、不写共享状态。

## 假设

1. 客户端「静默」根因是两处 `.catch(() => {})` 把 `api.js` 已抛出的 5xx 错误吃掉；改为 `.catch(reportHomeOrderWriteFailure)` 即可留痕且不改变乐观状态/交互。
2. 失败路径可在真实浏览器中稳定复现：只要页面加载的是由 worktree `plazaUtils.js` 打包的 bundle，并用 reject 的 `apiFn` 触发两次动作，`console.warn` 钩子与 `unhandledrejection` 监听即可量化断言。
3. ego Step driver（`scripts/lib/ego-browser-steps.mjs`）能在该任务内启动唯一 TaskSpace、加载 `file://` 本地 harness、点击并截图；截图字节数与 DOM 断言可证明页面真实渲染，而非打卡。

## 证伪方式

1. 用 reject 的 `apiFn` 调 `handleResetOrder`/`handleMoveToTop`：若 `console.warn` 未被调用、或出现 `unhandledrejection`、或 state 不再乐观更新，假设 1 被证伪。命令：`pnpm --filter omnimux-market test`（含新增单测与 e2e）。
2. 真实浏览器 harness：若捕获的 warn 数 ≠ 2、`unhandledrejection` 非空、页面状态文本不含预期计数、或截图字节 < 阈值，假设 2/3 被证伪。命令：`node scripts/evidence-home-order-feedback-3528.mjs`。
3. 若 harness 只加载了手写副本而非 worktree 源码，报告中的 `source.sha256` 与 `shasum -a 256` 源文件结果不一致即证伪；脚本会把源文件哈希、bundle 哈希、esbuild 版本与 `headCommitAtRun`/`loadedUrl`/`cleanup` 写入报告。

## 验收

- [x] `reportHomeOrderWriteFailure` 对 Error/字符串都能输出含动作与原因的 warn，且不抛错（单测 5/5，含 console.warn 抛错场景）。
- [x] `handleMoveToTop` / `handleResetOrder` reject 时 warn 一次、无 unhandled rejection、state 乐观更新保持。
- [x] e2e：真实 local-api 只读目录 500 → warn 含 `home order state not writable`；可写目录成功 → 等客户端请求 settled 后断言无 warn 且 GET 返回自定义排序。
- [x] 真实浏览器证据：ego TaskSpace 唯一命名并 `keep: []` 清理；PNG 可解码（1920×1280, 100898B）、报告记录 warnings=2、unhandled=0、源文件/bundle 哈希；证据入库。
- [x] `pnpm --filter omnimux-market test` 全绿（1000 pass）；`pnpm verify:stages` + anti-slop + `pnpm check:boundaries` + governance registry 测试通过；`git diff --check`；改动源码无新增 SC1/SC2。

## 风险复核

- 实际 diff 触及 `plugins/*/src/client/`（需真实浏览器验收）与新增 `scripts/` 证据脚本，按 [plugin-git-pr](../docs/contracts/plugin-git-pr.md)「scripts 至少 R1」上调为 **R1**；交互式任务通道下经独立评审 + 适用证据后合入。
- 证据脚本只读 worktree 源码、spawn 既有 ego CLI、写本任务证据目录与 `.workbuddy/` 临时 harness；不触碰 Dev/Prod/凭据。

## 文档影响

不新增合同条款。客户端留痕行为（warn 前缀/内容/不抛错）写入本规格 + 测试 + 证据；证据脚本复用既有 ego Step driver 模式（`scripts/capture-media-preview-evidence.mjs` 先例）。
