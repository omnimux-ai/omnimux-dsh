# Verify · 快捷菜单面板紧贴依附输入框下方与两端对齐验证

- 日期：2026-09-18
- 工作树：`.worktrees/omnimux-pills-popover-2332`
- 规格：`specs/pills-popover-solid-align.spec.md`
- 实机真实浏览器证据：
  - 演示单页：`docs/evidence/pills-popover-solid-align-demo.html`
  - 宽屏实拍证据：`docs/evidence/pills-popover-solid-align-desktop.png`（1280px 视口，输入框与菜单面板宽度 952px，间距 8px 紧贴依附，左差 0px / 右差 0px / 宽度差 0px）
  - 中屏实拍证据：`docs/evidence/pills-popover-solid-align-medium.png`（800px 视口，输入框与菜单面板宽度 752px，间距 8px 紧贴依附，左差 0px / 右差 0px / 宽度差 0px）
  - 几何测量数据报告：`docs/evidence/pills-popover-solid-align-geometry.json`
- 验证结论：
  1. **点击按钮后切换列表面板**：点击胶囊按钮后，胶囊按钮平滑让位，直接切换为列表面板，面板顶部右上角带有极简关闭按钮 `✕`，点击外部或关闭按钮即可自如切回胶囊按钮；
  2. **紧贴依附于输入框下方**：面板顶部紧贴输入框底边（实测间距仅 8.00px），输入框与面板之间无多余按钮悬空阻隔，达到图 2 纯净对标效果；
  3. **完全不透明实底遮罩**：背景色为实色 `rgb(24, 25, 28)`（`#18191c`），无半透明透底，100% 遮挡下层卡片内容；
  4. **宽度两侧对齐输入框**：大屏（952px）与中屏（752px）下，菜单面板左右边界与输入框完全重合对齐（误差 0px）。
