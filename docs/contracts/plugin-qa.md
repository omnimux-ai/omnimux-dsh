---
title: "plugin-qa — OmniMux 插件验收证据合同"
id: "contract-plugin-qa"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-28"
updated: "2026-09-05"
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
| Client / Stage / 侧栏 | 独立 L2 + Codex 内置浏览器 + 共享 `verify:live` 探针 | Dev `~/.omnimux-dev` / 45120 + 同一共享探针 | 默认不要求 Electron |
| 壳层 / 平台门控 | Client 证据 + 真实 Electron renderer/CDP | Dev App 中复核 | 不能只用 45120 web 页面替代 Electron |
| 生产发布 | 另见发布授权与发布计划 | 授权目标上的发布/回滚证据 | 不属于普通开发验收 |

每条 Issue acceptance 只绑定适用层。`not applicable` 必须给出变更面理由；skip、环境错误或未执行检查不能写成 PASS。

## 环境身份

| 环境 | 身份要求 |
|---|---|
| 合并前 L2 | 端口 `44201–44299`，`~/.dsh-dev/tasks/<task>`，SOURCE 指向当前 worktree，link 在研插件不超过一个 |
| 合并后 Dev | `~/.omnimux-dev`，端口 `45120`，物化源必须是已合并 `main` |
| Prod | `~/.omnimux`；没有独立发布授权不得写入或用于普通交付 |

L2 的 `.l2-dev.env` 必须与当前 worktree 的 URL、PORT、SOURCE、COMMIT 和 PROFILE_DIR 一致。提交变化后重新绑定证据；端口被回收或 Host 身份变化后旧证据失效。

## 浏览器与共享探针

- Web/Stage 验收使用当前 Codex 会话的内置浏览器（IAB），不得使用旧 ego-browser 流程，也不得用桌面截图替代浏览器检查。
- `pnpm verify:live <stage> --target=l2 --url=<l2-url>` 创建合并前请求；合并后在 Dev 运行 `pnpm verify:live <stage>`。`all` 只覆盖已登记的公开 Stage。
- CLI 返回 pending/request path 只表示请求已准备，不是通过。当前 IAB Tab 必须实际执行 `scripts/codex-browser-qa.mjs` 的 `runPreparedQa(requestPath, { tab })` 并产出最终报告。
- 请求在页面准备成功后原子消费一次；准备前后均检查有效期、代码 SHA 与请求身份。认证或浏览器预检失败不消费请求；真正探针开始后不得复用。并发执行只能有一个消费者，未取得执行权的调用不得覆盖消费者报告。
- run ID、代码 SHA、目标、URL、Tab、profile、Host PID/启动时间或运行版本不匹配时失败。不得复用旧 run、旧截图或旧空白会话。
- 先在同一 IAB Tab 完成本地认证与 QA 会话准备。证据不得保存 token；探针不得发送消息、生成媒体或提交账号任务。

### 页面准备与认证恢复

页面准备复用 `scripts/codex-browser-qa.mjs`，由 `runPreparedQa` 在消费请求前调用，也可在 Agent 进入 Dev/L2 时单独调用。目标仅限合同规定的本地 Dev/L2 地址；先核对当前 Tab 的 origin，再执行页面操作。

在已选择当前任务真实 IAB Tab 的浏览器执行环境中导入该 worktree 的模块：

```js
const { prepareIabPage } = await import('/absolute/worktree/scripts/codex-browser-qa.mjs')
const preparation = await prepareIabPage(tab, { url: 'http://127.0.0.1:45120/', target: 'dev' })
```

已有准备好的 QA 请求时，直接调用同一模块的 `runPreparedQa(requestPath, { tab })`，不需另跑页面准备。准备结果的 `ready` 仅表示产品页面已加载且未发现可见连接警告，`status: 'recovered'` 表示本次做过同源导航；都不等于 QA `pass`。业务会话、运行身份和 Stage 断言仍由正式探针验证。L2 调用传 `target: 'l2'` 与该任务实际池内 URL。准备函数不负责创建标签或获取正式登录链接。

预检失败结果返回给调用者；调用者应保存脱敏结果作为该次尝试的证据。请求的规范报告保持 pending 或保留已有消费者报告，不会被未消费的失败尝试覆盖。

| 状态 | 动作与结果 |
|---|---|
| 已登录且页面就绪 | 复用当前页面，不刷新、不切换业务页或会话；随后仍须通过完整运行身份与 Stage 探针 |
| 明确的同源认证错误页 | 一次带 5 秒超时的同源只读请求，使用已有 Cookie；仅在返回 200 时执行一次页面内部同源导航，并等待真实产品 UI 就绪 |
| 同源请求仍返回 401 | 返回需要认证；Agent 通过已运行 Desktop 的正式“浏览器访问 URL”完成登录，再重新准备页面 |
| 服务不可达、请求或浏览器工具超时 | 有上限退出并保留未消费请求；区分 HTTP/网络结果与工具等待失败，不默认启动或重启共享 App |
| origin 不匹配或 URL 策略拒绝 | 停止操作，不更换协议、浏览器或请求路径规避拒绝 |
| 页面没有就绪或业务断言失败 | 分别报告准备失败或 QA 失败；HTTP 200、页面标题不能作为业务验收通过依据 |

正式登录链接由当前已运行 Desktop 提供。桌面设置页的“浏览器访问 URL”来自同源 `GET /api/desktop/settings` 的 `web.localUrl`，该接口受现有认证与同源约束保护。必须在有权访问的 Desktop 上取得链接，并仅在内存中交给同一目标 IAB 完成正常 token→Cookie 交换；随后使用不含凭据的 URL 调用页面准备。无法可靠读取正式入口时报告阻断，不能把该接口当成免认证 bootstrap API。L2 使用该任务 Host 正式打印的认证链接。

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
