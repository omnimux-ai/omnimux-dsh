/**
 * Compact settings namespace for canvas default models.
 *
 * Official `settings.register` requires a callable schemastery-shaped schema
 * (`schema(value)` + `schema.toJSON()` + `type`/`dict` for redaction). Hub
 * composition Config stays Standard Schema in `src/config.js`; this object is
 * only the four top-level fields `settingsScope.set` can write.
 */

export const SETTINGS_DEFAULTS = Object.freeze({
  defaultTextModel: 'gemini-3.8-flash',
  defaultImageModel: 'gpt-image-2',
  defaultVideoModel: 'seedance-2-0-fast',
  defaultAudioModel: 'suno',
  allowAgentSwitchTab: true,
})

const FIELD_META = Object.freeze({
  defaultTextModel: '文本节点默认模型',
  defaultImageModel: '图片节点默认模型',
  defaultVideoModel: '视频节点默认模型',
  defaultAudioModel: '音频节点默认模型',
  allowAgentSwitchTab: '允许 Agent 控制右侧工作台切换选项卡',
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
  /** @type {Record<string, string>} */
  const out = {}
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    const raw = input[key]
    if (typeof SETTINGS_DEFAULTS[key] === 'boolean') {
      out[key] = typeof raw === 'boolean' ? raw : SETTINGS_DEFAULTS[key]
    } else {
      out[key] = typeof raw === 'string' && raw.trim() ? raw.trim() : SETTINGS_DEFAULTS[key]
    }
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {{ defaultTextModel: string, defaultImageModel: string, defaultVideoModel: string, defaultAudioModel: string }}
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
}
SettingsConfig.toJSON = function toJSON() {
  return {
    type: 'object',
    properties: {
      defaultTextModel: stringNode('defaultTextModel'),
      defaultImageModel: stringNode('defaultImageModel'),
      defaultVideoModel: stringNode('defaultVideoModel'),
      defaultAudioModel: stringNode('defaultAudioModel'),
    },
  }
}

export { SettingsConfig, parseSettingsSection }
