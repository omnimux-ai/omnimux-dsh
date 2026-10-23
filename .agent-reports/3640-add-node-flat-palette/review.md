# Issue #3640 合入前独立评审：添加节点菜单去分类 + 顺序/文案对齐

- 评审人：reviewer（独立评审，未参与实现；除本文件外未写入任何文件）
- 评审对象：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-addnode-flat-menu`
- 分支：`agent/workflow-addnode-flat-menu-issue-3640`
- 基线：`origin/main` 创建分支时的 `70439270b`
- 评审时间：2026-10-23（最终结论对应的快照见文末「快照锚定」）
- 唯一写入：本文件

## 结论

**PASS（可合入），无阻断问题。**

需求三条（去分类平铺、顺序对齐截图、菜单专属文案对齐且不改节点名）全部达成，有真实浏览器证据支撑；
改动面与声明一致、无越界；既有测试断言未被删改；我要求的全部命令自行执行，全绿。

剩余 **3 项非阻断问题**，都不影响功能正确性：N1 新增 e2e 未接入任何本地门禁、N2 交付需 `git add -f`
且分支尚无提交、N3 证据双份留存。另有若干残留风险与未覆盖项（含 `pnpm typecheck` 未跑）。

### 评审期间改动面在移动（重要）

评审对象是一个**仍在被写的工作区**，我逐次重新验证过。期间发生三次变化：

1. 我开始评审时 `tests/e2e/add-node-flat-palette.e2e.test.mjs` 与 `.agent-reports/.../report.md` 尚不存在
   （当时我把「规格声明 e2e 文件」判为虚假声明）；二者在评审中途落盘，我已对新文件重新执行验证，该条改为 PASS。
2. 我提出「节点真名不再可被搜索」后，实施者修改了 `addNodePalette.ts`（把 `resolveText(item.labelKey)` 并入 haystack）。
   我已在新版本上重跑全部命令并复验该问题已解决（见 N1 历史）。
3. 结论对应的确切文件哈希记录在文末；若合入前任一文件再变，需重新验证。

### 基线校正（重要前提）

本地 `origin/main` 引用已是 `d33743c4`，比声明的 base 前进 3 个提交（`#3638`、`#3633`、`#3631`）。
因此 `git diff origin/main --stat` 会混入 `#3629/#3630/#3631` 等无关文件（41 files, -3691 行），
**不能当作本任务的改动面**。本评审一律以声明的 base `70439270b` 为准：

```
git -C <wt> diff 70439270b --stat
 → 7 files changed, 100 insertions(+), 164 deletions(-)
```

另：分支上**没有任何提交**（`git rev-list --left-right --count origin/main...HEAD` = `3  0`），
`HEAD` 仍等于 base，全部改动在工作区（未 `git add`）。评审对象是工作区内容。

---

## 逐条核对

### 1. 改动面与越界 —— PASS

```
git diff 70439270b --stat
 plugins/omnimux-workflow/src/canvas/editor/components/AddNodeMenu.tsx        | 104 ++++++----------
 plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.test.mjs |   5 +-
 plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.ts      |  74 +++++++++++----
 plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts                          |   5 +-
 plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts                          |   5 +-
 plugins/omnimux-workflow/src/canvas/nodes/registry.ts                        |   9 +-
 plugins/omnimux-workflow/src/canvas/theme/components.css                     |  62 +-----------
 7 files changed, 100 insertions(+), 164 deletions(-)
```

untracked：`addNodeMenuFlat.test.mjs`、`tests/e2e/add-node-flat-palette.e2e.test.mjs`、
`specs/3640-add-node-flat-palette.spec.md`。即实际改动面 = 声明的 7 文件 + 2 新增测试 + 1 规格，**无越界文件**。

| 禁止项 | 结论 | 证据 |
|---|---|---|
| 不得改节点名 | PASS | `git diff 70439270b -- .../i18n/ \| rg '^[-+].*node\.type\.'` → **空输出**。`node.type.director` 仍 `3D 导演台`、`node.type.video_composition` 仍 `视频合成` |
| 不得改搜索关键词来源 | PASS | `paletteKeywordKeys()` 未改动，仍取注册表 `NodePaletteEntry.keywords` + `MATERIAL_TOOLS_BY_TYPE` + `PALETTE_ACTION_KEYWORDS`；`registry.ts` 的 diff 只有文档注释 |
| 不得改 badges | PASS | diff 中 badge 相关行只是 JSX 重构造成的**缩进位移**（嵌套 map → 平铺 map），值未变；`Clip`/`MiniMax H3`/`HTable` 原样，既有 Badge 断言原样通过 |

