# Issue #3460 · X 推文海报生成与发帖页预填：浏览器验收证据

- 运行日期：2026-10-20 23:35（Asia/Taipei）
- 运行方式：Chromium 154（`ego lite` 二进制）以 `--load-extension` 加载本工作树构建产物 `plugins/omnimux-browser/extension/dist`，通过 CDP 驱动；本机 HTTPS fixture 以 `--host-resolver-rules=MAP x.com 127.0.0.1:<port>` 映射为 `https://x.com`，`--no-proxy-server` 避免系统代理截获。
- 源码身份：worktree `browser-x-poster-issue-3460`，base `origin/main`；测试运行前重新执行 `node scripts/build.mjs`。
- 展开：`report.json` 为同一运行的机读结果；截图为 `01`–`06`。

## 验收项

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 推文互动栏下方挂载「生成海报」 | PASS | `01-trigger.png` |
| 点击后弹出主题确认（两种主题） | PASS（themeCount=2） | `02-modal.png` |
| 选择黑底后状态正确 | PASS（aria-checked） | `03-modal-dark.png` |
| 确认后跳转 `x.com/compose/post` | PASS | `report.json: navigated` |
| 发帖页找到 composer 并自动附图 | PASS（`omnimux-poster.png`，116 KB） | `04-compose.png` |
| 海报预览渲染 | PASS | `04-compose.png` |
| 预填个人观点（seeded payload 分支） | PASS（文本＝`我的个人观点`） | `05-prefill.png` |
| 完成后清理模态与载荷 | PASS | `report.json: cleanup` |
| 完整海报（黑底） | PASS（1280×778 PNG） | `06-poster.png` |

## 边界与限制（如实声明）

1. **真实 x.com 未验证**：本证据使用 x.com 结构 fixture + 域名映射；X 真实 DOM 改版风险仍按 [plugin-qa](../../../docs/contracts/plugin-qa.md) 由人工 Dev 真机验收覆盖。
2. **模型在线路径未验证**：隔离环境没有连接 OmniMux Host，第一段流程中「生成观点」按设计降级为空；预填分支用 seed 载荷验证（`05-prefill.png`），真实模型生成需在 Dev 人工复核。
3. **本证据不证明** X 侧真实图片上传成功（fixture 只验证 file input 收到 `File` 并触发 change）；真实上传由 Dev 人工验收。
4. 夹具头像 URL（`pbs.twimg.com`）在无代理环境不可达，海报使用首字母占位；真实账号会加载头像。

## 复现入口

- 驱动脚本未入库（临时脚本位于 `/tmp/poster-evidence/run.mjs`）；夹具与映射参数见上。
- 扩展构建：`cd plugins/omnimux-browser/extension && node scripts/build.mjs`
- 单元测试：`pnpm exec vitest run tests/twitter-poster`（4 files / 29 tests）
