# 浏览器验收报告 · Issue #2453 图像生成输入框去分割线与宽度自适应

- 工作树：`.worktrees/omnimux-media-viewer-composer-fit-issue-2453`
- Base：`origin/main` 02aaf3acd ｜ Head：31319e580
- 验收时间：2026-09-20 14:32（Asia/Shanghai）
- 方式：ego-browser 真实浏览器内核，加载工作树内真实 `MEDIA_VIEWER_CSS`（`plugins/omnimux/src/client/media-viewer/styles.js` 导出），DOM 结构与 `MediaViewerComposer.jsx` 渲染输出一致；ego TaskSpace #237（已释放）
- 截图证据：`tmp/media-viewer-composer-qa/composer-fit.png`（真实可解码 PNG，1280×916）

## 断言结果（全部通过）

| 场景 | 面板宽 | 输入框宽 | 左右留白 | 底部间距 | 分割线上边框 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 侧边栏比例 | 520px | 496px | 各约 12–13px | 约 12–13px | `0px / none` | ✅ 留白收窄、自适应、无分割线 |
| 宽画布 | 1200px | 860px | 居中（各 171px） | 约 12–13px | `0px / none` | ✅ max-width 860 居中行为不变 |

- 修改前对照（源码）：`width: calc(100% - 64px)`（左右各 32px）、`bottom: 20px`、`.omx-mv-toolbar-bar` 含 `border-top: 1px solid` + `padding-top: 10px`。
- 两个场景输入框均正几何可见（width/height > 0）。

## 范围说明

- 本验收针对纯 CSS 几何变更的目标渲染面；`pnpm verify:app` 完整应用验收因 origin/main 既有问题（`omnimux-social-harvest` 插件在测试环境加载失败：`cannot get property "webServer" without inject`，致 omniumx profile 运行时退出 TEST_ENV_RUNTIME_EXIT）未能执行，该问题与本次改动无关（基线复现同样失败），按既有 P0 上报、不在本任务扩 scope 修复。
- `pnpm verify:stages` 的 2 处违规（omnimux-social-harvest 缺 injectStyles、omnimux-accounts 侧栏契约）同为基线既有，已在 stash 对照中确认与本次改动无关。
- 相关自动化：`scripts/guard-ui-design.test.mjs` 全绿；media-viewer 相关测试 7/7 通过；`generation-feedback.e2e.test.js` 在基线同样失败（真实浏览器传输链路用例，环境依赖，与本次改动无关）。
