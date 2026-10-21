# 画布自撞误报「内容冲突」（Issue #3595）

## 目标与成功标准

画布自动保存在"本机自己的保存把服务端版本推进"之后，再叠加一笔本地未存增量（典型：导入素材插入节点）时，不再弹出红色「内容冲突」条，也不再冻结自动保存；本地增量自动续存到服务端。真正的双写分叉（远端含别人新增内容 + 本地也有不同未存内容）仍然弹条，两个按钮语义不变。

可观察标准：

1. 远端版本推进但内容等于"上次已存快照"、本地图领先时，状态不进入 `conflict`，本地内容最终落盘且 `version` 前进。
2. 本地图 == 远端图 → 只对齐版本（保持既有 `adopt`）。
3. 本地图 == 上次已存、远端图不同 → 用远端重载（保持既有 `reload`）。
4. 三方签名互不相同 → 仍 `conflict`。
5. `pnpm --filter omnimux-workflow test` 全绿。

## 新用户基线

依赖安装自带的本地工作流服务、可写工作区/项目目录与画布页，不依赖开发机路径、模型或凭据。服务端不可写时保持既有错误态（`error`），不静默退化成"看起来保存成功"。

## 计划与项目结构

- `plugins/omnimux-workflow/src/canvas/bridge/persistConflict.ts`：把三态判定改为四态 `decideGraphReconcile`（`adopt | resave | reload | conflict`），保留纯函数形态与现有注释风格。
- `plugins/omnimux-workflow/src/canvas/bridge/useWorkspacePersistence.ts`：`resolveRemoteAdvance` 去掉"调用方旧快照"参数语义，改为 await 后重读 store 计算签名；`resave` 时对齐版本并重新排一次保存；409 分支命中 `resave` 时带新版本重试一次 PUT。
- 测试：`persistConflict.test.mjs` 覆盖四态；新增 `workspaceSelfSaveRace.test.mjs` 覆盖"远端 == lastSaved + 本地新增节点"的端到端判定链（纯函数 + 真实 `signatureOf`/`sanitizeNodes`，不启 React）。

## 命令

- `node --test plugins/omnimux-workflow/src/canvas/bridge/persistConflict.test.mjs plugins/omnimux-workflow/src/canvas/bridge/workspaceSelfSaveRace.test.mjs`
- `pnpm --filter omnimux-workflow test`
- `git diff --check`

## 代码风格

沿用现有命名导出、显式类型、纯函数承载判定、hook 只做编排；不新增 UI 文案、不动 i18n、不改 `canvas.json` schema。

## 测试策略

先写失败用例再实现。判定层：`persistConflict.test.mjs` 追加四态断言（含 `resave`）。调用层：在既有 hook harness（`workspaceSaveScope.test.mjs`，esbuild + 假 React + `poll()`/`autosave()`）中追加 5 个用例——自撞推进不弹冲突并续存、409 + adopt 不弹条不重发 PUT、409 + reload 不弹条、真分叉仍弹条并冻结、探测与快照之间继续编辑时按当前图判定。

RED 证据：临时注释掉 `resave` 分支后重跑 harness，`自撞推进…` 与 `探测与快照之间继续编辑…` 两条立即失败（25 pass / 2 fail），恢复后 27/27 通过；说明这两条用例真的覆盖了本次修复的语义，而不是复述实现。

不新增 E2E：本次改动只在 `src/canvas/bridge` 的持久化判定，`impact-matrix` 判定 `isUiChange=false`、`browser.required=false`，无 DOM/样式/文案改动。

## 假设

1. 远端版本推进有两种良性来源：本机自己的 PUT 成功（内容 == 上次已存快照），以及其它会话写入的**相同**图；只要远端签名 == 上次已存签名，远端就没有本地尚未拥有的内容（模 sanitize 剥掉的派生字段），续存不会覆盖别人的工作。
2. 本地编辑在 `await` 期间继续增长时，正确语义是"以最新本地图重新判定"，沿用探测前的旧快照会制造假分叉。

## 证伪方式

1. 若存在"远端 == lastSaved 但远端其实携带别人新增内容"的场景，签名必然不等（签名覆盖节点/边白名单字段）：可用 `signatureOf` 构造该用例，`remoteSignature !== lastSavedSignature`，从而不会走 `resave`；`workspaceSelfSaveRace.test.mjs` 的"远端只落后一条边"用例即此形状。
2. 若测试没有真正覆盖调用层竞态，把 `resave` 分支摘掉后用例仍然全绿——已实测相反（2 条红灯），见「测试策略」；同时 harness 用例直接加载 `useWorkspacePersistence.ts`，不再只有纯函数层覆盖。

## 边界与文档影响

不改官方 DSH、不改模型/凭据、不写生产、不删用户文件；文档影响：新增本任务规格，无契约变更（`docs/contracts/` 未涉及）；不物化 Prod。
