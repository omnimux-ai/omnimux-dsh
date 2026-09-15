# 证据：视频内容拆解与分镜表移除静默保底回退（Issue #1826 / PR #1833）

## 变更范围

`plugins/omnimux-workflow`：`videoDeconstruct/service.ts`、`videoStoryboard/service.ts`、两者 `errors.ts`、
新增 `workflow/videoAnalyzeFailure.ts`、`workflow/index.ts`（移除 `PLACEHOLDER_FRAME_BASE64` 导出）、
两个路由测试套件、规格 `specs/video-deconstruct-fail-loud.spec.md`。

## 验证结果（本工作树，基线 `origin/main` = 60a01dbc7）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 失败路径 + 成功路径路由套件 | `node --test .../routes/videoDeconstructRoutes.test.mjs .../routes/videoStoryboardRoutes.test.mjs .../videoAnalyzeFailure.test.mjs` | 22/22 通过 |
| 宿主侧类型检查 | `tsc -p plugins/omnimux-workflow/tsconfig.host.json --noEmit` | 通过（exit 0） |
| 插件全量套件 | `pnpm --filter omnimux-workflow test` | 仅 2 条既有失败：`generationPolicy.test.mjs`、`generationPolicy.hub.test.mjs` 的 ASR seam，已在同一提交的主检出复现，与本 diff 无关 |
| L0 diff-aware 静态质检 | `node scripts/auto-qa-gate.mjs . --diff --base origin/main` | 仅 1 条既有阻断：`tsconfig.canvas.json` 的 `channelGroups.ts(715,38)` 类型错误（主检出同样复现；CI 未安装插件级 typescript，该检查在 CI 不执行）。SECURITY / TOKENS / GUARDS / LIFECYCLE 全通过 |
| 应用级 Web 验收 | `pnpm verify:app` | 通过（7 项断言，动态端口，runId `1955d9a1-c717-4f74-a7e1-c0cfeda9ad77`） |

应用级 Web 验收截图：`.workbuddy/evidence/app-qa/1955d9a1-c717-4f74-a7e1-c0cfeda9ad77/app-home.png`（1280×713）。

## 覆盖的失败路径（新增断言）

- `video_analyze` 未注册 → 502 `analyze-unavailable`，磁盘无 `.htable`、画布无新增表格节点与连线。
- 调用抛错 → 502 `analyze-failed`；上游带 `video-understand-unsupported` → 502 `analyze-unsupported` 且中文原因含「不支持视频输入」，上游原文不外发。
- 返回空文本 / 解析不出维度或镜头 → 502 `analyze-empty`（拆解）/ `shots-empty`（分镜）。
- 抽帧全部失败 → 「分镜画面」单元格为空数组，帧目录无任何伪造文件。

## 根因调查产物

`.agent-reports/video-deconstruct-fallback/A-video-analyze-runtime.md`、`B-console-errors-origin.md`（本机路径，不随仓库分发）。

- 失败点在 `video_analyze` 内部的 `textComplete.execute({video,…})` 调用，旧代码 catch 后静默降级。
- 运行时证据：宿主下发给模型的工具清单含 `video_analyze`；保底分支确实执行过（Dev 工作区 `ws_7235087a667d/tables/tbl_8a6c6543.htable` 含保底模板逐字文案）。
- 浏览器控制台的 KaTeX 告警与 SVG path 报错为渲染侧噪声，与本失败无因果。
