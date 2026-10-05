# 规格 · 图生图契约对齐（Issue #3128）

- 任务工作树：`.worktrees/workflow-multiref-contract-issue-3128`
- 基线：`origin/main` @ `7aad4c19e`
- 关联：#3109（上游素材可见性）、#2850（标准图像线路权限拒绝阻断真实验收）、#3128（本任务）
- 只读取证报告：`.agent-reports/gpt-image-25-multiref-contract-20261005/01-hub-contract.md`、`02-upstream-contract.md`、`03-canvas-alignment.md`

## 1. 用户问题（大白话）

把上游图片连到生成节点上，卡槽里明明显示已经装好了，点生成也能点，但**请求里没有那张图**——用户以为在用参考图，实际是纯文生图，而且界面和报错都不提示。

## 2. 已锁定的根源

### 2.1 直接门（中枢目录配置状态，本规格不改）
`listed ⇔ contractComplete ∧ research==='verified' ∧ implementation==='ready' ∧ adapterProfileCompatible.ok ∧ gateAllows`（`plugins/omnimux/src/catalog/contract/status.js:276-291`）。`gpt-image-2.5#multi_reference` 实测仅 `research.status: draft` 为假，故画布不派生图片槽。`execution.status: stub` 不参与 listed。升格属上架闭环，需单独授权，不在本规格范围。

### 2.2 阻断级缺陷（本规格修复）
`slotBindings: {}` 是 V1 节点首次重算的必然产物（`shared/graph/canvasSlotRecompute.ts:70` 把 `undefined` 归一成 `{}`）。该状态在两侧语义相反：
- 显示侧：`{}` + 空待命 ⇒ 视为未初始化 ⇒ 自愈装填（既有断言 `ConfigPanel/slotAutofillRegression.test.mjs` 钉死，是刻意设计）；
- 执行侧：`{}` ⇒ 视为显式为空 ⇒ 不装填（既有断言 `src/workflow/execution/feedSlotSubmission.test.mjs` 钉死）。
两侧断言都受「测试与断言只读」保护，因此**不能改任一端的判定**，只能让节点不再停在这个歧义状态。

### 2.3 目录声明与上游契约不对齐（本规格修复声明层）
上游公开契约：`POST /v1/images/generations`，图片输入字段 `images`（字符串数组，URL/base64，别名归一化，上限 16），**未公布 GPT Image edits 端点**。本仓 `image-models.yaml` 的 `multi_reference` 注记声称「已落地 Edits 路由」，与官方和本仓实现均不符；`allowedMimes`/`maxSizeMb`/`max:1` 均为本仓保守策略而非上游公布值，但注记未说清来源。

## 3. 不变量

- **显示与提交同源**：界面上显示为「已装填且就绪」的槽位，其占位者必须出现在提交载荷里；反之亦然。
- **不改变既有语义**：内核 `slotBindings: {}` = 显式为空 的契约不变；执行侧读取 `{}` 的行为不变；legacy 路径行为不变。
- **待命是用户意志**：`slotStandbyEdgeIds` 含该边时绝不自动装填。
- **无可装填时保持原状**：没有可装填供给时，重算结果仍是 `{}`（存量断言 `canvasStore.catalogHydrate.test.mjs` 要求）。
- **声明只写有据之事**：目录注记不得声称上游未公布或本仓未实现的路由/端点。

## 4. 修复项

| # | 位置 | 变更 |
| --- | --- | --- |
| F1 | `plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts` | V1 且 `slotBindings` 为 `undefined`（未初始化）时，执行与显示侧**同一个** `autoFillSlots` 并落盘结果，而不是写入 `{}`；待命边照旧排除 |
| F2 | `plugins/omnimux/src/catalog/specs/image-models.yaml` | 更正 `multi_reference` 的 `implementation.notes`（删除与官方和本仓实现均不符的「Edits 路由」表述）；把 `limitSource` 写清楚：上限与格式限制是本仓保守策略，上游合同只公布 `{min:0, max:16}` |
| F3 | `plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs`（新增） | 锁定「显示已装填 ⇒ 提交必含该 reference」等一致性断言与反向边界 |

## 5. 验收标准

| # | 验收点 | 判定方式 |
| --- | --- | --- |
| AC1 | V1 节点 `slotBindings` 未初始化 + 可装填的上游图片 + operation 声明图片槽 ⇒ 重算后 `slotBindings` 落盘该占位者，且 `compat.readyToSubmit` 在正文齐备时为真 | 内核单测（真实 `recomputeCanvasSlots`） |
| AC2 | 同一节点上，显示侧 `effectiveInputDisplay` 与提交侧 `collectMaterialSlotInputs` 得到同一集合：显示已装填 ⇒ `references` 非空 | 一致性单测（两侧同源断言） |
| AC3 | 待命边存在时不得自动装填（显示与提交都为空） | 内核单测 |
| AC4 | 无可装填供给（无上游 / 类型不匹配）时重算结果仍是 `{}` | 内核单测 |
| AC5 | 目录声明不再声称 Edits 路由；`limitSource` 明示保守策略来源 | 目录契约测试（文本断言）+ `pnpm verify:model-contracts` |
| AC6 | 既有回归零翻转 | `omnimux-workflow` 全量测试；`omnimux` 全量测试 |

## 6. 文档影响

- 新增本规格。
- 不修改任何既有测试与断言。

## 7. 新用户基线

不引入开发机路径、不引入本机服务或端口、不新增环境变量；变更只影响 V1 生成节点的槽位重算与目录注记文本。

## 8. 不在范围

- `research.status` 由 draft 升 verified 并激活上架（需真机最小生成验证；当前被 #2850 上游图像分组权限 403 阻断）。
- 把 `max` 由 1 提到上游 16 并支持多图参考（需同时改 `map.js` 的 OpenAI 发包分支与画布多槽交互，属能力扩展）。
- 轮询端点 `GET /v1/images/generations/{task_id}` 未被上游公布一事（记录为风险，不改）。
