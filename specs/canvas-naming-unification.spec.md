# 画布命名统一规格（Canvas Naming Unification Spec）

- Issue：#1820
- 基线：`origin/main` @ 89b54fc43
- 工作树：`.worktrees/common-canvas-naming-issue-1820`（分支 `agent/common-canvas-naming-issue-1820`）
- 风险：R1（纯面向用户文案收敛，无行为变更）

## 1. 目标

产品内存在两个不同类型的画布，用户无法区分。统一命名后，**「画布」不再作为泛称使用**：

| 概念 | 唯一名称 | 英文 |
| --- | --- | --- |
| 工作流编排画布（节点 / 连线 / 模型编排） | **创作画布** | Creative Canvas |
| 图像生成与精修画布（大图 / 候选 / 打点评论） | **图像生成** | Image Generation |

## 2. 现状：同一概念存在多个名字

| 界面位置 | 现状文案 | 目标文案 |
| --- | --- | --- |
| 项目页主标题 | 无限画布 | 创作画布 |
| 项目列表页标题 | 创作画布 | 创作画布（不变） |
| 打开项目后的页签名 | 创作画布 | 创作画布（不变） |
| 设置 - 模型默认项标题 | 画布默认模型 | 创作画布默认模型 |
| 设置 - 模型默认项说明 | 配置工作流画布新建节点时的默认模型 | 配置创作画布新建节点时的默认模型 |
| 登录页卖点 | 专业工作流画布与 Skill | 专业创作画布与 Skill |
| 应用页提示 | 在工作流画布中点击顶栏「发布为 AI 应用」 | 在创作画布中点击顶栏「发布为 AI 应用」 |
| 剪辑页签 | 画布联动模式 | 创作画布联动模式 |
| 剪辑自动建项目名 | 画布视频合成 | 创作画布视频合成 |
| 图片卡片悬浮按钮 | 画布 | 图像生成 |
| 图片卡片 title / 按钮 title / aria-label | 点击进入画布模式 / 进入画布模式 | 点击进入图像生成 / 进入图像生成 |
| 看图页签名 | 图片浏览 | 图像生成 |

## 3. 验收标准（可观察、可验证）

### 文案层（单元 / 断言）

- **AC-1**：`zh['workflow.pageTitle'] === '创作画布'`，`en['workflow.pageTitle'] === 'Creative Canvas'`；`zh['details.canvasTab'] === '创作画布'`。
- **AC-2**：`zh['mediaViewer.tabTitle'] === '图像生成'`，`en['mediaViewer.tabTitle'] === 'Image Generation'`。
- **AC-3**：`zh['auth.gate.feature2']`、`zh['models.title']`、`zh['models.description']` 三处不含「工作流画布」「画布默认模型」等泛称，均为「创作画布」表述；英文侧对应项含 `Creative canvas`。
- **AC-4**：消息卡片悬浮按钮 `textContent === '图像生成'`，`title` 与 `aria-label` 均为「进入图像生成」，卡片 `title` 为「点击进入图像生成」。
- **AC-5**：`WORKBENCH_TAB_TITLE_FALLBACKS['omnimux:media-viewer'] === '图像生成'`，`['omnimux-workflow:canvas'] === '创作画布'`。
- **AC-6**：`projectCanvas` 页签标题兜底值为「创作画布」；`useCanvasIngestion` 自动建项目名为「创作画布视频合成」。

### 真实性层（隔离工作树内真实浏览器 Web 验证）

- **AC-7**：真实浏览器加载隔离工作树构建产物，页面渲染出的可见文案中，「创作画布」与「图像生成」各自出现在预期位置；**不得**再出现「无限画布」「图片浏览」「工作流画布」作为独立文案。
- **AC-8**：证据落盘 `<root>/tmp/canvas-naming/`：至少 1 张 PNG 截图 + 1 份结构化报告（断言清单与逐项结果、无 JS 报错）。

### 边界层

