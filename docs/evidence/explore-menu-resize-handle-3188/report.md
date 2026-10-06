# Issue #3188 实机复测报告（Dev App, CDP 9229, port 45120）

## 背景
探索浮层菜单（.omnimux-explore-menu, z=500, x=270..450, y=222..645）盖住外壳分隔线手柄（.dshDesktopResizeHandle, z=50, x=276..284）。

## 复测（注入修复 CSS 后，与提交补丁一致）
- menuOpen: true
- BEFORE: y=300/500 elementFromPoint 顶部 = omnimux-explore-menu-item（手柄被压）
- AFTER: y=40/300/500/800 顶部全部 = dshDesktopResizeHandle，handle z-index 计算值 510
- 拖拽：menu 展开状态下，手柄 mousedown+move+up，sidebar 宽 280→360 生效；再拖回 280。
- 截图：menu-open-after-fix.png（菜单展开，手柄贴其左缘，无视觉遮挡菜单项）

## 结论
分隔线手柄层级压过探索菜单后，被覆盖段恢复可拖；菜单项点击区不受影响（手柄仅 8px 宽）。
