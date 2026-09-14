---
title: "模型契约层与接口文档对账缺口整改（一期）"
id: "spec-model-contract-interface-docs-reconciliation"
type: "acceptance-spec"
status: "active"
date: "2026-09-14"
authors: ["agent"]
issue: 1650
---

# 模型契约层与接口文档对账缺口整改（一期）

来源：模型契约层完整性/准确性排查（2026-09-14）。契约层内部自洽，缺口集中在与公开接口文档 `OmniMux-docs`、网关侧目录之间的对账。

## 1. 范围

| 编号 | 交付物 | 类型 |
| --- | --- | --- |
| R1 | 契约登记修正：`gpt-image2-hd` 契约行更名为 `gpt-image-2.5-hd`（旧写法 `gpt-image-2-hd` / `gpt-image2-hd` 登记为别名）；`gpt-image-2` **保持 canonical**，把「文档称停用 vs 网关 goeasy 适配器仍接受」的冲突登记在处置行，待网关侧裁定 | 契约数据 |
| R2 | `docs/contracts/model-capabilities-matrix.md` 5 处不全/自相矛盾修订 | 文档 |
| R3 | 参数域（`parameters`）离线结构校验，纳入 `verify:model-contracts` | 门禁代码 + 单测 |
| R4 | 19 个缺失模型的整改单（结构化 backlog，可独立执行） | 文档 |

## 2. 验收标准（可测）

### R1

1. `gpt-image-2.5-hd` 在 `specs/image-models.yaml` 有契约行（`output.type: image`，槽位与上限齐备，`limitSource` 完整），处置为 `canonical`，`aliases[]` 含 `gpt-image-2-hd` 与 `gpt-image2-hd`。
2. `gpt-image-2` 仍是 `models[].id` 且处置为 `canonical`（`requiredInAuto: true` 不变）；其处置行 `notes` 记录公开文档的更名声明与网关 `relay/channel/task/goeasy/adaptor.go` 仍接受旧 ID 的冲突，以及"降级为别名须待网关侧裁定"。
3. `gpt-image-2-hd` / `gpt-image2-hd` 的处置行为 `alias` → target `gpt-image-2.5-hd`，且目标行声明二者（满足 D3）；运行时 ID 宇宙由 69 增至 71，处置表行数同增。
4. `auto-serving-manifest.json` 不变（注册 19 / `requiredInAuto` 17）；`generationPolicy.ts` 图像白名单不变。
5. `node scripts/verify-model-contracts.mjs --strict`：`ok=true`、`admission errors=0`、`coverage extra=0`、`dispositions unresolved=0`、`listedOperations=66` 不变。

### R2

1. operation 表行数 = `operation-registry.json` 的 operation 数（21），缺项 `end_frame` / `video_extend` / `document_to_video` / `webpage_to_video` 全部补入。
2. `video_multi_ref` 中文名在文档内唯一，且与其 registry `label` 一致。
3. §3.2 字段表覆盖 schema 中在用的全部槽位字段（含 `inputGroups`、`maxSizeExclusive`、`minDurationSec`、`totalMinDurationSec`、`totalMaxDurationSec`、`combinedOutputMaxDurationSec`、`totalMinExclusive`、`totalMaxExclusive`、`hint`）。
4. §3.1 覆盖 `family` / `badge` / `subtitle` / `routing` / `governance` 与 operation 级 `mode`。
5. §3.4 覆盖 `logicalFields` / `vendorFields` / `forbiddenVendorFields` / `unknownFieldPolicy` / `operationVendorShapes`，并标注 `slotRoles` 当前无档案使用。

### R3

1. 新增校验在 `--strict` 与默认模式下均为 error 级，进入 `verify:model-contracts` 的 admission 或脚本级检查。
2. 校验覆盖：`prompt`/文本类参数的 `minLength`/`maxLength`（正整数、`minLength ≤ maxLength`）；`options`（非空数组、元素为标量或 `{value}`、`value` 唯一）；`range`（`min ≤ max`、`step > 0`）；`allowAuto` / `supported` / `watermark` 等布尔位；`unit` 字符串。
3. 存在单测：合法样例通过；`minLength > maxLength`、重复 `option.value`、`range.min > range.max`、`step = 0`、`allowAuto` 非布尔 → 各自产出稳定错误码。
4. 现有 49 个模型全部通过（既有 spec 零误报）；`listedOperations` 集合除 R1 的收敛外不变。

### R4

1. 整改单逐模型给出：文档 id、系列、文档声明接口、文档硬约束、建议 operation、关键参数面、证据路径、与现有契约关系、优先级。
2. 含家族归并结论（`minimax-h3-*` 家族、`wan-3.0-*` 家族）与不确定项清单。
3. 整改单可独立执行，无需回读 Issue #1650 或本轮对话。

## 3. 验证用例（执行步骤 + 期望结果）

| # | 步骤 | 期望 |
| --- | --- | --- |
| V1 | worktree 内 `node scripts/verify-model-contracts.mjs --strict` | exit 0；`admission errors=0 warnings=0`；`coverage extra=0` |
| V2 | `git grep -n "gpt-image-2-hd" -- plugins/omnimux/src/catalog/specs` | 旧写法只出现在 `gpt-image-2.5-hd` 的 `aliases[]`，不作为 `- id:`；`gpt-image-2` 仍为独立 `- id:`（R1.2） |
| V3 | `pnpm --filter omnimux test`（或等价 node --test 全量） | 全绿（与基线一致的既有失败除外，需在 PR 说明） |
| V4 | 新增参数校验单测 | 正反例全部通过 |
| V5 | 逐条比对 R2 验收项与 `model-capabilities-matrix.md` | 5 项全部满足 |
| V6 | `git diff --check`、文档链接可达性 | 无空白错误、无断链 |

## 4. 非目标

- 不逐模型补齐 19 个缺失契约（R4 仅出整改单）。
- 不修改 `OmniMux-docs`（另一工作区，需单独授权）。
- 不发真实模型请求、不探测接口。
- 不为 `gpt-image-2` 的“文档称停用 vs 网关 goeasy 适配器仍接受”冲突单方面裁定；以证据登记 + 待裁定项形式记录（待裁定项见整改单 `docs/specs/model-contract-interface-docs-reconciliation-backlog.md` 的「开放裁定项」）。

## 5. 风险与回滚

- R1 只改变未上架行：`gpt-image2-hd`（draft）改名为 `gpt-image-2.5-hd`，目录投影多一个未上架行、少一个未上架行；`gpt-image-2` 及其 listed operation 不变。回滚 = revert 单个提交。
- R3 新增红了之后若发现既有 spec 误报，按“先修数据、再修门禁”的顺序，或将该规则降级为 warning 并记录理由。
