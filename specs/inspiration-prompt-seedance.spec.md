# 需求规格：灵感社区基于内容拆解生成同款 Prompt 并对齐 seedance 2.5 与 GPT image 2.5 默认模型（Issue #2047）

## 一、目标与业务背景 (Objective & Background)

灵感社区是以提示词（Prompt）分享与同款复刻为核心的灵感中枢。用户在发布灵感时，核心诉求是能够直接分享一套可直接驱动视频/图像生成模型出片的高质量 Prompt，而不是直接发送原视频的社媒口播文案。

本任务目标：
1. **内容拆解转生成 Prompt 引擎**：
   - 视频灵感：系统基于已有内容解构（包含黄金 3 秒 Hook、画面景别、运镜轨迹、动作演进、光影与叙事节奏），自动提取并组合生成一套可直接驱动视频生成大模型（如 Seedance 2.5）同款出片的专业视觉提示词；
   - 图像灵感：基于画面主体、构图、光影色彩提炼出适合图像生成大模型（如 GPT Image 2.5）出图的结构化提示词；
   - 若灵感尚未完成视频拆解，则基于标题、文案内容与核心视觉标签提取高质量生成提示词，确保永不阻断。
2. **发布流程新增「生成Prompt」独立步骤**：
   - 本地发布状态机阶段由 `[preparing, uploading, publishing]` 扩展为 `[preparing, generating_prompt, uploading, publishing]`；
   - 云端发布状态机阶段由 `[preparing, publishing]` 扩展为 `[preparing, generating_prompt, publishing]`；
   - 客户端弹层进度组件展示真实的「生成Prompt…」进行态与已完成指示灯。
3. **发布分类与默认模型对齐**：
   - 视频灵感发布：分类自动归入 `seedance 2.5`，关联模型标记为 `seedance-2-5`；
   - 图像灵感发布：分类自动归入 `GPT image2.5`，关联模型标记为 `gpt-image-2.5`；
   - 系统中枢与设置页：`defaultVideoModel` 默认视频模型全面收敛为 `seedance-2-5`，`defaultImageModel` 保持为 `gpt-image-2.5`。

---

## 二、关键用户旅程 (Critical User Journeys)

### CUJ-1: 用户分享视频灵感（本地或云端）
1. 用户在灵感社区卡片上点击「分享」，弹层弹出并点击「创建链接」；
2. 进度条首先显示「准备素材…」；
3. 随后流转进入新增的「生成Prompt…」步骤，系统根据内容解构自动提取生成一套适合 Seedance 2.5 的同款视频提示词；
4. 随后推进到「上传素材…」（本地）与「发布中…」；
5. 发布请求提交到统一接口 `POST /api/inspiration/v1/share`，其 `category` 为 `seedance 2.5`，`model` 为 `seedance-2-5`，`prompt` 为生成的同款提示词；
6. 弹窗展示成功生成的专属永久或有效分享链接。

### CUJ-2: 用户分享图片灵感
1. 用户在图片类灵感卡片上点击「分享」并创建链接；
2. 进度条依次经历准备素材、生成Prompt、上传、发布；
3. 发布数据中 `category` 归入 `GPT image2.5`，`model` 为 `gpt-image-2.5`，`prompt` 为图片同款出图提示词。

### CUJ-3: 系统默认生成模型生效
1. 客户端设置页与创作画布新建节点时，视频默认模型为 `seedance-2-5`，图片默认模型为 `gpt-image-2.5`。

---

## 三、验收标准 (Acceptance Criteria)

- [ ] **AC-1 (阶段扩展)**：`SHARE_STAGES` 包含 `GENERATING_PROMPT: 'generating_prompt'`。本地发布走四步，云端发布走三步，客户端包含中文 `'生成Prompt…'` 与英文 `'Generating prompt…'`。
- [ ] **AC-2 (视频提示词合成)**：`buildDirectGenerationPrompt` 函数在输入视频解构数据时，能准确提炼主体画面、运镜轨迹与视觉细节，输出用于直接生成视频的提示词。
- [ ] **AC-3 (视频分类与模型)**：视频灵感发布时，元数据 `category` 为 `'seedance 2.5'`，`model` 为 `'seedance-2-5'`。
- [ ] **AC-4 (图片分类与模型)**：图片灵感发布时，元数据 `category` 为 `'GPT image2.5'`，`model` 为 `'gpt-image-2.5'`。
- [ ] **AC-5 (系统设置默认值)**：`SETTINGS_DEFAULTS.defaultVideoModel` 为 `'seedance-2-5'`，`SETTINGS_DEFAULTS.defaultImageModel` 为 `'gpt-image-2.5'`。
- [ ] **AC-6 (自动化与浏览器实测)**：全量单元测试通过，在隔离真实 Chromium 环境中跑通包含「生成Prompt」步骤的完整分享链路并截图留存。
