---
title: "plugin-qa — OmniMux 插件验收证据合同"
id: "contract-plugin-qa"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-28"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# plugin-qa — OmniMux 插件验收证据合同

本合同定义不同变更面需要什么证据。风险与合入授权见 [plugin-git-pr](plugin-git-pr.md)，环境隔离见 [dev-pipeline](dev-pipeline.md)，执行步骤按需加载[仓库 workflow skill](../../.agents/skills/omnimux-repo-workflow/SKILL.md)。静态检查、单测、浏览器与 Electron 各证明不同事实，不得互相冒充。

## 适用矩阵

| 变更面 | 合并前 | 合并后 | 不要求 |
|---|---|---|---|
| 纯文档 / Issue 模板 | metadata、链接与适用文档检查 | 无 | L2、45120、App 物化、Electron |
| 纯逻辑 / 单测 | 相关测试与错误路径；运行依赖需要时加 L2 | 通常无；若影响已安装运行时则做 Dev 验证 | 无关浏览器截图 |
| Host / 插件运行行为 | 当前 worktree 的独立 L2 环境与适用 HTTP/RPC/集成证据 | 合入后从 `main` 物化 Dev，并验证目标行为 | 无 UI 时不要求 DOM |
| Client / Stage / 侧栏 | 独立 L2 + ego-browser + 共享 `verify:live` 探针 | Dev `~/.omnimux-dev` / 45120 + 同一共享探针 | 默认不要求 Electron |
| 壳层 / 平台门控 | Client 证据 + 真实 Electron renderer/CDP | Dev App 中复核 | 不能只用 45120 web 页面替代 Electron |
| 生产发布 | 另见发布授权与发布计划 | 授权目标上的发布/回滚证据 | 不属于普通开发验收 |

每条 Issue acceptance 只绑定适用层。`not applicable` 必须给出变更面理由；skip、环境错误或未执行检查不能写成 PASS。

## 环境身份

| 环境 | 身份要求 |
|---|---|
| 合并前 L2 | 端口 `44201–44299`，`~/.dsh-dev/tasks/<task>`，SOURCE 指向当前 worktree，link 在研插件不超过一个 |
| 合并后 Dev | `~/.omnimux-dev`，端口 `45120`，物化源必须是已合并 `main` |
| Prod | `~/.omnimux`；没有独立发布授权不得写入或用于普通交付 |
| 命名 baseline（PR-C 起，拟实现） | 显式消费时 `.l2-dev.env` 必须记录 `baselineId`（完整内容哈希）、contentDigest、Host 实际身份、Node/pnpm/OS/arch；私有 store 与任务绑定。**published** 候选允许隔离显式消费用以验收；**只有 verified** 可 `current` 激活/回滚。receipt 为绑定该 id 的独立 sidecar，不改产物。**当前默认仍是隐式 Dev 链**，不得把目标态写成已切换 |

L2 的 `.l2-dev.env` 必须与当前 worktree 的 URL、PORT、SOURCE、COMMIT 和 PROFILE_DIR 一致。提交变化后重新绑定证据；端口被回收或 Host 身份变化后旧证据失效。

稳定基线相关证据不得互相冒充：独立 L2 测试不是多插件集成；单 Host 起停两次不是双真实 Host 并发；在线偶然成功不是 offline frozen 重建；HTTP 200 / 单测不是 ego smoke；未消费的 published 不是 verified；经 current 消费不是 C 显式消费。凭据业务测试走现有明确授权注入，不把凭据写入 baseline 或证据。容量只记录本次实测字节，预检在大复制前，不编造数字。`createdAt`、来源路径、验收报告不进入 `baselineId`。C 合入前须有隔离双真实 Host 等适用验证；C 后正式候选验收才进入 S。脚本不读聊天授权。完整阶段表见 [稳定基线迁移规格](../specs/2026-09-09-stable-baseline-migration.md) 与 [dev-pipeline](dev-pipeline.md)。

## 浏览器与共享探针

- API、脚本和配置优先；需要 Web/Stage 浏览器验收时统一使用 ego-browser 的任务隔离空间，先加载 ego-browser skill。不得回退 IAB，也不得用桌面截图替代浏览器检查。ego 缺少 CDP 事件、脚本源、稳定 task/tab 身份或真实 PNG 能力时为 BLOCKED，不降低校验。
- `pnpm verify:live <stage> --target=l2 --url=<l2-url>` 创建合并前请求；合并后在 Dev 运行 `pnpm verify:live <stage>`。`all` 只覆盖已登记的公开 Stage。
- CLI 返回 pending/request path（exit 2）只表示请求已准备，不是通过。在 `ego-browser nodejs` heredoc 中通过唯一正式模块 `scripts/ego-live-qa.mjs` 创建适配页并调用 `runPreparedQa(requestPath, { tab })`；它不会自动登录。旧弱 `ego-browser-qa.sh` 与 IAB 执行器已退役，历史报告不重标、不作为当前验收。
- 请求在页面准备成功后原子消费一次；准备前后均检查有效期、代码 SHA 与请求身份。认证或浏览器预检失败不消费请求；真正探针开始后即使失败也保留实际 consumedAt，不得复用或声称未消费。并发执行只能有一个消费者，未取得执行权的调用不得覆盖消费者报告。
- run ID、代码 SHA、目标、URL、ego task space/Tab、profile、Host PID/启动时间或运行版本不匹配时失败。前后身份必须相同，runtimeProof 必须读取同源真实加载脚本并核对唯一注册和 bundle 指纹；截图必须真实可解码。不得复用旧 run、旧截图或旧空白会话。
- 先在同一 ego Tab 完成本地认证与 QA 会话准备。证据不得保存 token；探针不得发送消息、生成媒体或提交账号任务。用户接管、任务 inactive/not assigned 或浏览器拒绝立即停止，必须得到明确确认才可恢复；不得换任务、工具、路径或协议绕过。
- 跨轮复用同一 task space；适配器锁定该任务，每次操作核验所有权与选中 Tab。验收结束后先确认报告，再用独立最终 heredoc 调用 `completeTaskSpace(id, { keep: false })` 并检查 `done`；只有 skill 规定的具体理由才可保留页面。

