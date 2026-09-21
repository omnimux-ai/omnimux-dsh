/**
 * 本机文件夹选择结果解析。取消或空列表返回空字符串。
 * @param {unknown} result
 * @returns {string}
 */
export function firstPickedDirectory(result) {
  if (typeof result === 'string') return result.trim()
  if (Array.isArray(result)) {
    const hit = result.find((row) => typeof row === 'string' && row.trim() !== '')
    return typeof hit === 'string' ? hit.trim() : ''
  }
  if (!result || typeof result !== 'object') return ''
  const body = 'body' in result && result.body && typeof result.body === 'object' ? result.body : result
  const paths = Array.isArray(body.paths) ? body.paths : []
  const fromList = paths.find((row) => typeof row === 'string' && row.trim() !== '')
  if (typeof fromList === 'string') return fromList.trim()
  if (typeof body.path === 'string') return body.path.trim()
  return ''
}

/**
 * @param {unknown} p
 * @returns {string}
 */
export function extractFolderName(p) {
  if (typeof p !== 'string' || !p.trim()) return ''
  const clean = p.trim().replace(/[/\\]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return idx >= 0 ? clean.slice(idx + 1) : clean
}
