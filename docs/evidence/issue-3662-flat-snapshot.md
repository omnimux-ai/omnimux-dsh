# Issue 3662 · 模板收尾清理：死文案 + 组入口悬空父引用

- 任务工作树：`.worktrees/workflow-template-flat-snapshot-3662`（分支 `agent/workflow-template-flat-snapshot-3662-issue-3662`，base `origin/main` = `328ae68ee`）
- 驱动：插件 dev harness（`node scripts/canvas-harness.mjs --port 0`，真实 `CanvasEditor`）+ ego-browser 真实 Chromium；页内覆写 `window.fetch` 拦截 `POST /omnimux-workflow/api/templates` 并返回合成 200，payload 原样记录
- 结构化证据与截图（本机生成物，不进版本库）：`docs/evidence/issue-3662-flat-snapshot.json`、`docs/evidence/issue-3662-0*.png`

## 改了什么

1. 删除死文案 `template.missingGroup`（`dict.zh.ts` / `dict.en.ts` 同步删；`#3659` 之后源码已无引用）。
2. 新增 `toFlatTemplateSnapshot(nodes)`（`workflowTemplateScope.ts`）：落库前剥掉 `parentId`/`extent`，幂等；`CanvasEditor` 的 `onConfirm` 在 `sanitizeNodes` 前统一调用，两个范围共用。

模板是扁平快照：payload 里没有组容器，所以任何 `parentId` 都是指向「不在模板内的组」的悬空引用。插入路径 `planInstantiateTemplate` 本来会剥一次，但模板 JSON 自身应当自洽——组范围此前没剥，画布范围（#3659）已经剥了。

## 实测（真实浏览器，1728×883 视口）

| 断言 | 修复前 | 修复后 |
| --- | --- | --- |
| 组入口 payload 的 `parentId` 数 | 2（两个子节点各带 `parentId=<组 id>`） | **0** |
| 组入口 payload 的 `extent` 数 | 2（`extent: 'parent'`） | **0** |
| 组入口 payload 节点键 | 含 `parentId`/`extent` | `[data, id, position, selected, type]` |
| 组入口节点坐标 | `[[32,80],[432,60]]`（组内相对） | `[[32,80],[432,60]]`（不变，插入时整体平移） |
| 组入口其余形状 | 2 节点 / 1 条组内连线 | 2 节点 / 1 条组内连线，提示「包含 2 个节点」 |
| 画布入口（#3659 回归） | 5 节点 / 2 连线 / 无父引用 / 绝对坐标 | 同左，未变（`[[80,60],[480,40],[480,380],[880,80],[880,420]]`） |

真实打组过程（同一次运行）：选中 `n-text` + `n-image`（`selectedCount=2`、浮动条出现）→ Cmd+G → 组 `group_1792804212458_fek75`（814×612）→ 组浮动条「保存工作流」→ 保存成功。画布入口那一份 payload 里这两个子节点是 `(80,60)`/`(480,40)`，正好等于组容器 `(48,-20)` + 组内相对 `(32,80)`/`(432,60)`，与 #3659 的绝对化结论一致。

## 自动化检查

- `pnpm --filter omnimux-workflow test` → 2930 pass / 0 fail（含新增 `toFlatTemplateSnapshot.test.mjs` 3 用例；既有 4 个范围用例未回归）
- `pnpm --filter omnimux-workflow typecheck` → canvas + host + director 三段绿
- `pnpm verify:stages` → PASS（14 Stage / 8 sidebar）；anti-slop 3/3；`git diff --check` clean
- `w4-i18n.test.mjs` → zh/en key 集合仍完全一致（两侧同步删 key）

## 已知缺口

- 浅色主题、键盘可达性、Electron 壳层未覆盖。
- 嵌套组（组里套组）坐标只加一层是 #3659 遗留的潜在缺口，本轮未动（当前 UI 打不出嵌套组）。
