# Spec · 素材卡槽按模型能力默认显示 + 本地导入类型白名单

垂直票：素材卡槽按模型能力默认显示 + 本地导入类型白名单（behavior/data-flow only；零新增 UI 元素、零新增文案；复用既有 SlotWells 卡槽与 ResourcePickerModal）。

## 1. Objective（目标）

- 当模型任一列出 operation 声明了可绑定素材槽（bindableSlots 非空）时，素材卡槽条默认显示——即使当前选中 operation 自身 `deriveSlotLayout` 为 `none`（如 `gpt-image-2.5` 的 `text_to_image`）。
- 借出的卡槽布局带 `displayOnlyFromOperation` 标记；用户通过这些卡槽经 ResourcePicker 提交素材时，先把节点 operation 切换为借出 operation，再按该 op 的槽位绑定。
- LocalUploadPane 新增 `acceptedTypes` 过滤（与 CanvasResourcePane 同语义），本地导入在 ingest 时拦截不匹配类型，复用 `picker.unsupported` toast 文案，不加新 i18n key。
- `materialTypeFromFilename` 扩展 `.txt`/`.md` → `'text'`。

## 2. Commands（命令）

- 测试（插件根 `plugins/omnimux-workflow`）：
  `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`

## 3. Project Structure（结构）

- 内核：`src/shared/graph/feedSlot/`（types / deriveSlotLayout / slotLayoutTable / index 桶）。
- 契约内核：`src/shared/validation/compatKernel.ts`（bindableSlots / ContractOperationView / ContractModelView）。
- operation 写者：`src/shared/validation/operationUi.ts`（`setParamsOperation`）。
- 画布：`src/canvas/editor/components/MaterialNode/{index.tsx,ConfigPanel/index.tsx,ConfigPanel/SlotWells/types.ts}`、`hooks/useResourcePicker.ts`、`components/ResourcePickerModal/{ResourcePickerModal.tsx,LocalUploadPane.tsx}`。
- 本地媒体：`src/shared/localMedia.ts`、`src/shared/localFileDraft.ts`。
- 测试：与各模块同目录 `*.test.mjs`（node:test + assert/strict，纯对象 catalog fixture）。

## 4. Code Style（风格）

- TS 模块 `.ts`/`.tsx`，具名导出；内核函数纯函数无副作用；测试为 `*.test.mjs`，fixture 手写 `{models:[{id,operations:[...listed:true...]}]}`。
- 不新增 UI 元素、不新增文案/i18n key、不改 `plugins/omnimux/src/workflow/picker.ts`、不动 CanvasResourcePane 过滤逻辑。

## 5. Testing Strategy（测试策略）

- `deriveModelSlotLayout`：(a) `gpt-image-2.5` 在 `text_to_image` 下借 `multi_reference` 出 strip + `displayOnlyFromOperation`；(b) 当前 op 自带槽位不借用；(c) 无任何素材 op → `none`。
- `materialTypeFromFilename('a.txt') === 'text'`。
- LocalUploadPane `acceptedTypes` 拦截沿用既有 `.test.mjs` 惯例。

## 6. Boundaries（边界）

- 总是：只改本工作树 `plugins/omnimux-workflow` 内文件；提交前跑上述测试命令。
- 绝不做：不提交（lead 负责 commit）；不加新 UI/文案；不触碰 `plugins/omnimux/src/workflow/picker.ts`（osascript）；不改 CanvasResourcePane 过滤。

## 7. Success Criteria（验收标准）

1. `deriveModelSlotLayout` 新函数落地并经 barrel 导出；`SlotLayout.displayOnlyFromOperation?` 字段存在。
2. ConfigPanel `effectiveSlotLayout` 与模型切换处改用 `deriveModelSlotLayout`；`handlePickSlot` 透传 `displayOnlyFromOperation`。
3. `SlotPickRequest` / `ResourcePickerSlotTarget` 携带 `displayOnlyFromOperation`；`handleOpenResourcePicker` slotTarget 字面量透传。
4. `useResourcePicker.commit` 在 `displayOnlyFromOperation` 存在时把 `params.operation` 切换补丁并入 `plan.nodePatches`（同 nodeId 已存在补丁则合并 data，绝不 duplicate_node_patch）。
5. LocalUploadPane `acceptedTypes` 生效；ResourcePickerModal 传入 `slotTarget?.acceptedTypes`。
6. `materialTypeFromFilename`：`txt`/`md` → `'text'`。
7. 全部 `node --test` 测试通过（绿）。

## Assumptions / Open Questions

- 素材 op 按 catalog `operations` 顺序取第一个 bindableSlots 非空者。
- slot 类型若含 `'document'` 需与已知 MaterialType 取交集并在交付说明中标注。
