# Spec: 修复视频拆解分析工具大模型视听拉片接线断开降级假数据问题

## 1. 业务目标与价值
用户调用 \`video_breakdown_analyze\` 对视频（本地视频或网络视频）进行深度结构拆解时，系统应真正驱动底层的多模态大模型进行高保真视听拉片，提取真实的画面事件、动作描述、原声台词转写（对白）以及商业营销漏斗五阶段结构；彻底解决因服务接线缺失导致静默降级为固定模板假数据（如固定的 4 个假分镜、标题固定叫“短视频分析”、作者固定叫“Creator”、对白台词完全缺失）的问题。

## 2. 根因定位与技术方案
1. **声明服务依赖注入**：
   - \`plugins/omnimux-video-preview/src/index.js\` 的 \`inject\` 声明由 \`['tools']\` 扩展为 \`['tools', 'textComplete']\`（同时保留动态按需防御机制）；
   - \`plugins/omnimux-video-preview/dsh.manifest.json\` 中的 \`seamsConsumed\` 补齐声明 \`"textComplete"\`；
2. **多模态服务消费兼容性增强**：
   - \`plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js\` 中的 \`queryDirectTextComplete\` 增强直接属性访问：优先读取 \`ctx.textComplete ?? (typeof ctx.get === 'function' ? ctx.get('textComplete') : null)\`；
3. **分镜解析与时间戳对齐健壮性**：
   - 当多模态模型返回标准结构化分镜表及原声台词时，完整保留真实的分镜数量、原声台词、画面细节与商业漏斗；
   - 修复物理切镜切点与大模型故事节拍的平滑融合，防止因物理切点数量不一致或提示词噪音导致意外降级；
4. **视频信息元数据标注**：
   - 当成功通过多模态 AI 生成真实拉片数据时，标记 \`ai_labeled: true\`，并将视频标题智能提炼为基于画面首镜或核心亮点的真实描述，不再死板填充“短视频分析”。

## 3. 新用户基线（Product Baseline）
- 本功能不依赖任何本地未公开的开发机专有端口或专有代理；
- 遵循统一 Hub 模型契约：视频多模态直接走 \`textComplete\` 契约通道（由中枢已配置的 \`gemini-3.8-flash\` 等支持视频模态的多模态模型服务接入）。

## 4. 验收标准（Acceptance Criteria）
1. **单元测试验收**：
   - \`plugins/omnimux-video-preview/test/breakdown.test.js\` 补齐多模态接线与大模型深度拉片测试；
   - 验证 \`ctx.textComplete\` 能够被直接识别并执行，分镜解析提取真实台词与动作描述；
2. **端到端测试验收**：
   - 在真实本地视频样本上运行 \`video_breakdown_analyze\`，输出分镜数量与真实内容匹配，且携带原声台词；
3. **测试通过率**：
   - \`pnpm --filter omnimux-video-preview test\` 100% 绿灯。
