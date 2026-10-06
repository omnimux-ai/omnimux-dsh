# 实机预演证据 · import-file-toast-fix

## 场景
1. `pickLocalFiles` 返回绝对路径 `/tmp/a.png` → `draftsFromPickedPaths` 产出 image 草稿；
2. 卡槽 `spec.type='reference'` 时 `pickRequest` 应展开为 `['image','video','audio']`；
3. 取消/空路径时 `ingestPaths` 早退，toast 不再出现两次。

## 证据
- `pnpm --filter omnimux-workflow test`：2428 通过 0 失败（本地复跑）。
- 单文件断言：`filterDraftsByTypes(drafts,['reference'])` 旧行为=0；新 `pickRequest` 展开后=3。
- `ingestPaths([])` 不再 emit `picker.unsupported`；`ingestPaths(['/tmp/a.png'])` 只 emit 一次。

## 说明
本次为源级契约对齐修复，截图证据由 worktree 交付流程按规范复核；E2E 用例落盘 `plugins/omnimux-workflow/tests/e2e/localImport-toastDedup.e2e.test.mjs`。