### 页面准备与认证恢复

先为 L2 显式打开正式登录入口，再准备页面；Dev 或已进入 L2 的干净页面只做准备。页面准备复用 `scripts/ego-live-qa.mjs`，由 `runPreparedQa` 在消费请求前调用，也可单独调用。目标仅限合同规定的本地 Dev/L2 地址；先核对当前 Tab 的 origin，再执行页面操作。

L2 必须由同一模块的 `openL2EgoPage` 显式进入。它先后核对 `.l2-dev.env`、当前 Host 身份和 `host.log` 的最后一条正式 `dsh web:` 登录链接；链接必须与已分配 L2 origin 相同、为根路径、无其他参数或凭据、且只有非空 `token`。函数只允许从 `about:blank` 或同一干净 L2 URL 开始，使用一次正常 `tab.goto` 完成 token→Cookie 交换，然后再次核对 Host 身份和干净 URL 后才调用页面准备。链接只在内存中用于该次导航，绝不出现在返回值、日志或证据中。缺少当前登录链接、Host 身份变化、浏览器失败或未回到干净 URL 均停止，不重试、不消费 QA 请求。

按已加载的 ego skill，在 heredoc 中复用已选任务与 Tab，不预写浏览器脚本文件。以下 ID、路径和 URL 必须替换为本任务实际值；登录只在明确需要时单独执行，正式探针不自动发起登录：

```sh
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace(533) // reuse the task id returned by ego
await switchTab('actual-ego-tab-id')
const { createEgoPage, prepareEgoPage, openL2EgoPage, runPreparedQa } = await import('/absolute/worktree/scripts/ego-live-qa.mjs')
const tab = await createEgoPage(
  { currentTab, listTabs, listTaskSpaces, pageInfo, gotoAndWait, cdp, drainEvents, click, waitForElement },
  { taskSpaceId: task.id, tabId: 'actual-ego-tab-id' },
)
// L2 bootstrap only: clean allocated URL, never a token-bearing URL.
const preparation = await openL2EgoPage(tab, { url: 'http://127.0.0.1:44201/' })
cliLog(preparation)
// For an authenticated Dev page use prepareEgoPage(tab, { url, target: 'dev' }).
// In a later heredoc, after preparing the QA session and request:
// cliLog(await runPreparedQa('/absolute/worktree/.workbuddy/evidence/live-qa/<run-id>/ego-browser-qa-request.json', { tab }))
EOF
```

已有准备好的 QA 请求时，直接调用同一模块的 `runPreparedQa(requestPath, { tab })`，不需另跑页面准备。准备结果的 `ready` 仅表示产品页面已加载、未发现可见连接警告，并且现有 Cookie 的同源根路径 `GET` 返回 200；已有旧 UI 而该检查返回 401/403 仍是 `auth-required`，不得消费请求。页面准备最多做两次同源只读检查：首个同源页面检查一次；若随后等待页面就绪或执行精确认证页的内部导航，则在最终就绪后再检查一次。两次之间不循环认证检查。`status: 'recovered'` 表示仅精确认证错误页在检查返回 200 后做过一次页面内部同源导航；都不等于 QA `pass`。业务会话、运行身份和 Stage 断言仍由正式探针验证。L2 调用传 `target: 'l2'` 与该任务实际池内 URL。`prepareEgoPage` 不负责创建标签或取得正式登录链接。

预检失败结果返回给调用者；调用者应保存脱敏结果作为该次尝试的证据。请求的规范报告保持 pending 或保留已有消费者报告，不会被未消费的失败尝试覆盖。

