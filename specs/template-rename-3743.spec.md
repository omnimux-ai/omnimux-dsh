# 旧「工作流」概念统一改名为「模板」（Issue #3743）

## 背景

新增 ComfyUI 工作流入口后，画布上同时存在两个「工作流」概念：

1. **打组 / 组容器 / ComfyUI 工作流** —— 画布内的执行与编辑单位；
2. **存成可复用模板的老工作流** —— 把画布或组保存进模板库、之后可插入复用。

用户反馈：两个概念都叫「工作流」，无法区分。要求把②的 UI 文案统一改为「模板」。

## 范围（仅 UI 文案；不改标识符、i18n key 名、API、存储格式）

用户已确认范围 **A+B**：凡是不带 ComfyUI 前缀的「工作流」UI 文案统一改为「模板」，包括组容器本身（右键创建工作流→创建模板、删除工作流→删除模板、组名 工作流-N→模板-N）。ComfyUI 工作流相关文案不动。「导出/导入工作流」及文件传输（transfer.*）保持「工作流」。

### 改为「模板」

| i18n key | 中文原值 | 中文新值 | 英文新值 |
| --- | --- | --- | --- |
| `group.saveWorkflow` | 保存工作流 | 保存模板 | Save template |
| `group.saveWorkflowTitle` | 导出为可复用工作流模板 | 导出为可复用模板 | Export as a reusable template |
| `group.createWorkflowTitle` | 导出为可复用工作流模板 | 导出为可复用模板 | Export as a reusable template |
| `template.modal.title` | 创建可复用工作流模板 | 创建可复用模板 | Create reusable template |
| `template.modal.name` | 工作流名称 | 模板名称 | Template name |
| `template.modal.namePlaceholder` | 例如：夜景人像精修工作流 | 例如：夜景人像精修模板 | e.g. Night portrait retouch template |
| `template.modal.defaultName` | 新建工作流模板 | 新建模板 | New template |
| `template.modal.descriptionPlaceholder` | 简要说明该工作流的… | 简要说明该模板的… | What this template does… |
| `template.modal.nameRequired` | 请输入工作流名称 | 请输入模板名称 | Enter a template name |
| `template.modal.saved` | 工作流「{name}」已保存到模板库 | 模板「{name}」已保存到模板库 | Template “{name}” saved to the template library |
| `template.modal.failed` | 创建工作流失败 | 创建模板失败 | Failed to create template |
| `template.panel.title` | 工作流模板 | 模板 | Templates |
| `template.panel.newWorkflow` | 新建工作流 | 新建模板 | New template |
| `template.panel.empty` | 还没有工作流模板 | 还没有模板 | No templates yet |
| `toolbar.insertTemplate` | 插入工作流模板 | 插入模板 | Insert template |
| `toolbar.insertTemplateEmpty` | 还没有可插入的工作流模板 | 还没有可插入的模板 | No reusable templates yet |
| `menu.createWorkflow` / `group.createWorkflow` | 创建工作流 | 创建模板 | Create template |
| `group.publishAppTitle` | 将当前工作流发布为独立 AI 应用 | 将当前模板发布为独立 AI 应用 | Publish this template as an AI application |
| `group.ungroupGroupTitle` | 解体当前工作流并释放节点 | 解体当前模板并释放节点 | (en 同步) |
| `group.deleteWorkflow` | 删除工作流 | 删除模板 | Delete template |
| `group.deleteWorkflowTitle` | 删除当前工作流 | 删除当前模板 | Delete this template |
| `group.deleteConfirm` | …删除工作流「{name}」 | …删除模板「{name}」 | …delete template “{name}” |
| `group.toast.emptyWarn` | 当前工作流内尚无节点 | 当前模板内尚无节点 | This template has no nodes yet |
| `group.toast.deleted` | 已删除工作流 | 已删除模板 | Template deleted |
| `exec.runAllTitle` | 执行整个工作流（按拓扑分层并行） | 执行整个模板（按拓扑分层并行） | Run the whole template… |
| `asset.modal.defaultTags` | AIGC, 工作流生成 | AIGC, 模板生成 | AIGC, template |
| `projects.appsEmptySubtitle` | 把工作流打组后点「发布应用」 | 把模板打组后点「发布应用」 | — |
| `projects.appEditOpened` | 未能定位到工作流组 | 未能定位到模板组 | — |
| 组自动命名 | 工作流-N | 模板-N | — |
| `FALLBACK_PROJECT_TITLE` / 默认工作区名 / 添加到会话标签 | 工作流 | 模板 | — |
| `WorkspaceStore` 默认名 | 未命名工作流 | 未命名模板 | — |
| `appLibrary.wrapNodesInGroup` 默认标题 | 工作流 (副本) | 模板 (副本) | — |
| PublishWizard / topologyAnalyzer 内嵌文案 | 当前工作流… / 工作流的起始输入 | 当前模板… / 模板的起始输入 | — |

