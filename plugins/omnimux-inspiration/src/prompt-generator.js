/**
 * Prompt generation engine for Inspiration Sharing (Issue #2047).
 *
 * Synthesizes direct generation prompts based on content deconstruction
 * and metadata, targeting:
 * - Video: Seedance 2.5 (seedance-2-5), category "seedance 2.5"
 * - Image: GPT Image 2.5 (gpt-image-2.5), category "GPT image2.5"
 */

/**
 * Strips markdown bullets, bold markers, and excessive symbols,
 * normalizing them into clean flowing descriptive prose.
 * @param {string} text
 * @returns {string}
 */
export function cleanMarkdownForPrompt(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    // Replace markdown list item headers: `* **Key**: value` -> `Key: value`
    .replace(/^\s*[-*+]\s*\*\*([^*]+)\*\*:\s*/gm, '$1：')
    .replace(/^\s*[-*+]\s*/gm, '')
    // Replace `**Key**: value` -> `Key: value`
    .replace(/\*\*([^*]+)\*\*:\s*/g, '$1：')
    .replace(/\*\*/g, '')
    // Replace headings: `##+ ` -> ``
    .replace(/^#+\s+/gm, '')
    // Normalize newlines to comma
    .replace(/\n+/g, '，')
    // Remove consecutive punctuation
    .replace(/[，,、]{2,}/g, '，')
    .replace(/[。\.]{2,}/g, '。')
    .replace(/^[，,、。]+|[，,、]+$/g, '')
    .trim()
}

/**
 * Synthesize a high-quality model generation prompt from an inspiration item.
 *
 * The prompt is built from what the entry actually carries — the AI breakdown's
 * summary / visual detail / hook, or the copy the user typed. A bare title is
 * never enough on its own: a share whose prompt would be nothing but its own
 * heading plus boilerplate is a share with nothing to publish, so this answers
 * `''` and the caller reports that instead of publishing filler.
 *
 * The visual breakdown doubles as the scene description when the entry has no
 * summary of its own — a cloud catalogue entry keeps its whole scene account
 * there and nowhere else, and without this the prompt would fall back to the
 * entry's own post copy, which describes the post rather than the footage. It
 * is never used twice: whatever served as the scene is not repeated.
 * @param {Record<string, any>} item
 * @param {'video' | 'image'} [mediaType='video']
 * @returns {string}
 */
export function buildDirectGenerationPrompt(item, mediaType = 'video') {
  if (!item || typeof item !== 'object') return ''

  const deconstruction = item.deconstruction
  const isObj = deconstruction && typeof deconstruction === 'object'
  const decon = isObj ? /** @type {Record<string, any>} */ (deconstruction) : {}
  const rawText = typeof deconstruction === 'string' ? deconstruction : ''

  const visual = cleanMarkdownForPrompt(String(decon.visual_breakdown || decon.visual || '').trim())
  const hook = cleanMarkdownForPrompt(String(decon.hook || decon.hook_highlight || '').trim())

  // The scene the prompt opens on. Ordered so the entry's own account of the
  // footage outranks the post copy that happens to sit on the same row.
  const scene =
    cleanMarkdownForPrompt(String(decon.summary || rawText || '').trim()) ||
    visual ||
    cleanMarkdownForPrompt(String(item.content || '').trim()) ||
    cleanMarkdownForPrompt(String(item.caption || '').trim())

  // Nothing to base a generation prompt on. Reporting it beats publishing a
  // prompt that describes nothing.
  if (!scene && !visual && !hook) return ''

  const parts = []
  if (scene) parts.push(scene)
  if (visual && visual !== scene) {
    parts.push(visual)
  } else if (!scene && hook) {
    parts.push(`开场动态：${hook}`)
  }

  if (mediaType === 'image') {
    parts.push('大师级摄影构图，自然柔和光影，高分辨率，细腻材质纹理与真实细节呈现')
    return parts.join('，')
  }

  parts.push('电影级运镜与流畅主体动作演进，真实自然光影氛围，画质清晰细腻，4K超清质感')
  return parts.join('。')
}

export const SEEDANCE_CATEGORY = 'seedance 2.5'
export const SEEDANCE_MODEL = 'seedance-2-5'

export const GPT_IMAGE_CATEGORY = 'GPT image2.5'
export const GPT_IMAGE_MODEL = 'gpt-image-2.5'

/**
 * Resolve standard category for an inspiration item based on media type.
 * @param {'video' | 'image'} [mediaType='video']
 * @returns {string}
 */
export function defaultCategoryForMediaType(mediaType = 'video') {
  return mediaType === 'image' ? GPT_IMAGE_CATEGORY : SEEDANCE_CATEGORY
}

/**
 * Resolve standard model for an inspiration item based on media type.
 * @param {'video' | 'image'} [mediaType='video']
 * @returns {string}
 */
export function defaultModelForMediaType(mediaType = 'video') {
  return mediaType === 'image' ? GPT_IMAGE_MODEL : SEEDANCE_MODEL
}
