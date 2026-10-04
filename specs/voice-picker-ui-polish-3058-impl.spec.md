# Voice Picker UI Polish 实施规格（#3058）

> 本文件是本任务的质量门禁规格；**产品唯一真源**为已获 PM 批准的
> `docs/product/voice-picker-ui-polish-3058.md`（PM_PREFLIGHT: APPROVED）。
> 两者冲突时以产品附录为准。

## 1. Objective

用户对真实截图提出「这 UI 也得优化下吧」：单条结果时弹窗留大片空洞、底栏当前音色低可读、
试听与选中反馈混同、搜索/筛选位置随结果数跳动。目标是在 **VoicePickerDialog 局部**
按附录 §3.1 尺寸锁定表调整几何与层级，**零文案新增、零业务逻辑改动**。

成功标准（对应附录 §4 量化指标）：
- `width` 改为 `min(480px, calc(100vw - 48px))`；max-height 70vh；
- overlay 仅本弹窗 `:has(> .wf-voice-picker-modal)` 顶部锚定 `15vh`，同次打开搜索框位移 ≤1px；
- 列表 `min-height:0`、`max-height:320px`、按内容收缩、仅结果区滚动（移除 160px 底槽）；
- 搜索 32px/8px 圆角；四筛选 32px trigger、窄态 min-width 88px 横向滚动不折行；
- 行 min-height 48px、padding 6px 10px，名称/场景可自然换行不尾截；
- 试听按钮 32×32/8px 圆角，仅 verified 行渲染，播放反馈只属于按钮（不改选中、不给行底色）；
- 底栏当前名称 13px/500 主信息可换行，`当前音色` 标签 12px 次级；
- 空态 padding 24px 0、清除筛选按钮 32px/8px；字典变更 0，白名单逐字一致率 100%。

## 2. Commands

- 定向测试：`node --test src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerUiPolish3058.test.mjs src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerDialog.test.mjs`（plugins/omnimux-workflow 下）
- 类型检查：`pnpm --filter omnimux-workflow typecheck`
- 构建：`pnpm --filter omnimux-workflow build`

## 3. Structure / 变更边界（≤5 文件）

- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx`（width 值、预览图标尺寸等局部 TSX）
- `plugins/omnimux-workflow/src/canvas/theme/components.css`（`wf-voice-picker-*` 块局部几何）
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerUiPolish3058.test.mjs`（新契约测试）
- `specs/voice-picker-ui-polish-3058-impl.spec.md`（本文件）
- `.agent-reports/shared-official-voice-preview/ui-polish-implementation.md`（实施报告）

不改：voicePickerModel.ts、CustomModal/CustomSelect 公共组件、runner、业务状态、门禁、design.md、文案字典。

## 4. Code Style

沿用现有源码契约：`--dsw-alias-*` token 链、零裸 hex/rgba、零 `--omx-*`；
overlay 限定用 `.wf-modal-overlay:has(> .wf-voice-picker-modal)`，不改全局 modal 语义；
测试沿用 `readFileSync + node:test` 源码契约风格（同 voicePickerDialog.test.mjs）。

## 5. Testing Strategy

TDD：先新增 `voicePickerUiPolish3058.test.mjs` 契约测试 → 实际跑红 → 最小改动转绿。
断言：480px 宽公式、overlay :has 顶部锚定 15vh、列表 max-height 320px 且无 160px
min-height、搜索/filters/按钮 32px、行 padding 6px 10px、名称无单行尾截、
空态 padding 24px、底栏名称层级（13px/500 可换行）、既有试听/选择强断言保留不删。

## 6. Boundaries

- 总是：改动后跑定向测试 + typecheck；保留既有强断言不删不跳过；
- 先问：需要改 voicePickerModel / CustomModal / runner / 播放状态才能达成的需求 → 上报主理人；
- 绝不做：新增文案/badge/icon/hero、改全局 modal、绕 runner policy deny、Git 提交/合入/重启/物化。

## 7. Assumptions

1. 真实浏览器验收本轮被 runner 阻断，不声称 UI 验收 PASS，只留类型检查 + 构建 + 契约测试证据；
2. `wf-modal-overlay` 的 `:has()` 在目标 Chromium/Electron 可用（仓内 8714 行已有同款先例）；
3. CustomModal 内建 header/footer 结构不变，仅本弹窗 className 限定覆盖。

## 8. 复审整改追加（review-20261004 · CSS medium + 测试断言勘误）

**用户操作旅程**：音色列表超长时，长名称行自然换行增高；高度封顶的 flex column
列表（`max-height:320px`）里行默认 `flex-shrink:1`，会被压回约 48px 而文字保持原
高度，与相邻行重叠（窄视口长名尤其明显）。期望反馈：行高按内容自然增高，
只有列表本体滚动。

