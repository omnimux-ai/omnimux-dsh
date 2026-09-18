# Verify · 快捷菜单面板不透明度与输入框宽度两侧对齐验证

- 日期：2026-09-18
- 工作树：`.worktrees/omnimux-pills-popover-2332`
- 规格：`specs/pills-popover-solid-align.spec.md`
- 实机真实浏览器证据：
  - 演示单页：`docs/evidence/pills-popover-solid-align-demo.html`
  - 宽屏实拍证据：`docs/evidence/pills-popover-solid-align-desktop.png`（1280px 视口，输入框与菜单面板宽度 952px，左差 0px / 右差 0px / 宽度差 0px）
  - 中屏实拍证据：`docs/evidence/pills-popover-solid-align-medium.png`（800px 视口，输入框与菜单面板宽度 752px，左差 0px / 右差 0px / 宽度差 0px）
  - 几何测量数据报告：`docs/evidence/pills-popover-solid-align-geometry.json`
- 验证结论：
  1. **完全不透明实底遮罩**：背景色为实色 `rgb(24, 25, 28)`（`#18191c`），无半透明毛玻璃透底，100% 遮挡下层卡片内容，完全达到图 2 效果；
  2. **宽度两侧对齐输入框**：无论在大屏还是中屏，菜单面板左右边界与输入框完全重合对齐（误差 0px）。
