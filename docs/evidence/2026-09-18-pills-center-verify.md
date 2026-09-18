# Verify · 输入框下快捷按钮居中

- 日期：2026-09-18
- 工作树：`.worktrees/omnimux-pills-center`
- 规格：`specs/pills-center.spec.md`
- 实机/浏览器证据：
  - `docs/evidence/pills-center-demo.html`（同款样式演示页）
  - `docs/evidence/pills-center-demo-desktop.png`（1280 中心差 0px）
  - `docs/evidence/pills-center-demo-narrow.png`（420 中心差 0px）
  - `docs/evidence/pills-center-geometry.json`
- 结论：justifyContent:center 后按钮组相对输入框水平居中；窄屏折行仍居中无横向溢出。
