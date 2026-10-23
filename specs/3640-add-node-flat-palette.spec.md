---
title: "「添加节点」菜单去分类与顺序对齐规格"
id: "spec-3640-add-node-flat-palette"
type: "spec"
status: "active"
authority: "L2"
date: "2026-10-23"
authors: ["x", "agent"]
subsystem: "omnimux-workflow"
---

# 「添加节点」菜单去分类与顺序对齐规格

## 1. 目标

Issue #3640。用户对照 MiniMax Design 的「添加节点」面板截图要求：**这个菜单不要分类**，并按截图顺序排列；同时把两项菜单文案对齐截图（导演台 / 视频剪辑）。

当前实现（`AddNodeMenu` + `addNodePalette` + 节点注册表 `palette.group`）把条目按注册表声明的分类渲染成四个可折叠分组（素材 4 / 数据 1 / 合成 1 / 创作 1），顺序 text → table → image → video → audio → video_composition → director。

目标状态：单一无分类平铺列表，顺序 文本 → 表格 → 图片 → 视频 → 音频 → 导演台 → 视频剪辑 → 导入素材（导入素材仅 Dock 入口）；菜单内 `director` 显示「导演台」、`video_composition` 显示「视频剪辑」，画布节点自身名称（`node.type.director` = 3D 导演台 / `node.type.video_composition` = 视频合成）保持不变。

用户旅程：画布底部点「+」→ 面板直接列出 8 项、无分类标题 → 点「视频剪辑」创建 `video_composition` 节点（节点标题仍是「视频合成」）→ 在搜索框输入关键词仍能过滤并高亮命中。

## 2. 命令

- 单测（本任务面）：`node --test src/canvas/editor/components/addNodePalette.test.mjs src/canvas/editor/components/addNodePalette.search.test.mjs src/canvas/editor/components/AddNodeMenu.test.mjs src/canvas/editor/components/addNodeMenuFlat.test.mjs`（在 `plugins/omnimux-workflow` 下执行）
- 包测试：`pnpm --filter omnimux-workflow test`
- 类型：`pnpm typecheck`
- 静态：`node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:stages`、`pnpm lint:i18n`
- 浏览器证据：工作树内画布 harness（`plugins/omnimux-workflow/scripts/canvas-harness.mjs`，动态端口）+ ego-browser 真实截图。**主证据**落 `.agent-reports/3640-add-node-flat-palette/`（PNG + `report.md` + `browser-facts.json`，交付时 `git add -f`）；`docs/evidence/2026-10-23-add-node-flat-menu-3640/` 为同源副本（`.git/info/exclude` 已排除两处目录，普通 `git add` 拾取不到）。

## 3. 结构与写入边界

| 文件 | 责任 |
|---|---|
| `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.ts` | 固定顺序重排；菜单专属文案表 `ADD_NODE_MENU_LABEL_KEYS` + `addNodeMenuLabelKey()`；分组函数保留但降级为检索别名 |
| `plugins/omnimux-workflow/src/canvas/editor/components/AddNodeMenu.tsx` | 平铺渲染；删除分组标题 / 计数 / 折叠态；保留搜索、命中高亮与空态 |
| `plugins/omnimux-workflow/src/canvas/theme/components.css` | 删除 `.wf-node-menu__group*` 规则；保留搜索 / 命中高亮 / 空态 |
| `plugins/omnimux-workflow/src/canvas/nodes/registry.ts` | `palette.group` 注释改为「检索别名，面板不再渲染分类」 |
| `plugins/omnimux-workflow/src/canvas/i18n/dict.{zh,en}.ts` | 新增 `palette.item.director` / `palette.item.video_composition`；`palette.group.*` 保留为检索别名 |
| `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.test.mjs` | 顺序常量随新标准更新（断言结构不变） |
| `plugins/omnimux-workflow/src/canvas/editor/components/addNodeMenuFlat.test.mjs` | 新增 #3640 契约用例（去分类 / 顺序 / 菜单文案 / 检索） |
| `plugins/omnimux-workflow/tests/e2e/add-node-flat-palette.e2e.test.mjs` | 端到端契约（静态断言型，引用真实浏览器证据） |

## 4. 代码风格与约束

- 零裸色、零 inline 颜色；图标只用既有 lucide 强符号键名，样式只消费既有 `--dsw-alias-*` / `--wb-*` Token。
- 顺序即 `ADD_NODE_PALETTE` 声明顺序，不新增排序函数或第二份清单。
- 菜单文案与节点名是两个事实：节点名继续由 `node.type.*` 拥有，菜单专属文案由 `palette.item.*` 拥有（经 `ADD_NODE_MENU_LABEL_KEYS` 登记），互不覆盖。
- 面板不再渲染分类，也不靠 CSS / 视图遮盖分类；注册表 `palette.group` 元数据保留，仅作为调色板检索别名。
- 既有测试断言属只读评估契约：本次只更新顺序常量并**新增**用例，不删除/改写既有断言；分类元数据与分组函数的删除属于旧标准变更，需独立评审，不在本次范围。

## 5. 测试策略

- `addNodePalette.test.mjs`：顺序常量（`REQUIRED_ORDER` / `REQUIRED_ICONS`）更新为 #3640 标准；其余断言原样保留。
- `addNodeMenuFlat.test.mjs`（新增）：面板源码 / CSS 不再含分组渲染；固定顺序；`addNodeMenuLabelKey` 返回菜单专属键而 `item.labelKey` 仍是节点名；中英文案齐备；检索按菜单文案命中并给出高亮区间。
- `add-node-flat-palette.e2e.test.mjs`（新增）：端到端静态契约 + 引用真实浏览器证据目录。
- 浏览器：工作树内真实浏览器打开面板，截图确认无分类、顺序正确、搜索命中、右键钻取无分类。

## 6. 边界

- 总是：先规格后代码；改 UI 必留工作树真实浏览器证据；保留既有搜索与 Badge 行为。
- 先问：修改画布节点名称、复刻 MiniMax「ComfyUI 工作流」卡、改动搜索算法或关键词来源、删除被既有断言锁定的分类元数据。
- 绝不：在视图层遮盖分类数据；为「看起来没有分类」保留隐藏分组表；改写既有测试断言。

## 假设

用户要的「不要分类」是**面板呈现层**的收敛：面板不再渲染分类标题 / 折叠态，条目顺序由参考截图固定；分类元数据（注册表 `palette.group` + `palette.group.*` 文案）被既有断言锁定为只读评估契约，本次保留并降级为检索别名，删除需独立评审。菜单文案「导演台 / 视频剪辑」与节点名「3D 导演台 / 视频合成」是两个事实，各自单一真源，互不覆盖。

## 证伪方式

若面板仍渲染任何 `.wf-node-menu__group*` 节点（分类标题、计数或折叠箭头），或 `ADD_NODE_PALETTE` 顺序不是 text→table→image→video→audio→director→video_composition→import_asset，或菜单里 director / video_composition 仍显示「3D 导演台」/「视频合成」，或画布节点标题被改成「导演台」/「视频剪辑」，或搜索「导演台」命中的不是唯一一条，则上述假设被证伪。可执行检查：在 `plugins/omnimux-workflow` 下运行 `node --test src/canvas/editor/components/addNodePalette.test.mjs src/canvas/editor/components/addNodePalette.search.test.mjs src/canvas/editor/components/AddNodeMenu.test.mjs src/canvas/editor/components/addNodeMenuFlat.test.mjs`、`pnpm --filter omnimux-workflow test`，并在工作树真实浏览器（画布 harness）中打开面板截图核对。
