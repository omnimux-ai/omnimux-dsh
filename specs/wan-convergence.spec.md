---
title: "对齐上游网关 Wan 3.0 单一模型 ID 与别名收敛架构规格"
id: "spec-wan-convergence"
type: "acceptance-spec"
status: "active"
date: "2026-09-14"
authors: ["agent"]
issue: 1696
---

# 对齐上游网关 Wan 3.0 单一模型 ID 与别名收敛架构规格

上游网关已于 2026-09-14 14:35-14:44 合入《Wan 3.0 Model ID & Endpoint Convergence (Option 1)》（提交 `6919f4db9` / `5a88dbe5e`），明确将对外模型统合为单一公共 ID `wan-3.0`，原三款衍生形态（`wan-3.0-prime`、`wan-3.0-ref`、`wan-3.0-prime-ref`）降级为过渡别名。

## 1. 范围

| 交付项 | 说明 |
|---|---|
| `video-models.yaml` 别名收敛 | 在 `wan-3.0` 的 `aliases` 列表中追加 `wan-3.0-prime`、`wan-3.0-ref`、`wan-3.0-prime-ref`，移除这三款作为独立模型的草稿定义。 |
| `dispositions.json` 别名映射 | 将三款衍生模型从 `draft` 改为 `alias`，目标指向 `wan-3.0`，记录上游统一收敛的判定依据与提交来源。 |
| 治理计数与回归测试同步 | 契约行数由 53 回落至 50，运行时 ID 保持 76，`missingInYaml` 增加 3 个别名 ID；同步各测试断言。 |
| 缺口清单与文档同步 | 在 `docs/specs/model-contract-interface-docs-reconciliation-backlog.md` 中标记 Wan 3.0 家族已完成架构收敛。 |

## 2. 验收标准

1. `node scripts/verify-model-contracts.mjs --strict` 全绿，0 错误 0 警告；
2. `toProductId('wan-3.0-prime') === 'wan-3.0'`、`toProductId('wan-3.0-ref') === 'wan-3.0'`、`toProductId('wan-3.0-prime-ref') === 'wan-3.0'`，别名桥 100% 打通；
3. `wan-3.0` 独立承载文生视频、首帧驱动、首尾帧过渡、全能参考四项核心能力；
4. 全量契约与中枢测试通过。
