# 视频工具栏「先建下游节点 + 隔离执行」· 浏览器验收尝试与阻断记录

- 任务：`workflow-video-toolbar-isolated`
- 日期：2026-10-21
- 结论：**真实浏览器验收 BLOCKED（环境性阻断，与本次改动无关）**
- 工作树：`.worktrees/workflow-video-toolbar-isolated`
- 分支：`agent/workflow-video-toolbar-isolated`

## 1. 尝试的官方路径

按 AGENTS.md「Browser acceptance」执行 worktree 隔离 Web QA 运行器（动态端口、自清理）：

```sh
node scripts/worktree-app-qa.mjs --journey .workbuddy/qa-journeys/video-toolbar-isolated.mjs
# 实际输出：
# ❌ 应用级 Web 验收未通过 -> TEST_ENV_RUNTIME_EXIT
# REAL_EXIT=1
```

（先按 `pnpm verify:app -- --journey ...` 调用时 pnpm 会把分隔符 `--` 透传进 argv，被 CLI 判为非法参数；改为直接执行同一入口脚本后失败点收敛到运行时启动。）

## 2. 根因（真实 stderr，非推测）

用同一 `startTestEnvironment({root, mode:'ui'})` 启动链路、在 spawn 上透传 stderr 复现：

```
dsh-desktop: failed to start packaged dsh: Error: dsh: plugin tree failed to load:
failed to apply loader entry include (cordis:include): failed to import loader entry omnimux (omnimux):
z.object(...).default(...).volatile is not a function
    at .test-env-*/dsh/profiles/omnimux/node_modules/omnimux/src/config.js:50:52
    at @deepseek-ai/cordis-plugin-loader (OmniMux Dev.app app.asar)
ERROR TEST_ENV_RUNTIME_EXIT
```

版本核对（同一台机器实测）：

| 位置 | `@deepseek-ai/schemastery` | 是否支持 `.volatile()` |
| --- | --- | --- |
| 仓库依赖（`pnpm` 安装，3.18.4） | 3.18.4 | 是（`lib/index.cjs` 命中 9 处 `volatile`） |
| 隔离运行器宿主 `OmniMux Dev.app`（app.asar） | **3.18.2** | **否（0 处 `volatile`）** |
| 本机 `~/.omnimux-dev` 已物化 profile | 3.18.0 / 3.18.2 | 否 |

即：仓库主干的 `omnimux` 已要求新版 schemastery（`.volatile()` 表单字段标记），而隔离运行器实际加载的宿主 App 仍内置 3.18.2；宿主 App 未随仓库依赖升版，导致插件树在启动时即崩溃。

## 3. 基线对照（证明与本次改动无关）

在同一机器的**另一个与本任务无关的既有工作树**（`.worktrees/inspiration-browser-save-issue-3403`，基线 `origin/main`）跑完全相同的启动链路，得到**完全相同的报错**：

```
z.object(...).default(...).volatile is not a function
FAIL TEST_ENV_RUNTIME_EXIT
```

结论：该阻断是机器级宿主 App 版本漂移，不是本任务 diff 引入。修复需要升级/重建隔离运行器宿主 App（Dev 管道产物），超出本任务授权范围。

## 4. 已保留的失败运行记录

- `.workbuddy/evidence/app-qa/7406bc54-98bb-48cf-8c20-29bd3006f1f4/report.json`
  - `pass=false`、`errors=["TEST_ENV_RUNTIME_EXIT"]`、`observations.appEvents=[spawn,exit(1)]`、`browserEvents=[]`
  - 运行器在浏览器创建前即退出；没有任何断言被伪造为通过。
- `docs/evidence/worktree-app-qa-report.json` 为同一次失败运行的兼容摘要（已被 `.gitignore` 忽略，不进入候选改动）。

## 5. 本轮可交付的替代证据（不冒充浏览器验收）

- 规划器纯函数单测：`planVideoDeconstructDownstream.test.mjs` / `planVideoStoryboardDownstream.test.mjs`（32 项）。
- 服务端路由测试：`videoDeconstructRoutes.test.mjs` / `videoStoryboardRoutes.test.mjs`（35 项，含 targetNodeId 复用、非法值 400、占用冲突 400）。
- 端到端契约测试：`plugins/omnimux-workflow/tests/video-toolbar-isolated-nodes.e2e.test.mjs`（源码/纯函数契约，非浏览器证据）。
- 类型检查：canvas + host tsconfig 均 exit 0。
- 包级测试：`pnpm --filter omnimux-workflow test` → 2540/2540 通过。

这些证据证明行为契约，但**不能替代** AGENTS 要求的隔离工作树真实浏览器验收；浏览器验收在本环境保持 BLOCKED，不得在交付汇报中写成已通过。

---

## 6. 解除记录（2026-10-21 16:09）

环境阻断已解除，本文件仅保留为失败现场记录，**最终结论以 `browser-acceptance.md` 为准**：

- 依赖漂移修复：Dev profile 的 `@deepseek-ai/schemastery` 3.18.2 → 3.18.4、`@deepseek-ai/cosmokit` 1.8.3 → 1.8.5，并在 profile `package.json` + `pnpm-lock.yaml` 固化（schemastery `^3.18.4`、cosmokit `^1.8.5`），避免 Dev 重启/物化后回退。见 Issue #3552。
- 运行器缺陷修复：legacy `--journey` 断言白名单不接受 `journey:` 前缀，已由 PR #3558 修复并合入。
- 解除后执行结果：`REAL_EXIT=0`，24/24 断言全绿（12 基础 + 12 journey）；截图与报告见 `browser-acceptance/`。
