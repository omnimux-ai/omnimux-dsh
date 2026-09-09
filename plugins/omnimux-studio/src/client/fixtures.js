/** UI demonstration catalogs, not provider model identifiers or prices. */
const model = (id, name, cost, category) => Object.freeze({ id: `mock:${id}`, name, cost, category })
export const VIDEO_MODELS = Object.freeze([
  model('veo-lite', 'Veo 3.1 Lite', 3, '视频体验组'),
  model('veo-fast', 'Veo 3.1 Fast', 5, '视频体验组'),
  model('gemini-omni', 'Gemini Omni Flash', 11, '视频体验组'),
  model('grok', 'Grok Imagine', 1, '视频体验组'),
  model('seedance-25', 'Seedance 2.5', 17, '视频标准组'),
  model('seedance-2', 'Seedance 2', 11, '视频标准组'),
  model('seedance-fast', 'Seedance 2 Fast', 6, '视频标准组'),
  model('h3-max', 'MiniMax H3 Max', 10, '视频标准组'),
  model('h3', 'MiniMax H3', 12, '视频标准组'),
  model('wan', 'Wan 3.0', 3, '视频标准组'),
  model('kling', 'Kling 3', 9, '视频标准组'),
  model('kling-omni', 'Kling 3 Omni', 15, '视频标准组'),
])
export const AGENT_MODELS = Object.freeze([
  model('agent-veo-fast', 'Veo 3.1 Fast (体验)', 5, 'Agent 推荐'),
  VIDEO_MODELS[5], VIDEO_MODELS[4], VIDEO_MODELS[7],
])
export const IMAGE_MODELS = Object.freeze([
  model('nano-2', 'Nano Banana 2', 1, '图片'),
  model('nano-pro', 'Nano Banana Pro', 1, '图片'),
  model('gpt-image-2', 'GPT Image 2', 1, '图片'),
  model('seedream-pro', 'Seedream 5.0 Pro', 1, '图片'),
  model('seedream-lite', 'Seedream 5.0 Lite', 1, '图片'),
  model('seedream-45', 'Seedream 4.5', 1, '图片'),
])
export const PRESETS = Object.freeze([
  { id: 'ecommerce', label: '一键创作带货视频', skillId: '创作带货视频', tokens: ['product'], modelId: 'mock:agent-veo-fast', seconds: 8 },
  { id: 'viral', label: '复刻爆款视频', skillId: '复刻爆款视频', tokens: ['video', 'product'], modelId: 'mock:seedance-2', seconds: 15 },
  { id: 'deconstruct', label: '拆解爆款视频', skillId: '视频分析', tokens: ['video'], modelId: null, seconds: null },
  { id: 'prompt_reverse', label: '反推视频提示词', skillId: '视频分析', tokens: ['video'], modelId: null, seconds: null },
])
export const MEDIA = Object.freeze({
  'mock:sample-image': { kind: 'image', url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800&q=80', source: 'Existing prototype Unsplash fixture; availability and usage rights not verified' },
  'mock:sample-video': { kind: 'video', url: 'https://assets.mixkit.co/videos/preview/mixkit-golden-retriever-dog-running-on-grass-43110-large.mp4', source: 'Existing prototype Mixkit fixture; availability and usage rights not verified' },
})
export function modelsFor(mode) { return mode === 'image' ? IMAGE_MODELS : mode === 'agent' ? AGENT_MODELS : VIDEO_MODELS }
export const IMAGE_EXAMPLES = IMAGE_MODELS.map((item, index) => ({
  id: `mock:image-example-${index}`, modelId: item.id, resolution: index % 2 ? '4K' : '2K', aspect: ['1:1', '9:16', '16:9'][index % 3],
  prompt: ['极简白瓷咖啡杯，晨光静物摄影', '职业人像，柔和窗光', '商业产品摄影，简洁背景'][index % 3], fixtureId: 'mock:sample-image',
}))
export function filterItems(items, filters) {
  return items.filter(item => ['modelId', 'resolution', 'aspect'].every(key => !filters[key] || item[key] === filters[key]))
}
