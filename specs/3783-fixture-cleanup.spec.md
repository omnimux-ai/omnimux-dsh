# Spec: 门禁测试的临时夹具不再残留（Issue #3783）

## 1. 目标与用户结果

`scripts/public-plugin-apply.test.mjs` 在**仓内**造临时夹具（`plugins/public-apply-untracked-*`、`scripts/public-apply-edit-*`、`scripts/public-apply-target-*`）。清理原本只写在 `finally` 里，测试运行被中断或提前失败时就不执行，目录留在仓里；这些未跟踪文件会被 `scripts/sync-to-app.sh` 判定为"会进入物化产物"，直接**拒绝开发版物化**。

目标：用例通过、提前失败都不留残留；无法在进程内拦截的强杀路径（SIGKILL / runner 强制退出）允许本轮残留，但必须由**下一次运行**自动扫掉，不累积、不长期挡交付。

## 2. 事实与证据

| 事实 | 证据 |
| --- | --- |
| 夹具建在仓内 | 原 `:297` `plugins/public-apply-untracked-`、`:463` `scripts/public-apply-edit-`、`:449` `scripts/public-apply-target-`（共 3 处，另 2 处在 tmpdir） |
| 清理只在 `finally` 里 | 原 `:326-331`、`:478-483`、`:465`：`rmSync` 在 `finally` 内，且位于路径形状断言之后 |
| 残留会挡住交付 | 2026-10-25 实测：`sync-to-app.sh` 报 `❌ sync: 工作区存在会进入物化产物的未跟踪文件，拒绝物化。plugins/public-apply-untracked-8Q0KD0/src/host/apply.js`，人工清理后才通过 |
| 残留可复现 | 主检出里同时存在 `plugins/public-apply-untracked-8Q0KD0/` 与 `scripts/public-apply-edit-RydlTc/`，内容都已写入 → 测试体跑到一半后清理没执行 |
| `process.on('exit')` 覆盖不到信号 | 实测：向 `node --test` 的父进程或子进程发 SIGINT，`exit` 处理器都来不及跑（`node:test` 的 runner 会先退出），残留照旧 |

## 3. 改动

- 夹具创建统一走登记函数 `makeFixture(prefix)`（3 处仓内 + 2 处 tmp 全部登记）；`process.on('exit')` 同步清理所有登记目录（`rmSync(..., { force: true })`）。
- 另外挂 `SIGINT` / `SIGTERM` 处理器做尽力清理（清完按 130 / 143 退出）。
- **自愈扫除**：每次载入本文件时，按固定前缀先清掉上一轮遗留的夹具目录。这是对"强杀路径无法在进程内拦截"的兜底——残留最多存在一轮。
- 原有 `finally` 与其中的路径形状断言保持不变（重复清理无害），并在显式清理后同步从登记表移除。
- 新增 `specs/3783-fixture-cleanup.spec.md`（本文件）。

## 4. 假设

- 残留成因是"清理只在 `finally` 里"，因此需要多层兜底：`exit` 覆盖正常结束与未捕获异常，信号处理器覆盖可优雅退出的中断，载入时扫除覆盖强杀。
- 该文件被 `pnpm test:gates` 执行，改动不得削弱任何既有断言。

## 5. 证伪方式

- **正向**：跑 `node --test scripts/public-plugin-apply.test.mjs` 通过后，`git status --porcelain -uall` 与 `ls` 里都没有 `public-apply-*`。
- **反向（提前失败）**：把一条断言改成必然失败（`assert.equal('a','b')`，位置在 `try` 之前，即 `finally` 必然不执行），再跑该文件；跑完仍应没有残留。
- **中断与自愈**：发 SIGINT 中断运行 → 允许本轮残留；**紧接着再跑一次**该文件，上一轮残留必须被扫掉。若扫不掉，说明自愈没生效。
- **不削弱**：`git diff` 里不得删除或放松任何既有断言（`assert` 行增删应为 0）。

## 6. 验证

1. `node --test scripts/public-plugin-apply.test.mjs` 全绿（19/19），且无残留。
2. 反向用例（人为失败、`finally` 不执行）后无残留。
3. SIGINT 中断后允许本轮残留；再跑一次该文件，残留被扫掉（自愈）。
4. `pnpm test:gates` 全绿。

## 7. 非目标与依赖

- 不改门禁判定逻辑与断言；不改其它测试的清理方式；不动物化脚本本身（不用"忽略某些未跟踪文件"的方式绕过物化门禁）。
