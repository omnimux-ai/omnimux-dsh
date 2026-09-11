---
title: "OmniMux 防死循环自检与 LoopGuard 契约 (Anti-Loop Contract)"
id: "contract-omnimux-anti-loop"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["anti-loop", "loop-guard", "self-check", "circuit-breaker"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-contracts-architecture.md"
  - "docs/contracts/omnimux-baseline-contract.md"
---

# OmniMux 防死循环自检与 LoopGuard 契约 (Anti-Loop Contract)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用角色**：`[orchestrator, video-producer, router, planner, executor]`

---

## 1. 调用前自省原则 (Pre-Call Self-Check)

在调用任何 Hub 工具或派发子 Agent 之前，Agent 必须完成前置自问：
> **“我上一轮或前几次调用，是否已经用相同的核心参数调用过同一个工具？”**

如果答案是肯定的，**必须立即终止重复调用**，从下列替代策略中选择一种，或停下来向用户寻求关键决策。

---

## 2. 典型死循环模式与替代策略 (Loops vs Alternatives)

| 死循环行为 | 严禁行为 | 必须采取的合规替代策略 |
|---|---|---|
| **文件读取区间报错** | 反复微调或盲目重读相同区间 | 调整 `offset`/`limit`，或者直接向用户汇报文件格式异常 |
| **生图/生视频模型报错** | 仅微调标点、同义词或空格反复重试 | 实质性调整视觉主体、重新组装 4 维正交机位，或切换模型渠道 |
| **特定模型不可用** | 连续向离线模型发出重试请求 | 调用 `modelCatalog.list()` 检索同能力平替模型并向用户呈现选项 |
| **分镜/文本节点打补丁冲突** | 反复重发相同的局部 hunk patch | 先重新拉取节点当前哈希/最新内容，或者请求用户确认基准版本 |
| **二进制乱码重读** | 反复用文本工具读取二进制媒体 | 阻断文本读取，提示使用多模态理解接口或专用媒体工具处理 |

---

## 3. 运行时硬门禁：LoopGuard

在 OmniMux Hub 中枢，部署了基于滑动窗口的 `LoopGuard` 运行时守卫：
1. **语义指纹计算**：对每次调用的 `toolName` 及剔除噪声字段（`timestamp`, `requestId`）后的关键参数进行确定性哈希：`toolName#hash`；
2. **熔断规则 (Trip Rule)**：在最近 5 次工具调用窗口中，若相同语义指纹**累计出现达 3 次**，底层直接拦截，返回：
   ```json
   {
     "ok": false,
     "error": "LOOP_GUARD_BLOCKED",
     "message": "LoopGuard blocked repeated identical call to 'tool_name' (3 times in last 5 calls). Must change parameters, model, or stop to ask user."
   }
   ```
3. **被阻断后的强制行为**：Agent 接收到 `LOOP_GUARD_BLOCKED` 后，严禁继续微调参数，必须：
   - 切换工具或模型；
   - 对 Prompt/输入结构进行根本性重构；
   - 或者向用户呈现阻断原因并请求人工决策。
