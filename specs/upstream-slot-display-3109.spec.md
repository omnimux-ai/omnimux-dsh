# 规格：上游已连素材不得静默消失（素材卡槽显示与消费一致性）

**Issue**: #3109
**状态**: Draft（本任务）
**范围**: `plugins/omnimux-workflow` 的画布输入消费内核与生成节点输入面板

## 1. 现象与真机快照（Dev 45120 只读实测）

| 项 | 值 |
| --- | --- |
| 目标节点 | `nodeKind=generate`、`materialType=image`、`status=empty`、`selectedTool=image-to-image` |
| 目标 params | `{ model: 'gpt-image-2.5', operation: 'text_to_image' }` |
| 目标绑定 | `inputBindingVersion=1`、`slotBindings={}`、`slotConflicts=[]` |
| 上游节点 | `nodeKind=import`、`materialType=image`、`mediaAssets[0].url` 可解析 |
| 边 | `targetHandle='in'`，无 `role`/`targetSlot` |
| 界面 | 卡槽区只有 1 个追加 `+`，上游图片不可见 |

## 2. 当前实现（链路事实）

1. `useUpstreamMedia` → `buildUiUpstreamFingerprint` → `feedFromFingerprint`：上游图片进入 `feedAssets`（1 条，`ready`）。
2. 卡槽布局唯一真源是 catalog operation：`deriveSlotLayout(catalog, model, params.operation)`。`gpt-image-2.5` 只有 `text_to_image` 是 listed（唯一槽位 `prompt`，文本），故 `layout.slots=[prompt]`。
3. `autoFillSlots` 因 `slot.type !== asset.type` 拒绝该图片 → 落入 `unusedFeed`；`selectSlotOccupants` 只遍历 `bindings`（`{}`）→ `records=[]`。
4. `SlotWells` 的 V1 `records` 分支卡片只来自 `records`，空卡只有追加 `+` → 与截图完全一致。
5. 提交侧 `prepareExecutionSlotGraph` 对 V1 直接早退、`collectMaterialSlotInputs` 以 `data.slotBindings` 为消费真源；`{}` 被当作「显式空」→ `references=[]`，图片只进 `unusedFeedEdgeIds`，而该字段全仓零消费方 → 四道就绪闸门全部放行 → 素材静默丢弃、提交照常成功。
6. 全目录扫描：不存在任何 `listed=true` 且输出 image、又声明 image 输入槽的 operation。`gpt-image-2.5` 的 `multi_reference`（含 `reference_image` 槽）因 `research.status=draft` 未上架，`execution.status=stub`。

## 3. 正确的业务逻辑（本规格裁定）

- 可见性不变量：只要存在可用（或等待中）的上游供给边，该素材就必须在生成节点输入区可见——要么作为已装填卡槽卡（会被本次请求消费），要么作为卡槽外的「未使用」条目（不会被消费，且给出原因）。
- 消费一致性不变量：界面显示、就绪判定、提交装配必须使用同一个有效消费集合。
- 未初始化语义（本任务不改内核）：显示层已把 V1 的「空绑定 + 空待命池」视为未初始化并执行 `autoFillSlots`；内核（`effectiveInputDisplay` / `validateCanvasInputSelection`）把空对象视为「显式空」的语义由既有评估契约固定（`feedSlotKernel.test.mjs`），本任务不得改动。因此「素材可被消费时提交必然携带」依赖显示层把装填结果回写 `slotBindings` 的既有链路，本任务不改变它，仅在 §9 记为后续项。
- 提交语义不变：未被消费的供给按 [node-input-submission](../../docs/contracts/node-input-submission.md) §5.1 不进入请求；本规格要求该事实在提交前已明确告知用户，禁止「素材静默消失且提交成功」的可见路径。
- 不做的事：不新增模型能力、不把未上架 operation 借来渲染（`deriveSlotLayout` 仍只描述当前 operation）、不改卡槽视觉规格、不改既有测试与断言。

## 4. 修复项

| # | 位置 | 变更 |
| --- | --- | --- |
| F1（本任务未实施） | `shared/graph/feedSlot/effectiveInputDisplay.ts`、`shared/graph/canvasSlotRecompute.ts` | 原计划把「空绑定 = 未初始化」提升进内核。**未实施**：该语义被既有评估契约固定在「显式空」一侧（`src/shared/graph/feedSlot/feedSlotKernel.test.mjs` 断言 `slotBindings:{}` 下 `ready:false`），修改内核会翻转既有断言；按硬门禁「测试与断言只读」的要求改为不动内核。 |
| F2 | `shared/graph/feedSlot/effectiveInputDisplay.ts`、`types.ts` | 新增返回值 `unused`：已就绪、但本次生成不会消费的上游媒体供给（排除待命池与文本），带原因码 `no_matching_slot` / `slot_capacity` / `not_bound` / `input_unavailable` |
| F3 | `ConfigPanel/index.tsx`、`canvas/i18n/dict.{zh,en}.ts` | 「未使用」条目对 V1 节点同样渲染（现状仅 legacy 渲染），文案给出具体原因，点击即置为待命；复用既有 `wf-effective-text` 条目样式，不新增视觉规格 |

## 5. 验收标准

| # | 验收点 | 判定方式 |
| --- | --- | --- |
| AC1 | 复现快照（图片 + `text_to_image`）下，输入区出现 1 条「未使用」条目且文案说明原因；已装填卡 0、追加 `+` 1 | 真实组件渲染断言（`tests/e2e/upstream-unused-supply-3109.e2e.test.mjs`） |
| AC2 | 同一份上游图片，当 operation 声明 image 槽时，渲染为 1 张已装填卡槽卡，且无「未使用」条目 | 同上 |
| AC3 | `unused` 只在「已就绪媒体 + 未被任何槽位消费 + 不在待命池」时出现；可消费、待命、未就绪、文本四类均不出现 | 内核单测（`src/shared/graph/feedSlot/unusedSupply.test.mjs`） |
| AC4 | 槽位已满的第二个素材报 `slot_capacity`，已装填的素材不出现在 `unused` | 内核单测 |
| AC5 | legacy（非 V1）节点同样上报未使用供给，不因绑定版本而静默 | 内核单测 |
| AC6 | 既有卡槽回归（空卡数量、首尾帧、文本组合、legacy 路径）零回归 | `omnimux-workflow` 既有测试全绿（2373 tests，2 项既有环境失败已单独定性） |

## 6. 文档影响

- 新增本规格。
- `docs/contracts/node-input-submission.md` §3 已含「当前模式不消费的素材保留在 Feed」，本规格只补齐其可见性义务的执行；如与合同文字冲突，以合同为准，届时改本规格。

## 7. 新用户基线

- 依赖：随包 catalog 与当前环境 DSH_HOME 下用户数据；不依赖任何开发机路径。
- 缺失时：catalog 不可用时既有 `input.reason.catalog` 文案与空态保持不变。

## 8. 未纳入本规格（需另行决策）

- `gpt-image-2.5#multi_reference` 的上架闭环（契约定义 → 真机验证 → listed → 渠道组/白名单 → 门禁核验）。它决定「图生图」能否真正消费上游图片，属模型上架变更，需要真实生成验证证据与明确授权。