- **AC-9**：内部标识零改动——`omnimux:media-viewer`、`omnimux-workflow:canvas`、CSS 类名、存储键、函数名保持原样（`git diff` 中不出现标识符改名）。
- **AC-10**：受影响测试全绿；未改动的测试文件不得因本次改动变红。

## 4. 验证命令

```bash
# 工作树根目录执行
pnpm --filter omnimux test
pnpm --filter omnimux-workflow test
pnpm --filter omnimux-apps test
pnpm --filter omnimux-clip test
```

## 5. 证据落盘

- **主证据（真实 Host + 真实浏览器端到端）**：`plugins/omnimux/src/client/comment-native.e2e.test.js` 在隔离工作树内运行——把工作树的 `plugins/omnimux` 装入临时 profile、起真实 Host（动态端口、隔离 DSH_HOME）、由 ego-browser 走完整交互（含点击 `[title="点击进入图像生成"]` 进入图像生成画布并添加评论），产出 `ready.png` / `removed.png` / `failure.png` 截图与 `browser.json`、`comment-pre-step-decision.json` 结构化结果。
  证据目录：`<root>/.agent-reports/comment-only-send/formal/<runId>/`。
- **补充入口**：`pnpm verify:app`（隔离工作树内完整应用 Web 验收），证据落 `<root>/.workbuddy/evidence/app-qa/<runId>/`。
- 以上目录均在物化洁净门禁的忽略清单内（`.agent-reports/`、`.workbuddy/`、`tmp/`）。

## 6. 改动范围边界

### 6.1 本次已改（含独立评审补充的旧名残留）

- 界面文案：工作流侧统一「创作画布」、图像侧统一「图像生成」（页签名、卡片按钮、项目页标题、设置项、登录页卖点、应用页提示、剪辑页签与自动建项目名、看图画布页签名）。
- 旧名清除：`plugins/omnimux-workflow/dsh.manifest.json`、`plugins.registry.json`（原「无限画布」）；`scripts/build-agent-presets.mjs` 与 `presets/tiktok-agent/agent.cordis.yml`（原「工作流画布」，属对外话术，用户会看到 Agent 如此称呼）。
- 中英对齐：`plugins/omnimux-clip/src/client/index.js` 英文侧 `tab.canvasMode` 原为 `Canvas Link Mode`，随中文一并改 `Creative Canvas Link Mode`。
- 契约同步：`docs/contracts/gxgen-workflow-migration.md` 原写「UI 文案尽量说『画布』」，与新命名标准冲突，改「统一说『创作画布』」，并把 `canvas.json` 描述由「一张无限画布文档」改「一张创作画布文档」。

### 6.2 明确不在本次范围（另行收敛）

下列位置同样含「画布」，但属**创作画布内部自指**——用户身处该画布内、语境唯一，不构成两个画布的区分障碍；改动量 30+ 处并需连带同步多条测试断言，按"最小实现满足当前需求"原则另行收敛：

- `plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts` 的 12 条字典值（「画布产物」「从画布添加」「画布尚未保存」等）。
- `src/canvas/` 下的错误提示（`CanvasErrorBoundary`、`useWorkspacePersistence`）、快捷键说明（`ShortcutsModal`）、toast（`AssetsDrawer`、`videoComposition`）、资源选择文案（`VirtualDataGrid`、`ProjectAssetsView`、`SubjectLibraryView`）。
- `tableTools.ts` 的 Agent 可见表格工具描述。
- 历史设计文档（`docs/contracts/multimodal-creative-agent-architecture.md`、`plugin-agent-tools-inventory.md`）与 Agent 工具评估数据集 `scripts/agent-tools-suite/dataset.json`。

### 6.3 非目标

- 不重命名内部标识符、页签 id、CSS 类名与存储键。
- 不改动技能市场内容资产（`video-generate-canvas` 技能展示名）。
- 不新增 i18n 机制：卡片按钮按现有硬编码方式改文案，不引入新的 key 体系。
