# 素材卡槽悬浮预览：按钮布局与预览外观修复

## 背景与问题

创作画布里把上游视频接到「参考视频」槽位后，悬停卡槽弹出的预览卡出现三类破绽：

1. **按钮竖排堆叠**：「替换」「停用」是预览卡 `flex-direction: column` 容器里的两个直接子元素，
   于是各占一行、上下堆叠，卡片被撑高，按钮视觉上脱出预览内容区。
2. **媒体撑破卡片**：视频/图片是同一列里的直接子元素，只有内联 `max-height`。
   竖屏素材按 `width: 100%` 展开后高度接近甚至超过卡片限高，按钮被挤出卡片可视区
   （`overflow: auto` 下需滚动才可见），表现为「按钮悬空在卡外」。
3. **令牌作用域失效**：预览卡 `createPortal` 到 `document.body`，但
   `--dsw-alias-bg-elevated` / `--dsw-alias-border-l2` / `--dsw-alias-label-primary` /
   `--dsw-alias-bg-layer-2` 只在 `.wf-canvas-root` 上定义。宿主未在 `body` 上提供这些令牌时
   （独立画布 harness 等），卡片背景与边框退化为透明，按钮像直接贴在画布上。

## 用户关键操作旅程

1. 画布上把视频节点连到下游节点的「参考视频」槽位。
2. 悬停该卡槽 → 弹出预览卡，能看到视频 + 一行操作按钮。
3. 卡片有可见背景与边框，媒体在卡内缩放，按钮始终留在卡内且左右并排。
4. 点击「替换」或「停用」正常生效；Esc / 移出关闭。

## 可测验收标准

- A1 预览卡内媒体与操作区分属两个子节点：`.wf-slot-hover-preview__media` 与
  `.wf-slot-hover-preview__actions`。
- A2 操作区为横向单行：两个按钮同一 `top` 值（容差 ≤ 2px）。
- A3 操作区不收缩（`flex: 0 0 auto`），媒体区可收缩（`flex: 0 1 auto; min-height: 0`），
  因此媒体先让位、按钮始终在卡片内。
- A4 预览卡背景与边框不再依赖宿主令牌：缺失 `--dsw-alias-*` 时回落到 `--wb-*`，
  不得为 `rgba(0, 0, 0, 0)` / 无边框。
- A5 竖屏视频场景下按钮 `bottom <= 卡片 bottom`，且按钮 `top >= 卡片 top`。
- A6 既有交互不变：点击按钮触发 `onReplace` / `onSetUse` 后关闭；Tab 仍能从卡槽进入操作按钮。

## 非目标

- 不改动卡槽本体（`.wf-slot-well`）尺寸与 44px 规格。
- 不改动预览触发/关闭时机与焦点回还逻辑。
- 不改动媒体节点的卡片渲染（`MaterialNode`）。

## 新用户基线

品牌新装用户不依赖任何本机开发态：预览卡在宿主令牌齐全时使用宿主令牌，缺失时用画布
`--wb-*` 兜底，两态都有可见背景与边框。

## 影响面

- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotHoverPreview.tsx`
- `plugins/omnimux-workflow/src/canvas/theme/components.css`
