# Spec: seed-audio-1.0 本地音色库查询工具（omnimux_audio_voices）

- Issue: #2269
- 风险: R2（单插件功能增强）
- 依据: `plugins/omnimux/src/catalog/voices/volcengine-voice-index.json`（本地 509 款官方规范化音色库）

## 1. 目标与用户故事

**用户目标**：用户在与智能体对话时，希望智能体能够根据具体的业务场景或风格（例如“找一个悬疑电影解说男声”、“找一个适合带货的热情女声”、“找一个讲故事的成熟大叔声”）直接查询本地音色库，推荐并提供对应的 `voice` 标识，以便在后续调用 `omnimux_audio_submit` 生成语音时使用。

**关键旅程**：
1. 智能体根据用户提问调用 `omnimux_audio_voices`，传入关键词（如 `query: "顾姐"` 或 `category: "通用场景"` 或 `tag: "剪映同款"`）；
2. 工具本地检索 `volcengine-voice-index.json` 索引数据，快速返回匹配的音色清单（含中文名、voice_type、性别、分类、标签等）及匹配总数；
3. 智能体将清晰的音色推荐和代码回复给用户，或直接填入 `omnimux_audio_submit` 的 `voice` 参数中执行语音生成。

## 2. 详细接口设计

### 2.1 工具定义
- **工具名称**：`omnimux_audio_voices`
- **描述**：`Query available voices for speech synthesis models (default seed-audio-1.0, 509+ voices). Supports filtering by keyword query (name/display_name/voice_type), category, gender, tag (e.g. 剪映同款, 抖音同款, 豆包同款), and pagination.`
- **参数 Schema**：
  - `model` (string, 可选): 模型 ID，默认 `seed-audio-1.0`
  - `query` (string, 可选): 搜索关键词，不区分大小写匹配 `name`, `display_name`, `voice_type`, `category`, `accent`
  - `category` (string, 可选): 场景分类（如 "通用场景", "角色扮演", "有声阅读", "外语音色" 等）
  - `gender` (string, 可选, enum: `["male", "female"]`): 性别筛选
  - `tag` (string, 可选): 标签过滤（如 "剪映同款", "抖音同款", "豆包同款" 等）
  - `language` (string, 可选): 语言过滤（如 "中文", "英语" 等）
  - `limit` (number, 可选, 默认 20, 上限 100): 返回结果数量
  - `offset` (number, 可选, 默认 0): 结果起始偏移量
- **输出格式**：`JSON_TOOL_OUTPUT`，返回结构：
  ```json
  {
    "model": "seed-audio-1.0",
    "total": 509,
    "count": 20,
    "offset": 0,
    "limit": 20,
    "voices": [
      {
        "voice_type": "zh_male_guanggaojieshuo_uranus_bigtts",
        "name": "广告解说",
        "display_name": "广告解说 2.0",
        "category": "通用场景",
        "language": "中文",
        "accent": "普通话",
        "gender": "male",
        "tags": ["剪映同款"],
        "is_hot": true,
        "hot_order": 1
      }
    ]
  }
  ```

### 2.2 门控与权限
- 挂载在 `plugins/omnimux/src/media/voices-mount.js`；
- 在 `plugins/omnimux/src/gate/guard.js` 中将 `omnimux_audio_voices` 与 `audio` 能力门控绑定（若 `audio` 禁用则工具禁用）；
- 纯只读查询，零副作用，`confirm: false`。

## 3. 验收标准 (Acceptance Criteria)

- **AC-1 (工具注册与模式)**：工具成功注册并暴露，Schema 验证合法，包含完整的可选参数与说明。
- **AC-2 (默认全量与分页)**：无参数调用时默认返回热门音色排在前列的列表，`total` 为 509，`count` 为 20。
- **AC-3 (多维筛选准确性)**：
  - 按关键词 `query: "顾姐"` 查询精准命中 `顾姐 2.0` (`zh_female_gujie_uranus_bigtts`)；
  - 按标签 `tag: "抖音同款"` 过滤返回包含该标签的条目；
  - 按性别 `gender: "female"` 过滤只返回女性音色；
  - 组合过滤（如关键词 + 性别）取交集。
- **AC-4 (模型兼容与兜底)**：传入非 `seed-audio-1.0` 的不支持模型时抛出或友好返回不支持提示。
- **AC-5 (契约一致性)**：在 `docs/contracts/plugin-agent-tools-inventory.md` 完成注册登记，`pnpm verify:tools` 扫描 0 错误 0 告警。
- **AC-6 (门禁与测试 100% 绿灯)**：新增配套单元测试，现有所有测试保持 100% 通过。
