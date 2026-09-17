# 项目卡片「更多操作」菜单对标设计规范优化规格说明

- 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-folder-menu-polish`
- 分支：`agent/workflow-folder-menu-polish`
- 日期：2026-09-17
- 目标：工作流「项目」页，项目文件夹卡片右下角「更多操作」菜单严格对标《OmniMux UI 设计规范》（`design.md` v2.0）

## 1. 问题陈述

现有卡片更多菜单在视觉与交互规范上存在多处偏离：
1. **背景色与材质浑浊**：使用 `var(--dsw-alias-bg-overlay)`，在暗色模式下呈现为高不透明度塑料中灰，无毛玻璃（`backdrop-filter`）悬浮质感；
2. **破坏性操作缺乏危险警示**：「解散项目」操作与「重命名」视觉完全同色同质，未体现破坏性操作的危险语义，当获得焦点时呈现粗灰底块；
3. **圆角比例与控件几何失衡**：菜单面板圆角 10px 与子项圆角未对齐内切几何，且缺乏展开进场动效与按压缩放反馈。

## 2. 规范对标要求（单一真源：design.md v2.0）

1. **浮层面板（§3.1 & §5.1）**：
   - 背景优先使用 `var(--dsw-alias-bg-elevated)`，并保留 `var(--dsw-alias-bg-overlay)` 回退；
   - 启用 16px 毛玻璃模糊：`backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);`；
   - 边框：`1px solid var(--dsw-alias-border-l2)`；
   - 圆角：`10px`，内边距：`4px`；
   - 阴影：`0 10px 28px var(--dsw-alias-bg-mask-1), 0 2px 8px var(--dsw-alias-bg-mask-1)`；
   - 进场微动效：淡入与微位移 `animation: omnimux-menu-pop 120ms cubic-bezier(0.16, 1, 0.3, 1)`。
2. **菜单项与危险项（§3.5 & §5.3）**：
   - 基准高度：`32px`，内边距：`0 10px`；
   - 内切圆角：`6px`（满足 `10px - 4px = 6px` 内切几何）；
   - 图标与文字间距：`gap: 8px`，图标尺寸 `16px`；
   - 常规项颜色：`var(--dsw-alias-label-primary)`，悬停背景 `var(--dsw-alias-interactive-bg-hover)`；
   - 破坏性危险项（解散项目）：
     - 携带 `data-danger="true"` 属性与 `omnimux-folder-menu-item--danger` 类名；
     - 文字与图标采用 `var(--dsw-alias-state-error-primary)`；
     - 悬停态采用 `color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)` 柔和微光衬底；
3. **无障碍与可达性**：
   - 保留 `role="menu"` 与 `role="menuitem"` 语义；
   - 保留初始焦点、上下方向键、Home/End 循环焦点移动、Esc 回焦、Tab 关闭、点击外部关闭等完整交互路径。

## 3. 验收标准

- **AC-1**：面板具备 elevated 语义背景与 16px 毛玻璃，圆角 10px，内边距 4px，阴影双层。
- **AC-2**：子项高度 32px，内切圆角 6px，左右内边距 10px，间距 8px。
- **AC-3**：解散项目渲染为危险警示红，悬停浅红微光，与重命名形成清晰区分。
- **AC-4**：通过既有单元测试与新增对齐测试，UI 门禁扫描 0 违规。
