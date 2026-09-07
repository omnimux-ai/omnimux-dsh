---
title: ego-browser 共享验收执行链迁移
id: spec-ego-browser-qa
type: spec
status: accepted
authority: L2
date: 2026-09-07
updated: 2026-09-07
authors: [agent]
subsystem: qa
---

# ego-browser 共享验收执行链迁移

取代 [Codex 内置浏览器适配](2026-09-05-builtin-browser-qa.md) 的活跃执行规范，不修改或重标历史证据。API、脚本和配置仍优先；必须浏览器时统一 ego，不回退 IAB。能力不足为 BLOCKED，不降低验收标准。

## 能力前提

隔离 ego task space 验证稳定 task/tab ID、本地 Dev/L2 访问、CDP `Debugger.scriptParsed`、`Debugger.getScriptSource` 与可 CRC 解码 PNG。L2 使用当前 Host 正式入口，在内存中一次导航交换 token，回到干净 URL；不读取签名密钥，不复制 Cookie，不把敏感 URL 或原始浏览器错误写入日志。任何策略拒绝、用户接管或任务失去所有权立即停止，不换工具/路径/协议。

2026-09-07 能力实测：task 533、Dev 与 L2 Tab 跨轮稳定；Dev 45120 CDP 返回 26–27 个 parsed events，读取同源插件源成功；PNG 3456×1746 通过 CRC 解码；L2 44201 正式入口登录 ready。能力证明与完整 Stage 验收分列。

真实 L2 `assets` 共享探针 run `0a4438f9-b028-426d-b1e7-dbc6104e78b9`：六项 Stage/恢复断言通过，前后 task/tab、Host 和 runtimeProof 一致；hub 为唯一 normalized registration，assets 为唯一 raw registration。PNG 3808×1826、155573 bytes，经 CRC 解码与严格消费者校验。源码为隔离树未提交 diff、HEAD `3054947b58c9438495bea47e143dc8805139f3b1`；并非最新 main 集成结果，也不代替独立 QA。

## 模块与唯一执行路径

- `live-qa.mjs` 创建 SHA/URL/profile/Host/runId 绑定、15 分钟有效的一次请求，CLI 仍 pending/exit 2。
- `ego-browser-page.mjs` 仅适配 skill 公共 helpers：CDP、事件队列、点击、等待、导航；每次操作核验 task/tab 所有权与身份。事件队列先清空、启用 Debugger、经 CDP 屏障后排空，超限或不完整即失败。源码只留内存。
- `live-page-preparation.mjs` 承载认证预检与正式 L2 入口；`live-browser-utils.mjs` 承载 URL 策略、有限等待及脱敏；`live-qa-request.mjs` 承载请求身份和原子消费。
- `ego-live-qa.mjs` 为唯一正式执行模块，调用原共享 `runStageProbe` 和 `captureRuntimeProof`；不恢复旧弱 ego 收集器。
- 消费者只接受 `tool: ego-browser`、同次 `ego-browser-qa-request.json`、task/tab 身份、完整 Stage 断言、前后运行指纹和真实 PNG。Electron-only CDP 仍是追加证据，不能替代 Web。
- #702 的拆分流水线由 `auto-pipeline-qa.mjs` 承载浏览器期望与验收；影响面维度统一为 `dimensions.browser`，旧 `dimensions.iab` 不降级兼容。保留 `resolveImpact` 的一致性校验、CI 前序失败阻断、`syncQaPassLabel` 先删后加，以及准入/运行时授权分离；缺失证据与撤销/风险升级均不放行。

## 消费与失败语义

认证或浏览器预检失败不消费请求，不覆盖 pending/其他消费者报告。准备前后复查请求、SHA、有效期；以独占创建消费锁原子取得执行权。正式探针阶段失败保留真实 `consumedAt`，不得宣称所有失败未消费。并发失败者不覆盖消费者报告。runtimeProof 继续校验同源真实加载脚本、唯一插件注册、磁盘与运行时代码指纹以及前后稳定性。

## 验证与边界

覆盖认证恢复、正式 L2 入口、token 脱敏、过期/替换/并发消费、错 task/tab/URL/profile/Host、事件缺失/超限、指纹漂移、PNG 解码失败及消费者拒绝旧工具。最终 `pnpm test:gates` 70/70、消费者测试 11/11 通过，无 skip；包括迟到身份检查超时后不得继续发命令、锁释放失败仍保存已消费失败报告的回归。使用本机原生 Node/Corepack、完整系统 PATH、现有 Corepack cache 和任务内既有依赖链接，未弱化门禁。独立 QA 由主理人另派。

交付时 `origin/main` 已推进到 `57f63a709a41124b8dcd199ce61fae3b94e74754`。其中 #702 的 CI/流水线治理与本树四个文件重叠；必须在保留新治理的前提下迁移实际消费者并重新测试，不得整文件覆盖最新 main。详见[实施报告](../evidence/2026-09-07-ego-browser-migration.md)。

只改本仓脚本、测试、浏览器规范和自有 skills；共享 `/Users/x/.codex/AGENTS.md` 由主理人安排后续处理。禁止官方 DSH/其他仓/生产修改、push/merge、账号任务、媒体生成或真实付款。真实 L2 共享探针及独立验收未完成前不宣称迁移交付。
