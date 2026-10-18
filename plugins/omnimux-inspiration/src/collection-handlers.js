/** Dispatch only the collection subtree, before ordinary local item routes.
 * @param {{req: {method?: string, body?: unknown}, url: URL, store: ReturnType<typeof import('./local-store.js').createLocalStore>}} ctx
 */
export function handleCollectionRequest({ req, url, store }) {
  const method = String(req.method || 'GET').toUpperCase()
  const suffix = url.pathname.slice('/omnimux/inspiration/local/collections'.length)
  if ((!suffix || suffix === '/') && method === 'GET') return { status: 200, body: { data: store.collections() } }
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: '请求内容格式不正确' } }
  /** @type {Record<string, unknown>} */
  const input = body
  let operation
  let keys
  let id = ''
  if ((!suffix || suffix === '/') && method === 'POST') {
    operation = () => store.createCollection(input.title, input.item_ids)
    keys = ['title', 'item_ids']
  } else if (suffix === '/undo' && method === 'POST') {
    operation = () => store.undoCollection(input.token)
    keys = ['token']
  } else {
    const match = /^\/([^/]+)(?:\/(items|remove-items))?$/.exec(suffix)
    if (!match) return { status: 404, body: { error: '合集操作不存在' } }
    id = decodeURIComponent(match[1])
    if (!match[2] && method === 'PATCH') {
      operation = () => store.renameCollection(id, input.title)
      keys = ['title']
    } else if (match[2] === 'items' && method === 'POST') {
      operation = () => store.addCollectionItems(id, input.item_ids)
      keys = ['item_ids']
    } else if (match[2] === 'remove-items' && method === 'POST') {
      operation = () => store.removeCollectionItems(id, input.item_ids)
      keys = ['item_ids']
    }
  }
  if (!operation) return { status: 404, body: { error: '合集操作不存在' } }
  if (Object.keys(input).some((key) => !keys.includes(key))) return { status: 400, body: { error: '请求包含不支持的内容' } }
  return { status: !suffix && method === 'POST' ? 201 : 200, body: operation() }
}
