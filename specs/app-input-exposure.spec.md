# 发布为 AI 应用：输入项与配置项可选化

- Issue: #1994
- 基线: `origin/main` @ `104486c6e`
- 任务工作树: `.worktrees/workflow-app-inputs-optional`
- 产品方案: `.agent-reports/publish-ai-app-inputs/pm-plan.md`（本规格是其可执行化）

## 1. 目标（Objective）

发布者在创作画布把工作流发布成 AI 应用时，必须能逐项决定「哪些交给终端用户填、哪些由我固定」，且推荐项默认开启。当前实现只处理入度 = 0 的根输入（默认暴露且必填、不可取消），节点级生成参数全部默认隐藏且散落在折叠区，发布者无法表达自己的意图。

用户故事：

- 作为发布者，我打开发布向导第 2 步，能看到全部候选项按「素材输入 / 文本输入 / 生成配置」分组，每个候选一行，带有推荐标记与一句话理由。
- 作为发布者，我可以逐项开关「展示给用户」，并对放开的项决定是否必填；可以一键恢复推荐设置。
- 作为发布者，当我一项都没放开时，界面明确提示用户会看到空表单，且发布被拦下。
- 作为终端用户，我打开应用只看到发布者放开的字段，其余按作者设定执行，并在底部看到一行「以下由作者设定」的摘要。

## 2. 命令（Commands）

在任务工作树内执行（工作目录 = `.worktrees/workflow-app-inputs-optional`）：

- 工作流插件测试：`pnpm --filter omnimux-workflow test`
- 应用插件测试：`pnpm --filter omnimux-apps test`
- 类型检查：`pnpm --filter omnimux-workflow typecheck`；`pnpm --filter omnimux-apps typecheck`
- 浏览器验收：任务工作树内私有动态端口运行器 + 真实浏览器（见第 6 节）

## 3. 项目结构（Project Structure）

| 位置 | 职责 |
| --- | --- |
| `plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts` | 候选识别与推荐默认规则（纯函数） |
| `plugins/omnimux-workflow/src/canvas/editor/components/publish/publishTypes.ts` | 候选字段与应用清单类型 |
| `plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx` | 发布向导第 2 步界面 |
| `plugins/omnimux-apps/src/shared/manifest.ts` | 应用清单契约（消费端） |
| `plugins/omnimux-apps/src/shared/schemaValidator.ts` | 清单校验 |
| `plugins/omnimux-apps/src/client/AppFormPanel.tsx` + `apps.css` | 终端用户表单渲染 |
| `plugins/omnimux-workflow/src/.../topologyAnalyzer.test.mjs`、`plugins/omnimux-apps/src/client/appFormPanel.test.mjs` | 单元测试 |

## 4. 代码风格（Code Style）

沿用仓库既有约定：TypeScript + React 函数组件、`memo`、内联样式消费宿主语义 Token（`var(--dsw-alias-*)`），禁止裸十六进制与 Emoji 图标；纯函数逻辑放 `topologyAnalyzer.ts` 并导出以便单测。

```ts
export type InputGroupId = 'asset' | 'text' | 'config';

/** Default exposure for one candidate, derived from its rule branch. */
interface CandidateDefaults {
  group: InputGroupId;
  isRecommended: boolean;
  recommendedRequired: boolean;
  rationale: string;
}
```

## 5. 测试策略（Testing Strategy）

- 单元测试（node:test）：规则表逐一断言默认分组、推荐暴露、推荐必填、固定值摘要；清单生成断言固定摘要不进入表单字段。
- 静态契约测试：表单面板的固定摘要与空态选择器存在（沿用现有源码断言风格）。
- 浏览器验收：真实浏览器内打开发布向导与用户端表单，验证开关联动、固定摘要、空态与校验。

## 6. 边界（Boundaries）

- 总是：改动只覆盖发布向导、拓扑分析与用户端表单渲染；保持既有三步向导结构与发布流程；改完跑两个插件的测试与类型检查。
- 先问：修改执行链路、模型路由、存储接口以外的跨插件契约；新增运行时依赖。
- 绝不：改执行器与宿主源码；删除既有失败测试来"变绿"；提交未验证的声明。

## 7. 验收用例（可观察）

| ID | 步骤 | 期望 |
| --- | --- | --- |
| AC-101 | 对「提示词 → 视频生成（参数含比例、种子、放大开关）」运行拓扑分析 | 提示词分组为文本输入、推荐暴露且推荐必填；比例分组为生成配置、推荐暴露且非必填；种子与放大开关推荐不暴露 |
| AC-102 | 生成表单配置（上述默认） | 表单属性含提示词与比例；固定摘要含种子与放大开关的显示值；固定摘要字段不出现在表单属性中 |
| AC-103 | 内部字段（含 `localPath` 等键）参与分析 | 标记为内部字段，推荐不暴露，且不进入表单与固定摘要 |
| AC-104 | 发布向导第 2 步默认渲染 | 三个分组标题同时出现；概览句给出「用户将填写 N 项，其中 M 项必填」 |
| AC-105 | 关闭任一项、再点恢复推荐设置 | 关闭后该项进入固定摘要（有值时）；恢复后回到推荐组合 |
| AC-106 | 全部关闭 | 概览句转为告警文案；点击发布被拦截并回到第 2 步 |
| AC-107 | 用户端表单渲染带固定摘要的清单 | 出现「以下由作者设定」摘要行与固定值标签；不出现对应输入控件 |
| AC-108 | 用户端表单渲染空清单（老清单或空表单） | 显示空态文案与禁用主按钮，不抛错 |

## 8. 假设与开放问题

- 假设：推荐规则只依赖拓扑与参数键名，不读取模型成本档位（P1 再接入）。
- 开放问题：是否需要在向导第 3 步（封面与预览）提供用户端表单的完整预览；本任务不做。
