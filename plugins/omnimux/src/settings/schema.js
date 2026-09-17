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
})

function stringNode(key) {
  return {
    type: 'string',
    default: SETTINGS_DEFAULTS[key],
    meta: { description: FIELD_META[key] },
  }
}

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
    },
  }
}

export { SettingsConfig, parseSettingsSection }
