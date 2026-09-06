/** Display names for one-shot text whitelist ids. Missing ids fall back to the id. */
export const TEXT_MODEL_LABELS = Object.freeze({
  'claude-opus-5': 'Claude Opus 5',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'gpt-5.6-sol': 'GPT 5.6 Sol',
  'gpt-5.5': 'GPT 5.5',
  'grok-4.6': 'Grok 4.6',
  'kimi-k3': 'Kimi K3',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-v4-flash-vision-exp': 'DeepSeek V4 Flash',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
  'glm-5.3': 'GLM 5.3',
})

/** @param {string} id */
export function textModelLabel(id) {
  return TEXT_MODEL_LABELS[id] ?? id
}
