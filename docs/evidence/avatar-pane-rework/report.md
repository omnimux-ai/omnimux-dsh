# 数字人一级页重构 · 真机验收证据

真实浏览器验收（隔离工作树 Web 运行器，随机端口，自带清理），旅程脚本 `scripts/qa/avatar-stage-acceptance.mjs`。

- 断言总数：57，失败：0
- 运行命令：`node scripts/worktree-app-qa.mjs --journey=scripts/qa/avatar-stage-acceptance.mjs`

## 关键断言

- `two-pane-scroll-containers`：PASS — 正几何内部滚动区 2 个（左右各一）
- `model-config-collapsed-to-one-button`：PASS — 点开前浮层内选择器 0 个
- `model-menu-surface-is-opaque`：PASS — 模型菜单底色不透明度 1
- `model-menu-opens-with-three-fields`：PASS — 浮层字段=[品牌,模型,渠道]
- `model-menu-selection-lands-on-trigger`：PASS — 选项「默认渠道」→ 按钮「GPT Image 2.5」
- `rename-by-double-click-then-blur`：PASS — 失焦后名称「验收改名3192」，仍在编辑态=false
- `rename-persisted-in-plugin-ledger`：PASS — HTTP 200，账本含「验收改名3192」=true
- `at-least-one-pane-actually-scrolls`：PASS — 内容超出可滚的区 1 个
- `page-root-does-not-scroll`：PASS — 页根自身可滚=false
- `generate-cta-stays-in-viewport`：PASS — 生成栏在视口内=true

## 截图

- `01-avatar-stage.png`
- `02-avatar-explore.png`
- `03-avatar-preset-dialog.png`
- `04-avatar-history.png`
- `05-avatar-two-pane.png`
- `05-avatar-j3-asset-library.png`
