# Google Vids 四生成模式 1:1 交互复刻（Issue #3181）

- **Issue**: #3181
- **写域**: `plugins/omnimux-video/`（客户端 + shared 契约 + 路由校验）；`specs/`、`tests/e2e/`
- **风险**: R2（单插件非破坏性功能）
- **依赖**: 中枢 vids2api 通道（#3167）**尚未合入主干**。本票只落地插件端交互与请求契约；真实业务请求在中枢通道合入后接入。
- **调研真源**: `.agent-reports/google-vids-clone/research-google-vids.md`（官方 Help 页双语原文 + 参数矩阵 + 来源冲突记录）
- **上游接口真源**: `vids2api/src/vids/routes.py` 的 `_normalize_video_mode`；中枢侧 `plugins/omnimux/src/media/local-vids.js`（队列分支）

## 1. 目标

把 Google Vids 面板（中栏 `main` 插槽）从「提示词 + 静态规格胶囊」升级为四个 AI 生成模式的完整交互，与 Google Vids 官方流程 1:1：

| 模式（官方中文标签） | 中枢操作 | vids2api `mode` | 必需输入 | 可选输入 |
| --- | --- | --- | --- | --- |
| 创建 | `text_to_video` | 不发送（服务端缺省 create） | 提示词 | — |
| 动画 | `first_frame` | `animate` | 图片素材 1 张 | — |
| 修改 | `video_edit` | `modify` | 源视频 | 替换图 1 张 |
| 延续 | `video_extend` | `extend` | 源视频 | — |

产品拓扑：中栏 = Google Vids（素材生成），右侧分屏 = 视频剪辑（时间线）。生成结果「插入」→ 投递到剪辑器时间线，成为可继续编辑、导出的片段（对应 Google 官方 Insert：片段进入画布并在时间轴获得独立对象轨道）。

## 2. 参数域（真源优先级：上游服务 > 官方 UI）

| 参数 | 取值域 | 默认 | 依据 |
| --- | --- | --- | --- |
| 时长 | 4–12 秒（整数） | 10 | vids2api `max(4, min(12, seconds))`；官方 UI 写 3–10 秒，服务端会静默钳制 → **UI 不得提供 3 秒**，否则等于静默改写 |
| 分辨率 | `720p` / `1080p` / `4k` | `720p` | 中枢通道校验集（官方 UI 只列 720p/1080p） |
| 画面比例 | `landscape` / `portrait` | `landscape` | 中枢通道校验集；UI 文案用官方中文「横向 / 纵向」 |

参数域的唯一真源是 `plugins/omnimux-video/src/shared/veoTaskSpec.js`；UI、请求校验、测试都必须从它派生，不得各自硬编码。

## 3. 验收标准（可测）

- **AC-1 模式契约**：四模式的 `id / label / operation / 必需输入 / 提交按钮文案` 由单一真源导出；`operation` 与中枢映射逐一相等（`text_to_video / first_frame / video_edit / video_extend`）。提交按钮文案：创建/动画/修改 = `生成`，延续 = `提交提示`（官方用词）。
- **AC-2 模式输入收集**：动画模式渲染「添加图片」入口；修改模式渲染「添加视频」+「添加」替换图入口；延续模式要求先选中一个源视频（从结果列表选择，对应官方「选择本会话生成的片段」）。缺必需输入时提交键禁用且给出可读原因，不得静默提交。
- **AC-3 参数控件**：时长/分辨率/比例三个控件可调；取值域来自契约；越界值被拒绝（返回明确错误）而不是静默钳制。延续模式默认继承源片段的参数值（可覆盖）。
- **AC-4 请求契约**：`buildVidsRequest()` 对每个模式返回规范化请求或明确错误：
  - 创建 → `{ operation: 'text_to_video', prompt, seconds, resolution, aspect_ratio }`
  - 动画 → 追加 `image_url`；缺图 → 错误
  - 修改 → 追加 `video_id`（+ 可选 `image_url`）；缺视频 → 错误
  - 延续 → 追加 `video_id`；缺视频 → 错误
  - 空提示词、非法秒数/分辨率/比例 → 错误（错误码稳定可断言）
- **AC-5 结果动作行**：结果卡片提供 `插入`（导入时间线，投递 `{url, title, durationSec, resolution}`）、`重新创建`（同提示词重提交）、`改提示词`（回填输入区）、`延续`/`修改`（带源视频切模式）、`移除`；剪辑器未就绪时 `插入` 给出明确提示而非静默失败。
- **AC-6 文案与规范**：模式标签用官方中文 `创建/动画/修改/延续`；参数文案 `时长/分辨率/画面比例`、比例选项 `横向/纵向`；不新增客户端黑名单式遮盖。
- **AC-7 回归**：`pnpm --filter omnimux-video test` 全绿；仓库门禁 `pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs` 通过；受影响的既有 e2e（`tests/e2e/google-vids-split-stage.e2e.test.mjs` 的文案真源断言）随之更新并全绿。
- **AC-8 真实浏览器证据**：隔离工作树 Web QA 逐模式走查（模式切换、输入收集、参数控件、结果动作），留存截图与逐条结果。

## 4. 用户关键操作旅程

1. 从「探索 → Google Vids」进入中栏面板；右侧分屏打开剪辑器（既有入口流程）。
2. 默认落在「创建」：输入提示词 → 调时长/分辨率/比例 → 点「生成」→ 结果卡片出现。
3. 切「动画」：点「添加图片」选图 → 描述运动 → 「生成」；不选图时提交键禁用并说明原因。
4. 切「修改」：从结果里选一个片段作为源视频 → （可选）加替换图 → 描述改动 → 「生成」。
5. 切「延续」：选中源片段 → 参数默认继承 → 描述后续 → 「提交提示」。
6. 任一步骤的结果卡片点「插入」→ 片段进入右侧时间线，可继续剪辑与导出。

## 5. 新用户基线

全新用户没有本机 vids2api 服务、没有剪辑工程。面板必须在两者缺失时给出可读的下一步（剪辑器未就绪 → 提示先创建工程；生成通道未配置 → 提示配置服务地址），**不得**回退到任何开发机专有默认值（无回环地址字面量、无本地路径）。本票不引入新的外部依赖。

## 6. 不在范围

- 真实业务请求接入（等 #3167 中枢通道合入主干后单独接入）。
- 剪辑器内部时间线能力（OpenReel 供应商代码）。
- 官方未公开且需真机确认的项：进度百分比/取消按钮/排队文案/模型选择器/失败态文案（调研报告 §6 已列 15 项 cannot-verify）；本票按现有进度语义保留，不新增未经验证的控件。

## 7. 证据计划

- 单测：`veoTaskSpec.test.js`（契约与校验）、`veoContracts.test.js`（服务端接受四模式请求）、`veo-routes.test.js`（字段透传）。
- 端到端契约：`tests/e2e/google-vids-four-modes.e2e.test.mjs`（模式→操作映射、文案真源、参数域、请求构造）。
- 真实浏览器：`.workbuddy/qa-journeys/vids-four-modes-3181.mjs` + 逐模式截图，写入 `docs/evidence/google-vids-four-modes-3181/report.md`。
