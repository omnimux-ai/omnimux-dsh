/** @param {{previewVideoUrl?: string, previewMediaType?: string} | null} template */
export function resolveTemplateVideoUrl(template) {
  if (template?.previewMediaType === 'image' || typeof template?.previewVideoUrl !== 'string') return ''
  try {
    const url = new URL(template.previewVideoUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    // Media uses domain names: reject IPv6 literals as well as normalized IPv4 literals.
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return ''
    if (!/\.(mp4|webm|mov)$/i.test(url.pathname)) return ''
    return url.href
  } catch {
    return ''
  }
}