**整改项（本票最小范围）**：
1. `.wf-voice-picker__row` 增加 `flex-shrink: 0`（review-20261004 medium 建议，
   row shrink-0 已属批准的自然高度验收范围）。契约断言并入既有
   `voicePickerUiPolish3058.test.mjs` 行块测试，先红后绿。
2. `VideoParamPopover.test.mjs` 断言勘误：`/\.wf-video-aspect-grid \{[\s\S]*?repeat\(4,\s*1fr\)/`
   惰性匹配跨块 ~260 行，历史上靠无关 `.wf-voice-picker__filters` 的
   `repeat(4, 1fr)` 假阳性通过；voice 筛选改 `minmax(88px,1fr)` 后假阳性消失转红。
   视频 CSS（`.wf-video-aspect-grid` = flex 单行自适应平铺）两处检出逐字一致、
   零改动。按「最小收窄既有强断言」：改用 `extractRuleBlock` 精确规则块断言
   flex 单行平铺契约（`display:flex` + `flex-direction:row` + 卡片 `flex:1 1 0`
   + `min-width:0`），不删断言、不动视频业务布局。

**验收命令**：`node --test` 定向两文件 → 全量 `pnpm --filter omnimux-workflow test`
→ `typecheck`。零新增文案/元素，不改 runner/门禁/Git。

## 9. 验收整改追加（acceptance-20261004 · FE-01/FE-02/FE-03）

**用户操作旅程**：画布节点打开音色弹窗 → 弹窗应水平居中、顶部锚定 15vh，
搜索框在全部/单条/空态间位移 ≤1 CSS px；筛选菜单打开时 Escape 先关菜单再关弹窗；
任一关闭路径（Escape / X / 行选择）焦点回到真实 `wf-voice-trigger`，宿主节点不被
顺带失选；390×844 窄态筛选菜单完整落在视口内。

**实测失败（acceptance-20261004）**：
1. FE-01：overlay 类同时挂 `.wf-canvas-root`（`display:flex;flex-direction:column;
   height:100%`），`align-items:flex-start` 落在横轴、`justify-content:center` 落在
   纵轴；`box-sizing:content-box` 使 15vh padding 超视口，全部→单条 y 漂移 136px、
   全部→空态 105px，桌面左缘固定 24px 不居中。
2. FE-02：Escape 同时命中画布 `useKeyboardShortcuts` 清选中 → ConfigPanel 卸载
   trigger → 焦点落 body。需：弹窗内 Escape 只关闭本弹窗并隔离原生事件；筛选菜单
   打开时 Escape 先只关菜单；关闭后焦点恢复 trigger（微任务等提交后 focus）。
3. FE-03：CustomSelect portal 菜单 `left` 用 trigger.rect.left，`minWidth ≥140/180`
   在 390 视口越出右边界；菜单 `Escape` 未隔离传播，连带弹窗关闭。最小通用定位
   clamp（`left` 钳进 [8px, vw-8-菜单宽] + `maxWidth`），不改 API 与视觉。

**整改项（本票最小范围，≤5 源/测试文件）**：
- `components.css`：`.wf-modal-overlay:has(> .wf-voice-picker-modal)` 加
  `flex-direction:row` + `box-sizing:border-box` + `height:100%`，保持 inset:0。
- `CustomModal.tsx`：Escape 监听改 capture 阶段；菜单（`.wf-custom-select-dropdown`
  存在于文档且非本弹窗自有）打开时让位；否则 `stopPropagation()` + `onCancel()`，
  隔离画布全局 Escape，窗口冒泡监听移除（overlay onKeyDown 覆盖框内焦点）。
- `CustomSelect.tsx`：`left` 钳进视口（8px 边距）+ inline `maxWidth`；菜单 Escape
  改 capture + `stopPropagation()`（菜单先关、不连带关宿主弹窗，非弹窗场景同样
  不再外溢到其他监听）。
- `ConfigPanel/index.tsx`：trigger 加 `voiceTriggerRef`；`closeVoicePicker` 统一
  关闭路径并在微任务 `focus()`（Element.focus 对未连接节点是 no-op）。
- `voicePickerUiPolish3058.test.mjs`：新增 FE-01/02/03 契约断言，先红后绿。

**验收**：`node --test` voicePickerUiPolish3058 + voicePickerDialog 全绿；
`pnpm --filter omnimux-workflow typecheck`、`build` 绿；真实浏览器坐标/焦点回归
由 QA 在 space2/p1 复验（本票不做浏览器）。
