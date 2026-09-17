# 创作页卡片「更多操作」菜单对标设计规范规格说明

- 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-page-card-more-menu`
- 分支：`agent/workflow-page-card-more-menu`
- 日期：2026-09-17
- 目标：工作流「项目」页详情中，创作页卡片（ProjectPagesTab）的操作区严格对标《OmniMux UI 设计规范》（`design.md` v2.0）

## 1. 问题陈述

1. **常驻裸露双小图标**：当前创作页卡片右下角常驻展示两个极小图标（编辑与删除），既破坏卡片封面与元信息的整洁美感，也容易造成误触；
2. **缺乏统一的卡片交互范式**：项目卡片（ProjectFolderCard）与已发布应用卡片（AIAppCard）均采用“悬停露出三点图标，点击展开毛玻璃浮层操作菜单”，创作页卡片与前两者割裂；
3. **破坏性操作缺乏危险警示**：删除操作缺乏危险状态区分与毛玻璃菜单规范。

## 2. 规范对标要求

1. **三点更多按钮（IconButton）**：
   - 位于卡片右下角，默认透明或低不透明度，卡片 hover 或获得焦点时平滑露出；
   - 尺寸 `32px × 32px`，圆形（`border-radius: 50%`），具备 `aria-haspopup="menu"` 与 `aria-expanded` 状态；
2. **操作菜单浮层（Popover Menu）**：
   - 采用与 `ProjectFolderCard` 一致的毛玻璃悬浮层样式：
     - `background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-overlay))`；
     - `backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px)`；
     - 10px 外框圆角、4px 内边距、6px 内切圆角、32px 控件高基准；
     - 进场微位移淡入动效 `omnimux-menu-pop`；
   - 菜单项：
     - 首项：`重命名`（IconEditOutline16）；
     - 次项：`删除`（IconTrashOutline16，标记危险项类名与 `data-danger="true"`，警示红高亮显示）；
3. **无障碍与焦点管理**：
   - 支持键盘导航（Esc 回焦、Tab 关闭、上下方向键移动焦点、点击外部关闭）；
   - 保留整卡点击打开创作页的事件阻止（点菜单不触发打开创作页）。

## 3. 验收标准

- **AC-1**：创作页卡片右下角统一为三点更多按钮，卡片悬停时平滑露出。
- **AC-2**：点击三点展开标准毛玻璃菜单，包含「重命名」与标红的「删除」操作。
- **AC-3**：全量单元测试与 E2E 规范测试全绿，UI01~UI10 静态门禁 0 违规。
