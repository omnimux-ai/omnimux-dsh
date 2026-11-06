/**
 * Text-model providers offered by the first-run "use your own key" step.
 * Kept separate from the media provider channels: this list is only about the
 * text conversation model and ships a small built-in model catalogue so the
 * step works offline (no "fetch models" network call yet).
 */
export const TEXT_KEY_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'anthropic',
    label: 'Anthropic',
    quickLabel: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com',
    models: Object.freeze(['claude-opus-5', 'claude-opus-4-6', 'claude-sonnet-4-6']),
  }),
  Object.freeze({
    id: 'openai',
    label: 'OpenAI',
    quickLabel: 'OpenAI (GPT)',
    endpoint: 'https://api.openai.com/v1',
    models: Object.freeze(['gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.5', 'gpt-4o']),
  }),
  Object.freeze({
    id: 'azure',
    label: 'Azure OpenAI',
    quickLabel: 'Azure OpenAI',
    endpoint: 'https://your-resource.openai.azure.com/openai/v1',
    models: Object.freeze(['gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.5']),
  }),
  Object.freeze({
    id: 'google',
    label: 'Google Gemini',
    quickLabel: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: Object.freeze(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview']),
  }),
  Object.freeze({
    id: 'ollama',
    label: 'Ollama Cloud',
    quickLabel: 'Ollama Cloud',
    endpoint: 'https://ollama.com/v1',
    models: Object.freeze(['qwen3.5:122b', 'deepseek-v4:671b', 'llama4:maverick']),
  }),
  Object.freeze({
    id: 'senseaudio',
    label: 'SenseAudio',
    quickLabel: 'SenseAudio',
    endpoint: 'https://api.senseaudio.cn/v1',
    models: Object.freeze(['sense-chat-1', 'sense-chat-pro']),
  }),
  Object.freeze({
    id: 'aihubmix',
    label: 'AIHubMix',
    quickLabel: 'AIHubMix',
    endpoint: 'https://aihubmix.com/v1',
    models: Object.freeze(['claude-sonnet-4-6', 'gpt-5.6-sol', 'gemini-3.8-flash']),
  }),
])

/** Lookup with a deterministic fallback so an unknown id never crashes the form. */
export function providerById(id) {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : ''
  return TEXT_KEY_PROVIDERS.find((item) => item.id === key) || TEXT_KEY_PROVIDERS[0]
}