| 状态 | 动作与结果 |
|---|---|
| 已登录且页面就绪，且现有 Cookie 同源 GET 返回 200 | 复用当前页面，不刷新、不切换业务页或会话；随后仍须通过完整运行身份与 Stage 探针 |
| 明确的同源认证错误页 | 一次带 5 秒超时的同源只读请求，使用已有 Cookie；仅在返回 200 时执行一次页面内部同源导航，并等待真实产品 UI 就绪 |
| 任一页面状态下同源请求返回 401/403 | 返回需要认证；L2 仅可由显式 `openL2EgoPage` 读取当前 Host 的正式链接并完成一次登录导航，再重新准备页面 |
| 服务不可达、请求或浏览器工具超时 | 有上限退出并保留未消费请求；区分 HTTP/网络结果与工具等待失败，不默认启动或重启共享 App |
| origin 不匹配或 URL 策略拒绝 | 停止操作，不更换协议、浏览器或请求路径规避拒绝 |
| 页面没有就绪或业务断言失败 | 分别报告准备失败或 QA 失败；HTTP 200、页面标题不能作为业务验收通过依据 |

正式登录链接由当前已运行 Desktop 提供。桌面设置页的“浏览器访问 URL”来自同源 `GET /api/desktop/settings` 的 `web.localUrl`，该接口受现有认证与同源约束保护。必须在有权访问的 Desktop 上取得链接，并仅在内存中交给同一目标 ego Tab 完成正常 token→Cookie 交换；随后使用不含凭据的 URL 调用页面准备。无法可靠读取正式入口时报告阻断，不能把该接口当成免认证 bootstrap API。L2 只能使用该任务当前 Host 在 `host.log` 最后一条正式打印的认证链接；日志时间必须不早于该 Host 的进程启动时间，且读取和导航前后均验证 Host 身份。

禁止复制或伪造 Cookie、读取签名密钥造票、关闭 SameSite、把 fetch 返回的 HTML 写入 DOM、无限重试，以及为验证而清除共享 Dev 认证。缺失认证场景在隔离 L2 验证。登录入口不可用或浏览器工具失败不授予 App 生命周期、配置或凭据修改权限。

准备结果记录脱敏 origin、时间、有限尝试次数、恢复动作和分类原因；不得持久化 Cookie、token、完整认证 URL 或原始敏感工具错误。Strict Cookie 的请求阻止原因只能在有 Network 证据时确认，不能仅凭 401 推断。外层导航被阻止而同源请求成功时，可证明同源恢复有效；底层浏览器发起者原因另行追踪。

导航命令发出后若工具超时，记录已尝试导航且结果未确认；不得宣称页面完全未变，也不自动再次导航。浏览器自身的网络错误页不等于 URL 策略拒绝，仍需区分页面报告的网络失败与独立监听状态证据。

Stage 探针必须从真实 `datasetKey` / Tab ID 触发入口，并至少断言：目标内容非空、active Tab 与选中项唯一、重复打开幂等、关闭后状态清空、重新打开恢复，以及 viewport/context 属于当前会话。HTTP 200、页面标题、loading 占位或合法空态本身都不足以证明 Stage 通过。

默认摘要写入 `docs/evidence/live-qa-report.json`，完整本机证据写入 `.workbuddy/evidence/live-qa/<run-id>/`；这些运行文件不提交。回收 worktree 前把需要保留的证据复制到不会被清理的任务位置。报告至少包含：

- Issue/PR、base/head/merge SHA 与 dirty 状态；
- run ID、Stage、目标 profile、URL、Tab、Host 身份与运行版本；
- 逐项 Given/When/Then、DOM 断言、可解码截图；
- 开始/结束时间、失败或 skip 原因、探针清理与原会话恢复结果。

## Electron 追加证据

只有改动依赖 Electron 壳层、`data-dsh-desktop-*`、macOS/Windows 平台门控、原生拖拽/窗口布局等 web 页面无法呈现的行为时，才额外执行 `pnpm verify:cdp` 并保存 `docs/evidence/live-cdp-qa-report.json`。普通插件 Client/Stage 不要求重复做 Electron 验收。

45120 是 Dev Host 的 web 页面；它能证明 Dev 物化后的 Web/Stage 行为，但不能证明 Electron-only DOM 或 computed style。Electron-required 任务若 CDP 不可用应报告 BLOCKED，不得回退到截图猜测。

## 静态与测试证据

- 运行与 diff 匹配的最小测试集合，记录命令、退出码、真实用例数与 skip 数。代码变更但测试命令缺失、0 tests、失败或未声明 skip 均不能通过。
- `pnpm verify:stages` 证明静态 Stage/adapter 合同，不替代 `verify:live`。实际 sidebar adapter 仍须覆盖 `getSnapshot`、`subscribe`、`open`、`close`、`set`、`readBox` 及会话隔离/关闭重开行为。
- 模型研究和参数合同只使用官方文档与离线 `pnpm verify:model-contracts`；不得发真实模型请求探测支持情况。
- 文档检查的实际能力边界见 [docs governance](docs-governance-standard.md)；没有执行的检查不得写进报告。

## 放行

实施者完成自检后，由独立最终验收者核对真实 diff、证据身份、环境层级、授权和未解决风险。只有全部适用项通过才可放行；证据不完整为 FAIL，工具或环境不可用且无法安全修复为 BLOCKED。

`qa:pass`、合入方式与 R0–R3 权限不在本文件定义，统一遵循 [plugin-git-pr](plugin-git-pr.md)。
