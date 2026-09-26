---
title: "Official Text Model and Local Agent Coexistence QA — 2026-09-26"
id: "evidence-text-channel-coexistence"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-26"
updated: "2026-09-26"
authors: ["qi-huolin"]
subsystem: "omnimux"
related:
  - "specs/2694-text-channel-coexistence.spec.md"
---

# Official Text Model & Local Agent Coexistence QA — 2026-09-26

## 1. 验证目标
- **Issue**: #2694 官方文本模型与本地 Agent 正交共存，解除全域模式对中枢模型的隐式截胡
- **核心修复**:
  1. 解耦 \`text/execute.js\` 与 \`text/mount.js\` 中将官方文本模型请求（如 \`gemini-3.8-flash\`, \`claude-opus-4-6\`）无条件截胡给本地 CLI（如 \`codex exec\`）的逻辑；
  2. 凡目标渠道为官方专线或模型属于官方中枢白名单且系统具备官方 Token 的请求，无条件直接走官方网关执行，绝不塞给本地 Agent CLI，彻底根除 400 \`invalid_request_error\` 和空 Prompt 挂起假死；
  3. 请求显式指定走 Agent（如 \`@agent\`）或缺少官方凭据时，安全交由本地 CLI 承接。

## 2. 自动化测试实测结果
- \`plugins/omnimux/src/text/text-channel-coexist.test.js\`: 4/4 PASS
- 全套多渠道与运行模式测试集: 239/239 PASS
