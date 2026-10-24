# Issue 3651 · 右键「添加节点」面板去搜索框 + 工作流入口改平铺

- 任务工作树：`.worktrees/workflow-context-panel-3651`（分支 `agent/workflow-context-panel-3651-issue-3651`，base `origin/main` = `8e42dc961`）
- 驱动：插件自带 dev harness（`node scripts/canvas-harness.mjs --port 0`，真实 `CanvasEditor`）+ ego-browser 真实 Chromium（TaskSpace `omnimux-3651-context-panel-20261024-0715`，`finish({ keep: [] })`）
- 完整结构化证据与截图（本机生成物，不进版本库）：`docs/evidence/issue-3651-ui-journey.json` 与 `docs/evidence/issue-3651-0*.png`

## 需求与实现

用户要求（附对照截图）：右键浮层里不要搜索框；底部工作流入口参考对照图改成平铺行，不要分割线、不要「默认选中」观感。

| 断言 | 改前 | 改后 |
| --- | --- | --- |
| 右键面板搜索框 / 空态 | `input` 1 个（占位「搜索节点或能力」）、空态 1 个 | **0 / 0**（搜索只保留在 Dock） |
| 面板内分割线 | header `border-bottom: 1px solid`；footer `border-top: 1px solid` + `padding-top: 8px` | **`0px none` / `0px none`**（footer `margin-top: 2px`，与列表 gap 一致） |
| 工作流入口形态 | 1px 边框 + 10px 圆角 + 8px 内边距的卡片 | **无边框、常态 `rgba(0,0,0,0)`**，圆角 8px / 内边距 `6px 8px` / gap 12px —— 与相邻条目完全一致 |
| 入口 hover | hover 底色 | hover 底色仍在（`rgba(255,255,255,0.08)`） |
| 入口点击 | 打开「创建可复用工作流模板」 | 仍打开（overlay 1 个，标题一致） |

「默认选中观感」的成因（独立验收方复核后订正过一次）：旧形态的入口行是 `background: var(--wf-menu-surface-hover, transparent)`，该 token 在右键面板作用域（`.wf-context-menu`，`components.css:2229`）解析为 `rgba(255,255,255,0.08)`——只有 Dock 里未定义，所以**旧右键入口行本来就有常态底色**，这才是「像被选中」的主因，1px 边框与 footer 分割线是叠加的第二、第三重。本次以 `background: transparent` + 去边框 + 去分割线消除，并且不再让 hover token 充当常态底色。

面板自然高度从 586px（#3639 记录）降到 **411px**（host 429px），`ADD_MENU_HEIGHT_ESTIMATE` 由 600 校准为 **440**（注释写明来源），锚点不再被高估夹取（1728×883 锚点 y=300 时面板 top 由 275 变为 300）。

## 实测（真实浏览器几何 + 命中）

| 视口 | 锚点 y | entryBottom | clippedPx | entryInViewport | entryHit |
| --- | --- | --- | --- | --- | --- |
| 1728×883 | 300 | 720 | 0 | true | true |
| 1728×883 | 740 | 846 | 0 | true | true |
| 1280×720 | 500 | 692 | 0 | true | true |
| 1024×600 | 400 | 572 | 0 | true | true |
| 900×560 | 440 | 532 | 0 | true | true |
| 900×500 | 400 | 472 | 0 | true | true |

Dock (+) 面板不回归：搜索框 1 个（占位「搜索节点或能力」）、条目 8 个、header `border-bottom: 1px solid`、footer `border-top: 1px solid` + `padding-top: 8px`、入口卡 1px 边框 / 10px 圆角 / 8px 内边距，均在视口内且可命中。

## 自动化检查

- `pnpm --filter omnimux-workflow test` → 2923 pass / 0 fail（exit 0）
- `pnpm --filter omnimux-workflow typecheck` → canvas + host + director 三段 tsc 全绿
- `pnpm verify:stages` → PASS（14 Stage / 8 sidebar）
- `node --test scripts/verify-anti-slop.test.mjs` → 3 pass / 0 fail
- `git diff --check` → clean

## 独立验收（verifier-3651，与实施分离）

自建 TaskSpace 独立复测，结论 **PASS**，并用 `CSS.getMatchedStylesForNode` 确认 12 个样式表无后续规则覆盖；`ADD_MENU_HEIGHT_ESTIMATE=440` 在 12 组视口/锚点（含 1728×883@y860、900×420、760×380、600×340）下溢出与裁剪全为 0；Dock 搜索过滤（「视频」→5 条 + 2 个 `<mark>`、乱码→空态、清空→8 条）正常。6 条证伪尝试均未推翻，并订正了本文件对「默认选中观感」成因的一处不准表述（见上）。未覆盖：Electron/壳层渲染、入口键盘 focus-visible 环、浅色主题。

## 已知缺口

- 键盘可达性、en locale、`dark: on` 未复测（改动为形态属性）。
- 「无 `onCreateWorkflow` 时不渲染入口行」仍无自动化锁（门禁拒绝新增渲染式测试文件，与 #3639 记录一致）。
- 顶部标题分割线在 context 下移除属本次判断（对照图标题下无线）；Dock 保留。若希望 Dock 一并去掉，是一句话可改的增量。