`git diff 70439270b --check` → 无空白错误。

### 2. 面板不再渲染分类，且不是 CSS 遮盖 —— PASS

- **JSX**：`AddNodeMenu.tsx` 删除 `groupAddNodePalette` 调用、`collapsedGroups` state、`UNGROUPED_KEY`、
  `toggleGroup`、`ChevronDown` import 及整个 `groups.map(...)` 分组渲染块；改为 `matches.map(...)` 直接平铺。
  分类标题 / 计数 / 折叠箭头对应的 DOM 结构已不存在，不是隐藏。
- **CSS**：`.wf-node-menu__group`、`__group-header`、`__group-caret`、`__group-title`、`__group-count`
  五组规则**整体删除**（-55 行），不是 `display:none`。
- **遮盖排查**：`rg "wf-node-menu__group|groupAddNodePalette|UNGROUPED_KEY" plugins/ specs/` 仅命中
  spec 文本、新增测试的负断言、以及 `groupAddNodePalette` 的定义与既有 search 测试的调用——无 CSS/视图残留。
- palette CSS 块内 `rg "display:\s*none|visibility|height:\s*0|opacity:\s*0|clip"` → 无命中。

`groupAddNodePalette` 保留但已无 UI 调用方，仅被未修改的 `addNodePalette.search.test.mjs` 使用——
这是「既有断言只读」约束下的合理保留，不是隐藏分组表。

### 3. 顺序与 `context` 作用域 —— PASS

读源码（非测试转述）确认 `ADD_NODE_PALETTE` 声明顺序：

`text → table → image → video → audio → director → video_composition → import_asset`

与需求一致。`import_asset` 条目 `scopes: ['dock']`，`getAddNodePalette` 按 `scopes.includes(scope)` 过滤，
故 `context` 为 7 项且不含 `import_asset`（新增测试与既有测试均断言此点并通过）。

### 4. 菜单文案 / 节点名 / 中英对齐 —— PASS

| 事实 | 值 | 来源 |
|---|---|---|
| 菜单 director | `palette.item.director` = `导演台` | `dict.zh.ts:700` |
| 菜单 video_composition | `palette.item.video_composition` = `视频剪辑` | `dict.zh.ts:701` |
| 节点名 director | `node.type.director` = `3D 导演台`（未改） | `dict.zh.ts:50` |
| 节点名 video_composition | `node.type.video_composition` = `视频合成`（未改） | `dict.zh.ts:49` |

- en：`palette.item.director` = `Director`、`palette.item.video_composition` = `Video Clip`。
- **en 无中文残留**：脚本扫描 `dict.en.ts` 全部单引号字符串条目，含 CJK 的条目数 = **0**。
- **zh/en key 集合一致**：解析两份 dict 顶层键 → zh 741 / en 741，`only in zh: 0`、`only in en: 0`。
- `addNodeMenuLabelKey()` 只对 `director`/`video_composition` 登记菜单键，其余回落 `item.labelKey`，
  而 `item.labelKey` 仍是 `node.type.<type>`（`AddNodePaletteLabelKey` 类型收窄为 `` `node.type.${CanvasAddNodeType}` ``）。
  菜单文案与节点名是两个独立真源，未互相覆盖。

### 5. 既有测试断言未被删改 —— PASS

```
git diff 70439270b --numstat -- .../addNodePalette.test.mjs
 3  2  .../addNodePalette.test.mjs      （仅 1 个 hunk：@@ -20,15 +20,16 @@）
```

该文件全部变更逐行：

- `-const REQUIRED_ICONS = [... 'Film', 'Box', 'UploadCloud'];`
  `+// Issue #3640：顺序对齐参考截图（导演台在视频剪辑之前）`
  `+const REQUIRED_ICONS = [... 'Box', 'Film', 'UploadCloud'];`
- `REQUIRED_ORDER` 中 `video_composition` 与 `director` 互换（`-`/`+` 各一行，仅值变化）

