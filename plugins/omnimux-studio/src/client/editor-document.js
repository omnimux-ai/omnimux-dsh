/** Ordered, plain-text document operations. No URL is fetched. */
export function textPart(text = '') {
  return { id: crypto.randomUUID(), kind: 'text', text }
}
export function createDocument(text = '') {
  return { version: 1, parts: [textPart(text)] }
}
export function tokenPart(tokenType, value = '') {
  const part = { id: crypto.randomUUID(), kind: 'url-token', tokenType, value }
  return { ...part, ...validateToken(part) }
}
/** Check untrusted document structure before rendering or serializing it. */
export function validateDocument(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.parts) || !document.parts.length) return false
  const ids = new Set()
  return document.parts.every(part => {
    if (!part || typeof part.id !== 'string' || !part.id.trim() || ids.has(part.id)) return false
    ids.add(part.id)
    if (part.kind === 'text') return typeof part.text === 'string'
    return part.kind === 'url-token' && ['product', 'video'].includes(part.tokenType)
      && typeof part.value === 'string' && ['empty', 'invalid', 'valid'].includes(part.validation)
      && (part.error === undefined || typeof part.error === 'string')
  })
}
export function validateToken(part) {
  const invalid = { validation: 'invalid', error: '仅接受公开 HTTP(S) 链接或商品 ID；禁止凭据及签名参数' }
  if (!part || typeof part.value !== 'string' || !['product', 'video'].includes(part.tokenType)) return invalid
  const value = part.value.trim()
  if (!value) return { validation: 'empty', error: '请填写链接或商品 ID' }
  if (value.length > 2048) return invalid
  if (part.tokenType === 'product' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return { validation: 'valid' }
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return invalid
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')) return invalid
    if (/^(0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^(22[4-9]|23\d|24\d|25[0-5])\./.test(host)) return invalid
    if (host.includes(':')) return invalid
    if ([...url.searchParams.keys()].some(key => /token|secret|password|credential|signature|(^|[-_])sig($|[-_])|api[-_]?key|x-amz|x-goog/i.test(key))) return invalid
    return { validation: 'valid' }
  } catch { return invalid }
}
export function serializeDocument(document) {
  return document.parts.map(part => part.kind === 'text' ? part.text : part.value).join('')
}
/** Insert/update/remove/move keep node identity and source order. */
export function reduceEditor(document, operation) {
  let parts = document.parts.slice()
  const index = parts.findIndex(part => part.id === operation.id)
  if (operation.type === 'insert') parts.splice(operation.index ?? parts.length, 0, operation.part)
  if (operation.type === 'update' && index >= 0) {
    const previous = parts[index]
    parts[index] = previous.kind === 'text'
      ? { ...previous, text: operation.patch.text ?? previous.text }
      : { ...previous, value: operation.patch.value ?? previous.value }
    if (parts[index].kind === 'url-token') parts[index] = { ...parts[index], ...validateToken(parts[index]) }
  }
  if (operation.type === 'remove' && index >= 0) parts.splice(index, 1)
  if (operation.type === 'move' && index >= 0) parts.splice(operation.index, 0, ...parts.splice(index, 1))
  if (!parts.length) parts = [textPart()]
  return { version: 1, parts }
}
export function isComposing(event, composing = false) {
  return composing || event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229
}
