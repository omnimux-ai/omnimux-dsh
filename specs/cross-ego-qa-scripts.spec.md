# spec — 自包含浏览器验收脚本改走 ego TaskSpace（第一批）

- Issue: #3519
- 风险: R1（触及 `scripts/`）
- 状态: 实现中

## 目标

把 3 个自包含的浏览器验收脚本从「每次 spawn 一个 Chrome + 临时 profile」改为「一个 ego lite TaskSpace + 单 Page」。
用户在本地跑验收时 Dock 不再反复闪 Chrome 图标，失败时也不再遗留孤儿 Chrome 与 `/tmp` profile。

范围（第一批，3 个）：

- `scripts/capture-media-preview-evidence.mjs`
- `scripts/generate-batch-wrap-fix-evidence.mjs`
- `scripts/generate-batch-digits-opmode-evidence.mjs`
- 新增 `scripts/lib/ego-browser-steps.mjs`（共享步骤驱动）

暂缓：`scripts/verify-media-hover-toolbar.mjs`（ego 下页面出现重复 overlay host、组件 element 的 `getBoundingClientRect()` 恒为 0，真实 hover 坐标不可复现；按证伪条款回滚，另开任务处理）。

不在范围：`tests/e2e/`、`worktree-web-qa.mjs`、`worktree-app-qa.mjs`、依赖 Dev App 9229 或登录态/`test-env-bootstrap` 的脚本。

## 成功标准

1. 3 个脚本 `node --check` 通过，且在任务 worktree 内实际执行成功（exit 0）。
2. 执行期间脚本进程树内 Chrome / Chrome for Testing 子进程数为 0。
3. 截图输出路径不变；像素尺寸与改前一致（2x 脚本保持 2x）。
4. 断言语义不变：同一份页面、同一组选择器与数值阈值。

## 命令

```bash
cd .worktrees/cross-ego-qa-scripts
node --check scripts/lib/ego-browser-steps.mjs
node --check scripts/capture-media-preview-evidence.mjs
node --check scripts/generate-batch-wrap-fix-evidence.mjs
node --check scripts/generate-batch-digits-opmode-evidence.mjs
node scripts/capture-media-preview-evidence.mjs
node scripts/generate-batch-wrap-fix-evidence.mjs
node scripts/generate-batch-digits-opmode-evidence.mjs
```

前置：`plugins/omnimux-browser/extension/dist/content.js` 需先构建（`node plugins/omnimux-browser/extension/scripts/build.mjs`）；ego lite 需已安装（`~/.local/bin/ego-browser`）。

## 结构

- `scripts/lib/ego-browser-steps.mjs` — 步骤驱动：`goto` / `wait` / `evaluate` / `hover` / `click` / `screenshot`，截图走 `Page.captureScreenshot` 以保留 `deviceScaleFactor`。
- 各脚本保留原有静态资源、断言与输出文件路径，只替换浏览器驱动层。

## 代码风格

```js
const run = await runEgoSteps({
  spaceName: `task-name-${Date.now()}`,
  width: 1200,
  height: 850,
  deviceScaleFactor: 2,
  steps: [
    { type: 'goto', url: `file://${DEMO_HTML}`, settleMs: 800 },
    { type: 'screenshot', path: SHOT },
  ],
})
```

## 测试策略

这些脚本本身即验收工具，不新增单测；以实际执行 + 截图尺寸/内容对比 + Chrome 子进程计数作为证据。

## 边界

- 总是：保持 CLI 入口、输出路径、断言语义不变；ego 缺失时显式失败。
- 先问：扩展范围到登录态/Dev App 脚本；修改 `tests/e2e/`。
- 绝不：静默回退到 Chrome；提交 `dist/` 构建产物。

## 假设

ego lite 0.6.0.16（Chromium 154）在 `file://` 与本地 http 页面上的布局与 Chrome 155 一致；CSS 过渡可由注入零时长样式归位到终态。

## 证伪方式

若任一脚本执行失败、截图尺寸变化、或断言在 ego 下不成立，则该脚本回滚为 Chrome 实现并在 PR 中记录差异原因；若 Chrome 子进程计数不为 0，则本方案不成立。