即**只更新两个顺序常量的值**加一行注释。逐项确认：

- 断言结构未变：5 个 `test(...)` 用例名逐字未动。
- `director` 的 `deepEqual` 不在任何 hunk 内，`labelKey` 仍是 `'node.type.director'`（第 67 行）。
- `FORBIDDEN_ICON_ALIASES`、`RAINBOW_HEX`、`dock.length === 8`、`context.length === 7` 等断言原样保留。
- 新增用例**只**出现在 `addNodeMenuFlat.test.mjs`（5 个 `test('3640：...')`）与
  `tests/e2e/add-node-flat-palette.e2e.test.mjs`（4 个 `E2E:` 用例）。

### 6. 规格「假设 / 证伪方式」与实际实现一致性 —— PASS

一致：

- §3 表格声明的 7 个文件责任与实际改动逐项吻合；`palette.group` 注释改写、`palette.group.*` 保留为检索别名属实。
- §4「面板不再渲染分类，也不靠 CSS / 视图遮盖分类」→ 由第 2 条独立验证。
- §4/§5「只更新顺序常量并新增用例，不删除/改写既有断言」→ 由第 5 条独立验证。
- 「假设」段「分类元数据被既有断言锁定为只读评估契约，本次保留并降级为检索别名」→ **与实现一致，非虚假声明**：
  `paletteGroupKey()` 仍读注册表 `palette.group`，`palette.group.*` 四条文案仍在，`groupAddNodePalette` 仍被
  未修改的 search 测试调用；规格明确写「删除需独立评审，不在本次范围」，属诚实披露。
- §3/§5 声明的 `tests/e2e/add-node-flat-palette.e2e.test.mjs` → 现已存在且通过（单独执行 4/4）。
- 「证伪方式」列的 5 个可证伪条件逐条实测均未被证伪：面板无 `.wf-node-menu__group*`（源码 + 浏览器 DOM 计数 0）、
  顺序正确、菜单显示「导演台/视频剪辑」、节点名未改、搜索「导演台」唯一命中。

关于「声称删除分类元数据而实际保留」的怀疑：**不成立**。规格从未声称删除元数据，反而在第 51、68 行明确
说明保留为检索别名并降级；实现与之一致。

### 7. 自行执行的真实结果 —— 全部 PASS

均在工作树内自行执行，未复述他人结论。下列结果为 **N1 修复后的最终版本**（修复前亦全绿）。

**(a) 五个测试文件**（`cwd = plugins/omnimux-workflow`，含新增 e2e）

```
node --test src/canvas/editor/components/addNodePalette.test.mjs \
  src/canvas/editor/components/addNodePalette.search.test.mjs \
  src/canvas/editor/components/AddNodeMenu.test.mjs \
  src/canvas/editor/components/addNodeMenuFlat.test.mjs \
  tests/e2e/add-node-flat-palette.e2e.test.mjs
→ ℹ tests 23  ℹ pass 23  ℹ fail 0  ℹ duration_ms 80.5   EXIT=0
```

（按要求单跑前 4 个文件：`tests 19 / pass 19 / fail 0`。既有用例名逐字未变，全部仍在跑。）

**(b) 反遮盖门禁**（仓库根）

```
node --test scripts/verify-anti-slop.test.mjs
→ ℹ tests 3  ℹ pass 3  ℹ fail 0   EXIT=0
```

**(c) Stage 契约**（仓库根）

```
pnpm verify:stages
→ PASS: 14 Stage components; 8 registered sidebar targets and their runtime contracts.   EXIT=0
```

**(d) 包测试**

```
pnpm --filter omnimux-workflow test
→ ℹ tests 2922  ℹ suites 162  ℹ pass 2922  ℹ fail 0  ℹ duration_ms 15984   EXIT=0
```

**(e) 附加（规格 §2 列出，成本低且与本改动直接相关）**

```
pnpm lint:i18n
→ ✅ [i18n-lint] 100% Quality Gate Passed! (14 locale files & 19 manifests scanned)   EXIT=0
```

**(f) 自建搜索行为探针（最终版本）**

