# Spec: 门禁测试的临时夹具不再残留（Issue #3783）

## 1. 目标与用户结果

`scripts/public-plugin-apply.test.mjs` 在**仓内**造临时夹具（`plugins/public-apply-untracked-*`、`scripts/public-apply-edit-*`）。一旦测试文件在运行中被中断或提前失败，`finally` 里的清理没跑，目录就留在仓里；而这些未跟踪文件会被 `scripts/sync-to-app.sh` 判定为"会进入物化产物"，直接**拒绝开发版物化**。

目标：无论用例通过、失败还是运行被中断，测试都不在仓内留下夹具。

## 2. 事实与证据

| 事实 | 证据 |
| --- | --- |
| 夹具建在仓内 | `:297` `mkdtempSync(resolve(root, 'plugins/public-apply-untracked-'))`；`:463` `mkdtempSync(resolve(root, 'scripts/public-apply-edit-'))` |
| 清理只在 `finally` 里 | `:326-331`、`:478-483`：`rmSync` 在 `finally` 内、且位于两条 `assert.equal(...startsWith...)` 之后 |
| 残留会挡住交付 | 2026-10-25 实测：`sync-to-app.sh` 报 `❌ sync: 工作区存在会进入物化产物的未跟踪文件，拒绝物化。plugins/public-apply-untracked-8Q0KD0/src/host/apply.js`，人工清理后才通过 |
| 残留可复现 | 主检出里同时存在 `plugins/public-apply-untracked-8Q0KD0/` 与 `scripts/public-apply-edit-RydlTc/`，两处夹具内容都已写入 → 说明测试体跑到一半后清理没执行 |

## 3. 改动

- `scripts/public-plugin-apply.test.mjs`：夹具创建改为走一个登记函数 `makeFixture(prefix)`，创建即登记；模块级注册 `process.on('exit')` 同步清理所有登记目录（`rmSync(..., { force: true })`）。原有 `finally` 与其中的路径形状断言保持不变（重复清理无害）。
- 新增 `specs/3783-fixture-cleanup.spec.md`（本文件）。

## 4. 假设

- 残留的成因是"测试运行被中断/提前失败导致 `finally` 未执行"，因此进程级 `exit` 兜底比只靠 `finally` 更能覆盖。
- 该文件同时被 CI 的 `test:gates` 与本地 `pnpm test:gates` 执行，改动不得削弱任何既有断言。

## 5. 证伪方式

- **正向**：跑 `node --test scripts/public-plugin-apply.test.mjs` 通过后，`git status --porcelain` 里没有 `public-apply-*`。
- **反向**：在临时副本里把一条断言改成必然失败（`assert.equal('a','b')`），再跑该文件；跑完 `git status` 仍应没有 `public-apply-*` 残留。若仍有残留，说明兜底没生效。
- **不削弱**：`git diff` 里不得删除或放松任何既有断言。

## 6. 验证

1. `node --test scripts/public-plugin-apply.test.mjs` 全绿，且无残留。
2. 反向用例（人为失败）后无残留。
3. `pnpm test:gates` 全绿。

## 7. 非目标与依赖

- 不改门禁判定逻辑与断言；不改其它测试的清理方式；不动物化脚本本身。