另：`app.autosave.conflict` / `app.conflictBanner` 指整个画布工程，改为「画布已在别处更新」（避免误称模板）。

### 不改（保持「工作流」）

- `toolbar.exportWorkflow` / `toolbar.importWorkflow` / `transfer.*`（.json 工作流文件的导入导出，与 ComfyUI 工作流文件互操作语境一致）；
- `comfy.*`（ComfyUI 工作流入口与面板）；
- `template.panel.*` 其余键（count/searchPlaceholder/noMatch/loading/loadFailed/delete 等本就无「工作流」字样或已正确）；
- `stage.title`、`workflow.featured.*`、`projects.empty*`（分别指一级页与「项目」占位，本轮不动；另议）；
- Agent 工具描述与 `plugins.registry.json`（面向 Agent 的内部语义，本轮不动）。

同步修改引用上述字符串断言的测试；组件 JSX 中若硬编码相同文案一并更新。

## 假设

- 用户意图仅是消除「存模板」与「打组 / ComfyUI 工作流」的命名冲突，不要求改存储层术语与字段；
- 「导出/导入工作流」的文件传输语义用户认可保留「工作流」，与「ComfyUI 工作流」文件互操作语境一致；
- 英文侧对应改为 Template，ComfyUI workflow 保留。

## 证伪方式

- 若用户在截图中期望右键「创建工作流」也改名，则以 `menu.createWorkflow` 的反馈为准，再开 Issue 调整组概念命名；
- 若「导出工作流」在界面上造成歧义，用户验收截图后可追加改名；
- 若测试断言锁定旧文案且属于本次范围外，记录差异并回滚该项。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/i18n/i18n.test.mjs` :: `i18n: 分组 / 模板 / 资产入库 key 中英都有值`
  - 原断言：`t('template.modal.defaultName')` 期望 `新建工作流模板` / `New workflow template`。
  - 必须改的理由：本任务把默认模板名改为「新建模板 / New template」。
  - 新期望证据：`t('template.modal.defaultName')` 期望 `新建模板` / `New template`。

## 新用户基线

本改动只涉及文案字符串，全新用户安装后立即可见新文案；不依赖任何本机服务、凭据或开发机状态。

## 验收用例

1. 右键菜单显示「创建模板」；空白画布右键建出的组自动命名为「模板-1」；
2. 组顶栏显示「保存模板」，悬停提示「导出为可复用模板」；删除项显示「删除模板」；
3. 模板面板标题为「模板」，入口卡为「新建模板 / 把当前画布保存为可复用模板」，空态「还没有模板」；
4. 新建模板弹窗标题「创建可复用模板」，名称输入框 label「模板名称」，默认名「新建模板」；
5. 「添加节点」面板底部仍是 ComfyUI 工作流入口；工具栏「导出/导入工作流」保持原样；
6. `pnpm --filter omnimux-workflow test` 相关单测全绿；`git diff --check` 通过；
7. 真实浏览器打开画布验证上述文案并留存截图。