```
node --input-type=module -e '<import addNodePalette + dict.zh，逐查询打印命中>'
"导演台"     => ["director"]                    # 唯一命中，符合规格证伪条件
"3D 导演台"  => ["director"]                    # 节点真名可搜（评审中修复）
"3D"         => ["director"]
"视频剪辑"   => ["video_composition"]
"视频合成"   => ["video_composition"]            # 节点真名可搜（评审中修复）
"素材"       => ["image","video","audio","import_asset"]   # 分类别名仍生效
"导入"       => ["image","video","audio","import_asset"]
```

### 8. 真实浏览器证据 —— PASS（截图、facts、report 三方一致，覆盖缺口如实披露）

**我实际查看的图片**（`display_file` 逐张目视，非读 JSON 转述）：

1. `dock-panel-zoom.png`（885×1500）：标题「添加节点」+ kbd `N` + 搜索框，其下 **8 行平铺、无任何分类标题/计数/折叠箭头**：
   文本、表格（HTable）、图片、视频（MiniMax H3）、音频、导演台、视频剪辑（Clip）、导入素材。
   **顺序与需求逐项一致**，菜单文案「导演台」「视频剪辑」可见。
2. `context-drill-panel-zoom.png`（840×1275，深色）：返回箭头 + 「添加节点」+ 搜索框，平铺 **7 行**，**不含「导入素材」**，无分类。
3. `search-director-zoom.png`（1180×780）：搜索框内容「导演台」，列表**只剩 1 行**「导演台」。

**与 `browser-facts.json` 交叉核对**：

| 断言 | 我的核对 |
|---|---|
| A1 无分类标题/计数/折叠箭头（两面板 DOM 计数全 0） | 与 3 张截图目视一致，且与源码 diff 一致（结构已删除，非隐藏） |
| A2 8 项顺序 | 与截图逐项一致，与 `ADD_NODE_PALETTE` 源码一致 |
| A3 菜单文案「导演台/视频剪辑」，节点名未变 | 与截图一致；`node.type.*` 经 diff 独立确认未改 |
| A4 搜索「导演台」唯一命中 + `<mark class="wf-node-menu__match">` | 截图可见唯一行；高亮在 1× 下视觉偏淡，facts 用 DOM + computedStyle 作依据并主动标注，属诚实 |
| A5 右键钻取 7 项、无「导入素材」、有返回按钮 | 与截图一致；`import_asset` 仅 dock 也由源码 `scopes` 独立确认 |
| 证据 sha256 | 我独立复算 6 个 PNG 的 sha256，与 `browser-facts.json` 的 `artifacts[].sha256` **逐个相同** |

**与 `report.md` 交叉核对**（评审中途落盘，9791 B）：§7 断言 A1–A5 与 facts 一致；§6 表格的像素/字节/sha256
与我复算一致；§8 的 9 条未覆盖项与 facts 的 `coverageGaps` 一致；§5 的 ego 空间（spaceId 248，本任务新建、
`finish({ keep: [] })`、无残留）与 facts 一致。

我额外**独立验证了 report.md §9 的交付提示**（其唯一的操作性主张）：`.agent-reports/` 被
`.git/info/exclude:21` 忽略、`docs/evidence/*` 被第 23 行忽略属实；`git ls-files .agent-reports/`
返回 **241 个已跟踪文件**（含 `3542-timeline-embeds/report.md`），说明仓库先例确为 `git add -f` 入库。
**该主张成立。**

**夸大/未覆盖项**：未发现夸大。report.md/facts 主动列出 8–9 项未覆盖，与我的观察一致。需点明：
「未验暗色主题」与 A5 深色截图不冲突——A5 是**钻取面板**在深色下的表现，未覆盖的是 **dock 面板**的深色样式。

---

## 问题分级

### 阻断问题

无。

### 非阻断问题

**N1（新增 e2e 未接入任何本地门禁）**
`plugins/omnimux-workflow` 的 test 脚本 glob 是
`node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"` —— `tests/*.test.mjs` **不递归**，
因此 `tests/e2e/add-node-flat-palette.e2e.test.mjs` 不被 `pnpm --filter omnimux-workflow test` 拾取
（证据：该文件落盘前后两次包测试均为 **2922**，计数未变）。根 `package.json` 无 glob `tests/e2e/**` 的脚本；
`.github/workflows/*.yml` 无 `e2e` 引用；该插件现有 **46 个** e2e 文件，无一被根脚本显式列出。
该文件单独执行 4/4 通过，其作用应是满足 `scripts/guard-quality-loop.mjs` 的 `missing-e2e-for-ui-change`
门禁（UI 改动必须同捆 e2e 文件），而非提供回归保护。与既有先例（`canvas-add-node-button-squircle.e2e.test.mjs`
同样未被任何脚本引用）一致，故不阻断。处置建议：知悉即可；若要它真正防回归，需接入某个门禁（超出本任务范围）。

