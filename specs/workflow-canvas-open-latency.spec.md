# 规格：创作页打开链路提速与加载反馈

Issue: 待建 · 模块: omnimux-workflow · 风险等级: R2

## 一、问题

点击项目库里的「创作页」卡片后，界面在数秒内没有任何变化，用户感知为「点了没反应 / 要等一会儿」。
实测链路存在四段可消除的损耗：

1. `activateProjectCanvas` 串行等待三件事（右侧栏服务、画布 tab 注册、会话切到前台），每段最长 4s，
   三段全部通过后才 `openTab`——tab 出现之前界面上没有任何可见变化。
2. 点击卡片没有即时反馈（卡片无 busy 态、可重复点击）。
3. 画布岛脚本 `canvas.js` 2.6MB 原文直出：无 gzip/br，响应头 `Cache-Control: no-cache` 且无 ETag，
   每次刷新都会全量重下；带 `?v=<hash>` 的 URL 本可 immutable 缓存。
4. 岛内启动串行：`loadGenerationPreferences()` → `getWorkspace()` → `probeLocalFiles()` 逐个 await
   才进入 ready；前两个互不依赖，本地文件探测只是补丁，不应阻塞首屏。

## 二、范围

只改 `plugins/omnimux-workflow`。

| # | 改动 | 位置 |
|---|---|---|
| 1 | 加载态视觉：画布中央单一动效（细弧）+ 一行说明；去掉纯文字「正在加载创作画布…」 | `src/client/CanvasBridge.jsx`、`src/client/projects/CanvasTab.jsx`、`src/client/styles.js`、`src/canvas/App.tsx`、`src/canvas/theme/workbench-theme.css` |
| 2 | 点击即时反馈：卡片「打开中」遮罩 + 阻止重复触发 | `src/client/projects/ProjectPagesTab.jsx`、`src/client/projects/ProjectLibraryPage.jsx` |
| 3 | 先开 tab 再对齐会话：`openTab` 不再被三次等待阻塞；等待改为异步对齐，超时不降级到别的会话 | `src/client/projects/projectCanvas.js` |
| 4 | 静态资源：canvas.js 支持 gzip/br；`?v=<hash>` 请求返回 `immutable` 长缓存 + ETag，命中条件请求返回 304 | `src/workflow/routes/serveFile.ts`、`src/workflow/routes/staticRoutes.ts`、`src/workflow/routes/canvasRoutes.ts` |
| 5 | 岛内启动并行：偏好与工作区快照并行；本地文件探测移到 ready 之后 | `src/canvas/hooks/useCanvasBoot.ts` |

## 三、验收标准

- AC-1 点击创作页卡片后，同一帧内出现「打开中」反馈与画布加载动效，不需要等待任何网络往返。
- AC-2 加载动效为单一动效 + 一行说明文字，不使用双环、光晕、分步指示；文案不含装饰性副标题。
- AC-3 打开期间重复点击卡片不会触发第二次打开。
- AC-4 `activateProjectCanvas` 在 `openTab` 之前不再有合计超过 200ms 的串行等待；会话对齐失败时不得把 tab 落到其他会话。
- AC-5 `GET /omnimux-workflow/canvas.js?v=<hash>` 返回 `Cache-Control: public, max-age=31536000, immutable` 与 ETag；带 `If-None-Match` 命中时返回 304 且无 body。
- AC-6 支持 gzip/br 时，`canvas.js` 响应带 `Content-Encoding`，传输体积显著小于 2.6MB。
- AC-7 岛内 `loadGenerationPreferences` 与 `getWorkspace` 并行发起；本地文件探测不阻塞 `boot.phase === 'ready'`。
- AC-8 既有行为不回归：`omnimux-workflow` 包测试全绿；打开链路相关的既有契约测试（canvasTabRouting / projectCanvas / workspace-canvas-sync）不变更断言语义。

## 四、验证

1. `pnpm --filter omnimux-workflow test`
2. `pnpm --filter omnimux-workflow typecheck`
3. 浏览器证据：worktree 内 L2 页面点击创作页，留存加载态截图与打开耗时。
4. 静态资源：curl 校验响应头与 304。

## 五、不做

