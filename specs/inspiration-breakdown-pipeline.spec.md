# 灵感库视频解构升级为逐镜头分镜流水线与复刻通道贯通规格说明 (Issue #2284)

## 1. 背景与目标
当前灵感库的导入解构偏向宏观策略文档（五维文字），存在三大痛点：
1. **逐字稿缺失**：文案多为社媒发帖说明，而非视频真实原声台词，分段脚本常停留在占位状态；
2. **缺乏可执行镜头**：没有结构化逐镜头列表（时间戳、景别、运镜、动作、生图/生视频 Prompt）；
3. **复刻通道断层**：点击“立即复刻”时，Agent 无法获得镜头时序与 Prompt 模版，导致画布与剪辑器无法直接排布时间线。

本特性的目标是将灵感解构内核对齐视频分析流水线（`analyzerPipeline` / `shotsParser`），在保留宏观策略的同时，端到端打通**“真实台词逐字稿 + 逐镜头分镜表 + 结构化复刻通道”**。

## 2. 核心验收准则 (Acceptance Criteria)

| 编号 | 模块 | 输入/前置条件 | 预期行为与结果 |
| :--- | :--- | :--- | :--- |
| **AC-1** | 统一解构内核 | 视频分析完成或语义兜底 | 产出标准的 `deconstruction`，包含 `summary`, `hook`, `target_goal`, `shots`（逐镜头数组，含 `time_range`, `title`, `stage`, `tags`, `description`, `prompt`）及 `structure`，并自动生成对齐镜头的 `segments` 台词字幕。 |
| **AC-2** | 弹窗中间栏呈现 | 视频存在分镜台词/字幕 | 中间栏完整展示真实的逐镜头原声台词列表（带时间戳锚点），彻底消除“分段脚本，即将上线…”的占位状态。 |
| **AC-3** | 弹窗右侧栏呈现 | 视频已完成解构 | 顶部呈现精炼的五维爆款策略（Hook、情绪、核心目标），下方直观呈现结构化【逐镜头分镜卡片】（清晰展示时间范围、4维镜头标签、画面描述与生图提示词）。 |
| **AC-4** | 结构化复刻传参通道 | 用户点击“立即复刻”或“添加到会话” | 传递给会话/Agent 的 Payload 包含结构化的 `shots` 列表与 Prompt 模版槽位，复刻 Skill 可直接用于画布节点铺设与多轨工程生成。 |
| **AC-5** | 优雅降级与兼容 | 存量素材或纯图文素材 | 兼容存量纯文本解构记录，对缺失 `shots` 的存量数据自适应渲染，无异常崩溃与白屏。 |

## 3. 架构与修改范围
1. `plugins/omnimux-inspiration/src/analyzer.js`：
   - 引入并升级分镜解析器逻辑，提取 `shots` 与阶段映射；
   - 升级语义兜底生成器（`generateSemanticDeconstruction`），默认输出标准的 3~5 个代表性镜头；
2. `plugins/omnimux-inspiration/src/client/inspiration-preview-data.js`：
   - 增加对 `deconstruction.shots` 的归一化提取与解析；
   - 将分镜中的台词字幕智能映射为 `segments` 列表；
3. `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`：
   - 中间栏：渲染带时间码与阶段标记的逐字稿台词；
   - 右侧栏：增强分镜卡片展示模块（镜头卡片、时间轴标签、Prompt复制）；
4. `plugins/omnimux-inspiration/src/client/replicate-to-chat.js`：
   - 将结构化分镜 `shots` 纳入向会话传递的标准上下文字段；
5. `plugins/omnimux-inspiration/src/client/styles.js`：
   - 补充逐镜头卡片的极简深色现代化样式。