**N2（交付需 `git add -f`；分支尚无提交）**
分支无任何提交，`HEAD` == base；改动全在工作区。且证据目录 `.agent-reports/` 与 `docs/evidence/*`
均被 `.git/info/exclude` 忽略——按仓库先例（241 个已跟踪文件）需
`git add -f .agent-reports/3640-add-node-flat-palette/` 才能随 PR 入库。若只做普通 `git add .`，
`addNodeMenuFlat.test.mjs`、`add-node-flat-palette.e2e.test.mjs`、`specs/3640-...spec.md` 与全部浏览器证据
都会漏掉，其中前两者缺失会直接触发 `guard-quality-loop` 拦截。
另：本地 `origin/main` 已前进到 `d33743c4`，合入前需 rebase/merge 并复跑第 7 条命令。

**N3（证据双份留存）**
规格 §2 指向 `docs/evidence/2026-10-23-add-node-flat-menu-3640/`（3 张 PNG），
本任务评审口径指向 `.agent-reports/3640-add-node-flat-palette/`（3 张同源 PNG + 3 张放大图 + `browser-facts.json` + `report.md`）。
两处基础 PNG sha256 逐字节相同，无实质矛盾，但双份留存有漂移风险。
处置建议：在规格中登记 `.agent-reports/` 路径，或明确二者主从关系。

### 评审中已解决的问题（留档）

**已解决 N0：搜索可发现性窄化。** 原实现把 `labelText` 由 `resolveText(item.labelKey)` 改为
`resolveText(addNodeMenuLabelKey(item))`，导致节点真名不再进入匹配串——实测 `"3D 导演台"`、`"3D"`、
`"视频合成"` 命中为空。我提出后，实施者把 `resolveText(item.labelKey)` 追加进 haystack（`addNodePalette.ts`
+4 行），我复验：上述三个查询现均正常命中，且 `"导演台"` 仍唯一命中（符合规格证伪条件）。
该修复未破坏任何断言（23/23、包测试 2922 全绿）。

### 补充观察（不构成问题）

- `AddNodeMenu.test.mjs` 的「图标映射覆盖 7 个强符号键」只枚举 7 个图标（未含 `Box`），是本次之前就存在的
  覆盖缺口；`Box` 实际仍在 `ICON_MAP` 且在截图中正常渲染（导演台立方体图标）。与本次改动无关，该断言未被改动。
- `addNodeMenuFlat.test.mjs` 与新增 e2e 均用源码字符串扫描验证「不再渲染分类」，属静态契约、强度有限；
  但第 8 条的浏览器 DOM 计数（全 0）与目视截图提供了运行时佐证，两者互补可接受。

## 残留风险与未覆盖项

1. **浏览器证据非我独立复现**：截图、facts、report 由另一 teammate 产出。我做了目视核对、sha256 独立复算、
   与源码/测试三方一致性交叉验证，但**未自行重启 harness 重跑一遍**。风险等级：低（三方一致，且 harness 为 dev-only）。
2. **证据对应的是修复前快照**：截图与 facts 采集于 19:02，而 `addNodePalette.ts` 在评审后期又被改动
   （N0 修复，仅影响搜索 haystack，不影响面板渲染/顺序/文案）。因此**截图未覆盖该 4 行改动**；
   该改动的正确性由我重跑的探针 + 23 个测试覆盖。若追求证据与代码严格同版本，建议补采一次。
3. **en 语言下菜单文案未做浏览器验证**（仅字典/单测层验证 `Director` / `Video Clip`，且 en 无中文残留）。
4. **节点创建动作未在浏览器验证**：点「视频剪辑」后是否创建 `video_composition` 节点、且节点标题仍显示「视频合成」，
   仅由源码与字典推断。这是需求「不改画布节点自身名称」的最后一公里，建议补一张创建后节点标题的截图。