- 不改动会话服务与右侧栏宿主（`dsh-better-sidebar`）。
- 不拆分 canvas 岛 bundle（后续单独任务）。
- 不改动任何计费、模型路由或数据契约。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/hooks/useCanvasBoot.test.mjs` :: `源码契约：useCanvasBoot cleanup 里 beforeReset 在 resetStore() 之前`

原断言：hydrate 后必须先 `await probeAndPatchImportedMedia()`、probe 完成前不得 `setBoot({ phase: 'ready' })`（即 `readyIdx > probeIdx`），且断言源码存在 `await probeAndPatchImportedMedia()`。

必须改的理由：本任务第 5 项与 AC-7 要求本地文件探测不阻塞 `boot.phase === 'ready'`，旧断言恰好锁死了被移除的「probe 先于 ready」串行行为，与新验收标准互斥。

新期望证据：probe 顺序断言迁移到新增用例「源码契约：useCanvasBoot 并行加载偏好与工作区，probe 不阻塞 ready」——断言 `await Promise.all([loadGenerationPreferences(), getWorkspace(targetWorkspaceId)])` 并行、`probeAndPatchImportedMedia()` 只能在 `setBoot({ phase: 'ready' })` 之后调用且不得 `await`；原用例仅保留 cleanup 中 beforeReset 先于 resetStore 的断言。

- `plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs` :: `源码契约：无 targetWorkspaceId 不渲染 CanvasBridge`

原断言：`assert.match(src, /t\('canvas\.loading'\)/)` 直接锁定 CanvasTab 里出现 `t('canvas.loading')` 纯文字调用点。

必须改的理由：本任务第 1 项把无目标工作区的纯文字加载态替换为共享 `CanvasLoadingState` 组件（AC-2），加载文案改由组件内部读取 `t('canvas.loading')`，CanvasTab 内不再出现该字面调用；旧断言锁定的是被移除的实现细节。

新期望证据：同一用例改为断言 `CanvasTab` 使用 `<CanvasLoadingState t={t} />`（并保留 `targetWorkspaceId ?` 守卫与 `<CanvasBridge` 顺序断言）；加载态视觉本身由新增 `src/client/canvasLoadingState.test.mjs` 覆盖。

## 假设

- 用户感知的「点了没反应」主要来自加载态不可见；把纯文字换成单一细弧 + 一行说明，就能让首帧有可见反馈，而不必先等画布数据变快。
- 岛内 `loadGenerationPreferences()` 与 `getWorkspace()` 互不依赖，可以并行；`probeLocalFiles()` 只是本地媒体路径补丁，应在 `ready` 之后异步补齐，不阻塞首屏。
- DSH 官方 `--dsw-alias-*` token 在宿主与岛内均可用；缺失时退回设计确认的 fallback，不破坏浅色/深色主题。
- canvas.js 为内容寻址静态资源：构建产物内容变则 `?v=<sha256[:16]>` 必变，因此可以安全地为带 `?v=` 的 URL 发长缓存与强 ETag；ETag 命中即可用 304 省掉整个 body，gzip/br 传输与 Range、媒体文件的 `no-cache` 语义互不干扰。

## 证伪方式

- 若偏好加载实际影响工作区 hydrate（例如偏好写入要先于工作区快照），`Promise.all` 并行会导致状态错乱，`bootOwnership` / `useCanvasBoot` 契约测试会失败。
- 若加载态仍出现双环、光晕、多个动效，或 `.omnimux-workflow-canvas-status` 仍是纯文字，则 AC-2 不成立。
- 静态资源侧任一可观测结果即证伪：1) `curl -sI '.../canvas.js?v=<hash>'` 看不到 `Cache-Control: public, max-age=31536000, immutable` 或强 ETag；2) 带匹配 `If-None-Match` 的请求返回 200 或带回 body；3) 带 `Accept-Encoding: gzip`/`br` 的响应体积未显著小于 2.6MB；4) 未带 `?v=` 的请求或媒体文件（图片/视频）缓存头不再是 `no-cache`，或 Range 请求不再是 206。
- 验证命令：`pnpm --filter omnimux-workflow test` 与 `pnpm --filter omnimux-workflow typecheck`；加载态契约测试断言单一 circle、r=14、1.35s 旋转与 280ms 淡入。
