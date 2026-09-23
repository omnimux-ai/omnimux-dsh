/**
 * Compact settings namespace for canvas default models.
 *
 * Official `settings.register` requires a callable schemastery-shaped schema
 * (`schema(value)` + `schema.toJSON()` + `type`/`dict` for redaction). Hub
 * composition Config stays Standard Schema in `src/config.js`; this object is
 * only the top-level fields `settingsScope.set` can write.
 */

/** Sentinel meaning "follow the catalog recommendation" for a generation mode. */
export const DEFAULT_OPERATION_AUTO = 'auto'

export const SETTINGS_DEFAULTS = Object.freeze({
  defaultTextModel: 'gemini-3.8-flash',
  defaultImageModel: 'gpt-image-2.5',
  defaultVideoModel: 'seedance-2-5',
  defaultAudioModel: 'suno',
  defaultImageOperation: DEFAULT_OPERATION_AUTO,
  defaultVideoOperation: DEFAULT_OPERATION_AUTO,
  /** Route default declared in cordis.patch.yml (reasoning: max). */
  defaultTextReasoning: 'max',
  allowAgentSwitchTab: true,
  allowAutoSurfaceFollow: true,
  /**
   * Model ids the user keeps out of the composer's text-model list. Empty means
   * "show every model the hub lists". This list can only ever subtract: the
   * hub's listed set is the membership authority, so a hidden id the hub still
   * serves stays hidden, and an id the hub dropped stays gone whatever this
   * list says.
   */
  composerHiddenModels: Object.freeze([]),
  /**
   * Which way this install runs models: 'official' | 'agent' | 'key'.
   * Empty means the user has not chosen yet, which stays on the official route
   * so an existing install is never blocked.
   */
  runtimeMode: '',
  /** Local agent: the program id the user picked and whether it tested OK. */
  runtimeAgentId: '',
  /** Local agent specific model or reasoning override if configured */
  runtimeAgentModel: '',
  runtimeAgentReasoning: 'default',
  runtimeAgentVerified: false,
  /** Custom key / Media generation provider: 'fal' | 'openai' | 'openrouter' | 'custom' */
  runtimeMediaProvider: 'fal',
  runtimeKeyEndpoint: '',
  runtimeKeyModel: '',
  runtimeKeyVerified: false,
  /** Which media kinds this media provider covers. */
  runtimeMediaImage: true,
  runtimeMediaVideo: true,
  runtimeMediaAudio: true,
  runtimeMediaImageModel: 'fal-ai/flux/dev',
  runtimeMediaVideoModel: 'fal-ai/kling-video/v1/standard',
  runtimeMediaAudioModel: 'fal-ai/f5-tts',
})

const FIELD_META = Object.freeze({
  defaultTextModel: '文本节点默认模型',
  defaultImageModel: '图片节点默认模型',
  defaultVideoModel: '视频节点默认模型',
  defaultAudioModel: '音频节点默认模型',
  defaultImageOperation: '图片节点默认生成模式（auto 表示按目录推荐自动选择）',
  defaultVideoOperation: '视频节点默认生成模式（auto 表示按目录推荐自动选择）',
  allowAgentSwitchTab: '允许 Agent 控制右侧工作台切换选项卡',
  allowAutoSurfaceFollow: '自动跟随 Agent 处理的工作面切换右侧工作台',
  composerHiddenModels: '输入框模型列表中隐藏的模型',
  runtimeMode: '运行方式（官方、本机助手、媒体生成提供商）',
  runtimeAgentId: '本机助手',
  runtimeAgentModel: '本机助手模型',
  runtimeAgentReasoning: '本机助手推理等级',
  runtimeAgentVerified: '本机助手是否已测试通过',
  runtimeMediaProvider: '媒体生成提供商',
  runtimeKeyEndpoint: '媒体生成提供商的接口地址',
  runtimeKeyModel: '媒体生成提供商默认模型',
  runtimeKeyVerified: '媒体生成提供商是否已测试通过',
  runtimeMediaImage: '媒体提供商是否用于图片',
  runtimeMediaVideo: '媒体提供商是否用于视频',
  runtimeMediaAudio: '媒体提供商是否用于音频',
  runtimeMediaImageModel: '图片生成模型',
  runtimeMediaVideoModel: '视频生成模型',
  runtimeMediaAudioModel: '音频生成模型',
})

