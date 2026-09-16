/**
 * Invisible navigation for OmniMux virtual references.
 *
 * When the attached-context channel carries unified references such as
 * `@inspiration/insp_xxx.mp4`, the agent still has to work out which tool
 * consumes them. The observed cost was the whole opening of a session: the
 * agent searched the disk for a physical file, the glob failed, and a
 * `find /Users/x` sweep ran to its 60s timeout before the reference was
 * finally passed to `video_breakdown_analyze` at step 11.
 *
 * This module derives a short navigation block from that same text so the
 * recommended first action travels with the material. It is appended to the
 * existing attached-context message, so no extra message and no user-visible
 * surface is introduced.
 */

/** Unified reference namespaces owned by OmniMux. */
const REFERENCE_NAMESPACES = ['inspiration', 'asset', 'product']

/**
 * Matches one unified reference. The tail deliberately excludes a trailing
 * dot so a sentence-ending period is not absorbed into the reference.
 */
const REFERENCE_PATTERN = new RegExp(
  `@(?:${REFERENCE_NAMESPACES.join('|')})/[A-Za-z0-9_\\-/.]*[A-Za-z0-9_\\-]`,
  'g',
)

/** The tool that turns a reference into a breakdown; named in the navigation. */
export const RECOMMENDED_BREAKDOWN_TOOL = 'video_breakdown_analyze'

/**
 * Collect the unified references named in a block of text, de-duplicated and
 * in first-appearance order.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
export function extractVirtualReferences(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const seen = new Set()
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    seen.add(match[0])
  }
  return [...seen]
}

/**
 * Build the navigation block for a block of attached context.
 *
 * @param {unknown} text
 * @returns {string} the block, or '' when the text carries no unified reference
 */
export function buildReferenceNavigationHint(text) {
  const references = extractVirtualReferences(text)
  if (references.length === 0) return ''
  return [
    '<reference_navigation>',
    '本次会话附带以下统一虚拟引用：',
    ...references.map((reference) => `- ${reference}`),
    `请直接把这些引用原样作为工具入参使用（推荐先调 ${RECOMMENDED_BREAKDOWN_TOOL} 的 url 参数完成视听拆解），中枢会自动解析并读取对应素材。`,
    '不要用 glob / find / bash 在本地磁盘查找它们的对应文件：它们不是磁盘上的普通文件，全盘搜索只会超时失败。',
    '</reference_navigation>',
  ].join('\n')
}

/**
 * Append the navigation block to attached-context text.
 *
 * @param {unknown} text
 * @returns {string} the original text, with the block appended when applicable
 */
export function withReferenceNavigation(text) {
  if (typeof text !== 'string' || text.length === 0) return typeof text === 'string' ? text : ''
  const hint = buildReferenceNavigationHint(text)
  if (!hint) return text
  return `${text}\n\n${hint}`
}
