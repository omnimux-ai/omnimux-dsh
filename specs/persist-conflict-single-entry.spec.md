# persistConflict 判定导出面收敛（Issue #3601，评审 F7）

## 目标与成功标准

`plugins/omnimux-workflow/src/canvas/bridge/persistConflict.ts` 从 **9 个导出**（3 个判定入口 + 6 个类型）收敛为 **3 个导出**（1 个判定函数 + 决策类型 + 入参类型），且模块零依赖：

- 唯一入口：`decideRemoteVersionAdvance({ localSignature, lastSavedSignature, remoteSignature })`；
- 删除 `decideGraphReconcile`、`planRemoteReconcile`、`RemoteVersionAdvanceDecision`、`CurrentSignatureReconcileInput`、`RemoteReconcileInput`、`RemoteReconcilePlan`；
- 删除 `planRemoteReconcile` 的 `workspaceId?: string` 可选入参（漏传会让签名与 hook 不一致的真实陷阱）；
- `useWorkspacePersistence` 无需改动（它本来就用唯一入口 + 自算签名）。

可观察标准：**生产导出面**只剩 1 个判定入口（被删掉的名字仅以测试内本地适配器形式存在，`git grep` 会命中它们，这是预期）；`pnpm --filter omnimux-workflow test` 与 `typecheck` 全绿，**用例数与断言文本一字不改**（2861 / 0 fail）。

注意边界：本次只把「接受 workspaceId 的判定入口」从 `persistConflict` 移除；签名计算仍在 `persistSanitize.signatureOf`，其 `workspaceId?: string` 依然可选，漏传会改变导入素材节点的签名。真正的收口需要在 `persistSanitize` 侧把 `workspaceId` 改为必填，不在本任务范围。

## 命名取舍

保留 `decideRemoteVersionAdvance` 作为唯一入口名，而不是改成 `decideGraphReconcile`：`persistSanitize.test.mjs:255` 的源码契约把该名字钉在 hook 源码上，改名会把「删除重复导出」升级成「测试标准变更」。函数语义由文档补足（四态，含 `resave`；`localSignature` 必须是判定时刻的签名）。将来若要改名，应作为独立的测试标准变更单独评审。

## 计划与项目结构

- `persistConflict.ts`：只留 1 函数 + 2 类型 + 文件头注释；去掉 `canvasTypes` 与 `signatureOf` 依赖。
- `persistConflict.test.mjs`：新增用例改为本地适配器 `decideGraphReconcile(input)`（`currentSignature` → `localSignature` 映射），**断言不动**。
- `workspaceSelfSaveRace.test.mjs`：`planRemoteReconcile` 改为文件内本地 helper（复用公开的 `signatureOf`，`workspaceId` 必填），**断言不动**。
- `persistSanitize.test.mjs`、`workspaceSaveScope.test.mjs`、`submissionSaveBarrier.test.mjs`：不动。
- `specs/canvas-self-save-conflict.spec.md`：补一句入口命名说明，避免与 #3595 规格漂移。

## 命令

- `node --test plugins/omnimux-workflow/src/canvas/bridge/{persistConflict,workspaceSelfSaveRace,persistSanitize,workspaceSaveScope,submissionSaveBarrier}.test.mjs`
- `pnpm --filter omnimux-workflow test`
- `pnpm --filter omnimux-workflow typecheck`
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `git diff --check`

## 代码风格

纯函数、显式类型、单一实现；不保留兼容别名（旧名在仓库内零消费者，仅测试内的本地适配器保留调用形状）。


## 测试策略

纯重构：既有用例全部保留，断言文本与期待值一字不改；只把两个测试文件里对已删除导出的调用，换成文件内的等价适配器（映射到唯一入口）。等价性由「同一批用例全绿 + 用例数不变」证明，不新增只复述改名的用例。

关于清单：`scripts/test-change-review.mjs` 对任何被修改的 `*.test.mjs` 路径都会产出 `existing-evaluation-changed` 条目（不判断断言是否真的变了），所以本任务仍会附该清单，并逐条说明「断言文本与期待值零变更、无 skip/only/todo」；不声称「不需要清单」。

## 假设

1. `persistConflict` 是插件内部模块，仓库内除 `useWorkspacePersistence` 与三个 bridge 测试外无其它消费者（已用 ripgrep 确认，含 `plugins/*`、`packages/*`、`presets/*`），删除导出无外部迁移成本。
2. 两个本地适配器对**当前用例的调用形状**与原导出等价：`persistConflict.test.mjs` 的适配器只做 `currentSignature` → `localSignature` 的字段改名；`workspaceSelfSaveRace.test.mjs` 的 helper 额外用公开的 `signatureOf` 算两个签名，并加了一条 `workspaceId` 必填守卫（6 处调用都传了 `WS`，守卫不可达）。等价性的对象是这些调用点，而不是任意入参。

## 证伪方式

1. 若存在漏网消费者，删除导出后 `typecheck` 或 `pnpm --filter omnimux-workflow test` 会立即报未定义导入；另用 `git grep -n "persistConflict" -- ':!docs'` 复核引用清单。
2. 若适配器与原实现不等价，`persistConflict.test.mjs` 与 `workspaceSelfSaveRace.test.mjs` 的既有断言会出现值变化（而不是通过）。注意证伪范围：这条无法覆盖「守卫分支」这类只在非法入参下出现的差异，因此守卫的语义由用例入参本身（全部传 `WS`）保证，而不是由断言证明。

## 边界与文档影响

只改 `plugins/omnimux-workflow/src/canvas/bridge/persistConflict.ts`、两个测试文件的 import/适配器，以及两份 spec 说明；不改判定语义、hook 保存流程、UI 文案、`canvas.json` schema；不物化 Prod。文档影响：新增本规格 + #3595 规格补一句入口命名，无契约条款变更。