5. **深色主题下 dock 面板样式未验证**（钻取面板深色已验证）。
6. **Electron / Dev app 未验证**：harness 是 dev-only 画布孤岛，构建明确 skip 生产 bundle；
   按仓库约定 Dev app（45120）验收归人类，不作为阻断项。
7. **未运行 `pnpm typecheck`**（规格 §2 列出）：本次含 TS 类型改动（新增 `AddNodePaletteLabelKey`、
   `addNodeMenuLabelKey` 返回 `string`），而 node 直接跑 `.ts` 只做类型剥离、不校验类型。
   虽不在我的必做清单内，仍是**类型层面的未覆盖项**，建议合入前由实施者补跑。
8. 未做跨包回归；本改动只落在 `omnimux-workflow` 内部（已由改动面无跨包文件确认）。

## 快照锚定

最终结论对应的工作区快照（`shasum -a 256`，2026-10-23 20:45 +08:00）：

```
ec6c86b4a103222ef263c9bded405aaa927f70162d60046f0c22ca0101b61437  src/canvas/editor/components/AddNodeMenu.tsx
7adf1769c884aa884bc548ce0c4e35ad82b1b33c82c1d20f7112c7968a105d24  src/canvas/editor/components/addNodePalette.ts   ← N0 修复后
ee26ccbf41110f2919dcc13412721c7487bca0e34dde1314a460a6587e638417  src/canvas/editor/components/addNodePalette.test.mjs
e487be7cf3088e8488c1757d124b8cdf38a79d3a883905097170b16721019b39  src/canvas/editor/components/addNodeMenuFlat.test.mjs
fe774c0e3494dce05b95d3c467cd7df986adda4a8292d3ef3a21c8aafaf1ed09  src/canvas/i18n/dict.zh.ts
7f41ee08707c9077e19ccf7a3c868206d4bbe590681a3c18d340b915785ce1f5  src/canvas/i18n/dict.en.ts
50fe29d83f63aefa788e2eada50faa0158a8c8ae1becacd2024b33cd9d8c2a85  src/canvas/nodes/registry.ts
5aab78448082e7d4b885309e2c3f34302ceaed6238becb2cf0ce85af7e217234  src/canvas/theme/components.css
a8c8bc7396adfd68ef520dd37e7489723cbcf8e2dbbff18ed2e478ae5896e62c  tests/e2e/add-node-flat-palette.e2e.test.mjs
b1a7ca73adab8cb782b56d2805e38f7465f23a80e442e6b6045a214dccc8f97a  specs/3640-add-node-flat-palette.spec.md
```

若合入前上述任一文件再变，本结论需重新验证（至少复跑第 7 条 (a)(c)(d)）。

## 附：本次评审执行的命令清单

```
git -C <wt> status --short / rev-parse / merge-base / rev-list --left-right --count origin/main...HEAD
git -C <wt> diff origin/main --stat            # 已被上游 3 提交污染，仅作基线校正说明
git -C <wt> diff 70439270b --stat / --check / <逐文件完整 diff>
git -C <wt> diff 70439270b -- .../addNodePalette.test.mjs | rg '^[-+]'   # 逐行核对既有断言
rg -n "wf-node-menu__group|groupAddNodePalette|UNGROUPED_KEY" plugins/ specs/
rg -n "display:\s*none|visibility|height:\s*0|opacity:\s*0|clip"   # palette CSS 块遮盖排查
node -e '<zh/en key 集合比对 + CJK 残留扫描 + node.type.* 取值>'
node --input-type=module -e '<matchAddNodePalette 查询探针>'        # N0 修复前后各一次
(cd plugins/omnimux-workflow && node --test <4 个测试文件>)
(cd plugins/omnimux-workflow && node --test <4 个 + e2e = 5 个测试文件>)
node --test scripts/verify-anti-slop.test.mjs
pnpm verify:stages
pnpm --filter omnimux-workflow test        # 共 3 次：e2e 落盘前 / 落盘后 / N0 修复后
pnpm lint:i18n
shasum -a 256 <6 个 PNG / 10 个评审面文件>
git ls-files .agent-reports/ | wc -l
git check-ignore -v <两个证据目录>
node -e '<读 root package.json scripts 找 e2e 入口>'
rg -n "tests/e2e" package.json scripts/*.mjs plugins/omnimux-workflow/package.json
display_file <3 张 zoom PNG>   # 目视核对
```
