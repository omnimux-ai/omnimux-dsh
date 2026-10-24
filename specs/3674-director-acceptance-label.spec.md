# Spec: 导演台验收 runner 菜单文案与产品事实对齐（Issue #3674）

- Issue: #3674（P2；由 #3640 菜单改名引发的验收假失败）
- 风险级别: R1（`scripts/`）
- 背景: #3640 把「添加节点」菜单的导演台条目文案从「3D 导演台 / 3D Director」改成「导演台 / Director」，但 `scripts/director-acceptance-3289.mjs` 仍在等旧文案，导致在最新 main 上真机验收必然在 `normal-project-entry/open-project` 假失败（实测证据见 Issue #3674）。

## 1. 目标与用户结果

任何人（Agent 或人）在干净 worktree 跑 `node scripts/director-acceptance-3289.mjs` 都能正常进入导演台并跑完 8 条断言；当文案再次变化时，失败信息能直接点明期望文案，而不是只报 "did not appear"。

## 2. 范围

- `scripts/director-acceptance-3289.mjs`
  - 新增具名常量 `DIRECTOR_PALETTE_LABELS`，包含当前文案（`导演台`、`Director`）与旧文案（`3D 导演台`、`3D Director`），菜单等待改用该常量。
  - 失败信息带上期望文案：`3D director palette entry did not appear (expected: ...)`。
- 不改断言集合、证据格式、runner 结构与其他旅程步骤。

## 3. 假设

- 菜单文案只有 `palette.item.director` 一处随 #3640 变化，其余旅程步骤（新建项目、画幅、机位、保存、播放、重开）在最新 main 上均已通过，因此只需修文案期望。
- 同时接受旧文案不会掩盖真实回归：节点名与菜单名是不同事实，若菜单项整体消失，等待仍会超时并报出期望文案。

## 4. 证伪方式

- 若修完仍失败：真实浏览器重跑会给出新的失败步骤与 DOM 细节，按新错误定位，而不是继续改文案。
- 若「同时接受旧文案」掩盖了产品改名回归：`pnpm --filter omnimux-workflow test` 与 `node --test scripts/verify-anti-slop.test.mjs` 仍会覆盖文案事实；本 runner 只负责能点到入口。

## 5. 验收

1. 干净 worktree（`worktree.sh new` + `pnpm install --frozen-lockfile`）内 `DIRECTOR_REAL_UI=1 DIRECTOR_EGO_BROWSER=<ego-browser> DIRECTOR_FFMPEG=<ffmpeg> node scripts/director-acceptance-3289.mjs` 退出码 0，`result.json` `passed=true`，8 条断言全过。
2. 失败信息包含期望文案常量。
3. `git diff` 只落在 `scripts/` 与 `specs/`。

## 6. 非目标

不改导演台业务代码、不改验收断言与证据格式、不重构 runner、不放宽任何门禁。

## 7. 新用户基线

只影响仓库内的验收脚本；产品行为与新产品安装路径不变。

## 8. 文档影响

无。若后续把验收文案期望写进合同文档，另行开任务。
