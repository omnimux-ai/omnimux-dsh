---
title: "Multi-channel model selector and contract adaptation QA — 2026-09-26"
id: "evidence-multi-channel-selector-qa"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-26"
updated: "2026-09-26"
authors: ["qi-huolin", "shen-qiuhau"]
subsystem: "omnimux-workflow"
related:
  - "specs/2652-multi-channel-selector-and-contract-adaptation.spec.md"
---

# Multi-channel Model Selector & Contract Adaptation QA — 2026-09-26

## 1. 验证目标与交付范围
- **Issue**: #2652 多渠道模型选择器与契约自适应重构
- **核心闭环**: 
  1. 逻辑模型统一标识（单一对外 Model ID，如 `seedance-2-0`, `gpt-image-2.5`）；
  2. 官方专线（旗舰版/官方版/标准版）与用户自备渠道（我的 fal.ai / 我的 OpenAI / 我的 自建端点）分栏与单选互斥；
  3. 参数面板契约动态协调（单图卡槽动态截断至首槽、画幅/时长/声音受限自适应自愈与 100% 字典提示）；
  4. 调度执行直达对应物理端点，彻底解除 agent 模式对媒体生成的封锁，杜绝官方凭据泄露。

## 2. 自动化测试执行与回归证据
- **多渠道核心单元测试集**: `271 / 271` 通过（29 个测试套件，用时 185ms）
  - `channel-groups.test.js`: 官方渠道白名单只读化、动态聚合 BYOK、http(s) 端点协议校验通过；
  - `runtime-mode.test.js`: mediaReadyFor 判定、解耦 agent 模式连坐封锁、官方兜底门禁通过；
  - `schema.test.js`: byokProviders 结构清洗与密钥隔离通过；
  - `byok/http.test.js`: siliconflow 支持与密钥安全重置通过；
  - `multi-channel-runtime.test.js`: 逻辑模型 ID 守门、安全环境变量清理通过；
  - `channelGroups.test.mjs`: 纯函数隔离与单选载荷派发通过；
  - `channelContractReconciler.test.mjs`: 参数自愈契约与失效平滑降级通过；
  - `modelCascadeMenu.test.mjs`: 菜单高度自适应锁定与单选互斥通过。
- **工作流全量单元测试集**: `2145 / 2145` 全部通过（145 个测试套件，用时 9.6s）。
- **静态规则与门禁核验**:
  - `verify-channel-group-naming.mjs`: 34 个渠道分组命名 100% 命中白名单，无多余装饰 emoji 与冗余标签。
  - `verify-model-contracts.mjs`: 80 个模型规格处理完备。
  - `verify-cross-plugin-model-alignment.mjs`: 跨插件模型、默认项、画幅比例 100% 对齐。

## 3. 真实交互与场景验收 (ws_qa_media)
- **单图渠道槽位收拢**: 在标准画布工程加载包含 2 个参考图槽位的视频节点，切换至仅支持单图的 BYOK 渠道时，UI 槽位动态缩减为 1 个，未配置槽位不再阻断生成按钮；
- **失效自备渠道回退**: 当配置的自备渠道不可用时，面板顶部浮现轻量黄色警告条「自备渠道已不可用，已自动匹配基准专线」，并提供「切换为官方标准版」一键自愈按钮；未处理前点击生成安全 Toast 拦截。