function stringNode(key) {
  return {
    type: 'string',
    default: SETTINGS_DEFAULTS[key],
    meta: { description: FIELD_META[key] },
  }
}

function boolNode(key) {
  return {
    type: 'boolean',
    default: SETTINGS_DEFAULTS[key],
    meta: { description: FIELD_META[key] },
  }
}

const RUNTIME_DICT = Object.freeze({
  runtimeMode: stringNode('runtimeMode'),
  runtimeAgentId: stringNode('runtimeAgentId'),
  runtimeAgentModel: stringNode('runtimeAgentModel'),
  runtimeAgentReasoning: stringNode('runtimeAgentReasoning'),
  runtimeAgentVerified: boolNode('runtimeAgentVerified'),
  runtimeMediaProvider: stringNode('runtimeMediaProvider'),
  runtimeKeyEndpoint: stringNode('runtimeKeyEndpoint'),
  runtimeKeyModel: stringNode('runtimeKeyModel'),
  runtimeKeyVerified: boolNode('runtimeKeyVerified'),
  runtimeMediaImage: boolNode('runtimeMediaImage'),
  runtimeMediaVideo: boolNode('runtimeMediaVideo'),
  runtimeMediaAudio: boolNode('runtimeMediaAudio'),
  runtimeMediaImageModel: stringNode('runtimeMediaImageModel'),
  runtimeMediaVideoModel: stringNode('runtimeMediaVideoModel'),
  runtimeMediaAudioModel: stringNode('runtimeMediaAudioModel'),
})

function parseSettingsSection(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    const raw = input[key]
    const fallback = SETTINGS_DEFAULTS[key]
    if (Array.isArray(fallback)) {
      // A list field keeps only usable entries; a malformed stored value falls
      // back to the default instead of failing the whole namespace.
      out[key] = Array.isArray(raw)
        ? raw.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
        : [...fallback]
    } else if (typeof fallback === 'boolean') {
      out[key] = typeof raw === 'boolean' ? raw : fallback
    } else {
      out[key] = typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
    }
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {{ defaultTextModel: string, defaultImageModel: string, defaultVideoModel: string, defaultAudioModel: string, defaultImageOperation: string, defaultVideoOperation: string, defaultTextReasoning: string, allowAgentSwitchTab: boolean, allowAutoSurfaceFollow: boolean, composerHiddenModels: string[] }}
 */
function SettingsConfig(value) {
  return parseSettingsSection(value)
}

SettingsConfig.type = 'object'
SettingsConfig.dict = {
  defaultTextModel: stringNode('defaultTextModel'),
  defaultImageModel: stringNode('defaultImageModel'),
  defaultVideoModel: stringNode('defaultVideoModel'),
  defaultAudioModel: stringNode('defaultAudioModel'),
  defaultImageOperation: stringNode('defaultImageOperation'),
  defaultVideoOperation: stringNode('defaultVideoOperation'),
  defaultTextReasoning: stringNode('defaultTextReasoning'),
  ...RUNTIME_DICT,
}
SettingsConfig.toJSON = function toJSON() {
  return {
    type: 'object',
    properties: {
      defaultTextModel: stringNode('defaultTextModel'),
      defaultImageModel: stringNode('defaultImageModel'),
      defaultVideoModel: stringNode('defaultVideoModel'),
      defaultAudioModel: stringNode('defaultAudioModel'),
      defaultImageOperation: stringNode('defaultImageOperation'),
      defaultVideoOperation: stringNode('defaultVideoOperation'),
      defaultTextReasoning: stringNode('defaultTextReasoning'),
      ...RUNTIME_DICT,
    },
  }
}

export { SettingsConfig, parseSettingsSection }
