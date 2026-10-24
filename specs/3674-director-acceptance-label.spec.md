# Spec: 导演台验收 runner 菜单文案与产品事实对齐（Issue #3674）

- Issue: #3674（P2；由 #3640 菜单改名引发的验收假失败）
- 风险级别: R1（`scripts/`）
- 背景: #3640 把「添加节点」菜单的导演台条目文案从「3D 导演台 / 3D Director」改成「导演台 / Director」，但 `scripts/director-acceptance-3289.mjs` 仍在等旧文案，导致在最新 main 上真机验收必然在 `normal-project-entry/open-project` 假失败（实测证据见 Issue #3674）。

## 1. 目标与用户结果

任何人（Agent 或人）在干净 worktree 跑 `node scripts/director-acceptance-3289.mjs` 都能正常进入导演台并跑完 8 条断言；当文案再次变化时，失败信息能直接点明期望文案，而不是只报 "did not appear"。

## 2. 范围

- `scripts/director-acceptance-3289.mjs`
  - 新增具名常量 `DIRECTOR_PALETTE_LABELS`，只列**当前**菜单文案（`导演台`、`Director`）；菜单等待与两处失败信息都改用它。
  - 失败信息带上期望文案：`... did not appear (expected: ...)` / `... not actionable (expected: ...)`。
  - 该常量经 payload 传入被 `toString()` 后独立执行的 `browserJourney`（模块级常量在那边不存在）。
- 不改断言集合、证据格式、runner 结构与其他旅程步骤。
- 本 Issue 的 diff 除脚本外还包含 `specs/3674-director-acceptance-label.spec.md`（仓库 Quality Loop 要求脚本改动在任务工作树内落 spec）。

## 3. 假设

- 菜单文案只有 `palette.item.director` 一处随 #3640 变化，其余旅程步骤（新建项目、画幅、机位、保存、播放、重开）在最新 main 上均已通过，因此只需修文案期望。
- 只认当前文案（不兼容旧文案）是刻意的：runner 每次都从本工作树装 fresh task-source，不存在需要兼容的版本漂移；菜单文案再改名时应当带着期望文案失败，而不是静默放行，否则 E2E 对该文案的证明力会被削弱。文案事实本身仍由 `pnpm --filter omnimux-workflow test`（`addNodeMenuFlat` 等）覆盖。

## 4. 证伪方式

- 若修完仍失败：真实浏览器重跑会给出新的失败步骤与 DOM 细节，按新错误定位，而不是继续改文案。
- 若文案期望再次与产品脱节：本 runner 会带着期望文案失败（而不是静默兼容），届时按 `failure.json` 的期望列表核对 `dict.zh.ts` / `dict.en.ts` 的 `palette.item.director`。

## 5. 验收

1. 干净 worktree（`worktree.sh new` + `pnpm install --frozen-lockfile`）内 `DIRECTOR_REAL_UI=1 DIRECTOR_EGO_BROWSER=<ego-browser> DIRECTOR_FFMPEG=<ffmpeg> node scripts/director-acceptance-3289.mjs` 退出码 0，`result.json` `passed=true`，8 条断言全过；证据记录 `head` 等于本提交 SHA（先提交再跑）。
2. 两处失败信息都包含期望文案常量。
3. `git diff` 只落在 `scripts/` 与 `specs/`。

## 6. 非目标

不改导演台业务代码、不改验收断言与证据格式、不重构 runner、不放宽任何门禁。

## 7. 新用户基线

只影响仓库内的验收脚本；产品行为与新产品安装路径不变。

## 8. 文档影响

无。若后续把验收文案期望写进合同文档，另行开任务。
