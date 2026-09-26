---
title: "TikTok Agent Preset Explicit Priority & Fallback Isolation QA — 2026-09-26"
id: "evidence-tiktok-agent-preset-priority"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-26"
updated: "2026-09-26"
authors: ["pei-xiansu"]
subsystem: "omnimux"
related:
  - "specs/tiktok-agent-preset-explicit-priority.spec.md"
---

# TikTok Agent Preset Explicit Priority & Fallback Isolation QA — 2026-09-26

## 1. 验证目标
- **目标**: 落实代码审查员审秋毫意见，彻底消除 `isTikTokAgentPreset` 中回退探测链（`window.__omnimuxActivePreset` 与 DOM 席位）穿透覆盖显式指定的非 TikTok 预设的问题。
- **核心修复**:
  1. 明确显式入参的绝对优先级（`props.agentPreset` -> `session.projectionValues.agentPreset` -> `session.agentPreset` -> `session.meta.agentPreset`）；
  2. 只要任一显式字段为非空字符串，直接按其白名单匹配结果返回，严禁向下穿透到全局与 DOM 回退；
  3. 只有当全部显式字段未指定或为空时，才向下执行全局与 DOM 回退探测。

## 2. 自动化测试实测结果
- 测试命令: `node --test plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.test.js`
- 结果: 12 tests, 12 passed, 0 failed, 100% 通过。
- 覆盖用例:
  - 白名单严格包含 6 种官方及别名定义
  - 优先级 1-4: 从 props/session 各级显式参数命中 TikTok
  - 优先级 5-7: 显式未指定时回退至全局与 DOM 席位命中 TikTok
  - 隔离测试 1: 显式非 TikTok 预设绝对优先，绝不受全局 `window.__omnimuxActivePreset = 'tiktok-agent'` 污染穿透
  - 隔离测试 2: 显式非 TikTok 预设绝对优先，绝不受 DOM 席位属性或文本残留污染穿透
  - 隔离测试 3: 全局变量与 DOM 席位同时存在 TikTok 残留时，显式指定非 TikTok 预设依然严格隔离返回 false
