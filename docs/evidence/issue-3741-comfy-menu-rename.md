# Issue 3741 · 移除菜单里的 ComfyUI 工作流入口 + 「ComfyUI 页面」改名为「ComfyUI 工作流」

- 工作树：`.worktrees/comfy-menu-rename`（分支 `agent/comfy-menu-rename-issue-3741`）
- 一句话：画布上原来有两处 ComfyUI 入口、名字还撞车；现在只剩一处，名字统一为「ComfyUI 工作流」。

## 交付

| 类别 | 内容 |
| --- | --- |
| 删入口与功能 | 右键菜单/钻取面板里的「ComfyUI 工作流」入口行、`isComfyView` 导入面板视图（导入动作 + 最近记录列表）、只服务它的 props/订阅/状态、`comfyRecents` 模块与其测试、入口专用死 CSS（`.wf-node-menu__entry*` / `__footer` / `__section`）；`workflowTransferStore` 的 `recents` / `applyRecent` / `pendingComfy` / 缓存写入一并移除 |
| 改名 | 节点类型名、节点卡标题、全屏层标题、搜索关键字：「ComfyUI 页面」→「ComfyUI 工作流」（中英双语 `ComfyUI workflow`）；清掉 9 个因此不再被引用的 i18n 键 |
| 未动 | 内部节点 type 仍是 `comfy-page`（既有工作流文件照读）；工具栏文件导入与 transfer store 通用部分不变；托管后端、状态机、方案矩阵、目录设置全不涉及 |

## 真实浏览器验收（10 项断言全过，无注入态）

装置：`comfy-menu-rename` 工作树自己的 harness（端口 59820），1728×883。

| 断言 | 实际值 |
| --- | --- |
| ① 加节点菜单 | 标题「添加节点」、9 项；ComfyUI 相关**恰好 1 项**＝最后一项「ComfyUI 工作流」（`.wf-node-menu__label`）；`.wf-node-menu__entry` = 0 |
| ① 搜索 | 搜「工作流」唯一命中「ComfyUI 工作流」 |
| ① 英文界面 | 标题「Add Node」、9 项、唯一一项「ComfyUI workflow」 |
| ② 右键菜单 | 7 行（导入素材/添加节点/撤销/重做/创建工作流/粘贴/全选），**无 ComfyUI 行**、entry = 0 |
| ② 钻取面板 | 8 项，仍恰好 1 项「ComfyUI 工作流」，有返回按钮；全文档再扫 button/menuitem/a，除加节点面板外没有第二处 ComfyUI 可点入口 |
| ③ 标题 | 节点卡 `.wf-node-header__label` 与全屏层 `.wf-comfy-page-overlay__title` 都是「ComfyUI 工作流」 |
| ④ 通用导入 | `.wf-transfer-input` 投喂真实 JSON → 确认面板 → 「导入并替换画布」→ 画布出现 1 个节点（这条路径未被误删） |
| ⑤ 既有文件 | 按改名前格式手写的既有文件（type=comfy-page、schemaVersion=1）导入正常并显示新名字；节点 id / store type / frame class 仍是 `comfy-page` |

截图：`issue-3741-01-palette-renamed.png`、`issue-3741-02-context-menu-clean.png`，佐证 5 张（`-01b-search-workflow`、`-03-palette-english`、`-02b-drill-panel`、`-04-card-and-overlay-title`、`-05-imported-legacy-file`）；逐项实际值见 `issue-3741-step1.json`。

## 删掉的用例（7 条，已在 spec 登记）

`plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` 整文件随模块删除（3669 的 7 条：畸形内容退回空列表、编解码往返与截断、同名替换与淘汰、空名/超体积不入缓存、存储不可用时降级、读回写入内容、时间格式）。spec `## 旧标准变更` 逐条按完整路径登记，并用门禁自己的解析器自验 `missing=[]`。

## 自动化检查

画布 6 个测试文件 **32/32**；整包 **3035/3035**；`typecheck` 退出码 0；`verify-anti-slop` 3/3；`git diff --check` 干净。

## 顺带发现的既有缺口（非本任务引入）

规格里写的「拖拽工作流 JSON 进画布」这条路径**实际上不存在**：把文件拖到画布上没有任何反应，且改名前 `onFileDrop` / `onFilesDrop` 在 `origin/main` 上就没有调用方。被删的入口用的是同一个工具栏文件选择器，那条路仍然可用。本任务未改动它；要不要补真正的拖拽落盘属另一件事。
