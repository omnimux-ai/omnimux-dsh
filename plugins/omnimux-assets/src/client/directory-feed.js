import { listAssetFiles } from './api.js'

export const BROWSE_PAGE_SIZE = 100

/** Page-sized directory state shared by React and HTTP integration tests. */
export function createDirectoryFeed(request = listAssetFiles) {
  let generation = 0
  let location = null
  let cursors = ['']
  let page = 0
  let listener = () => {}
  let state = { entries: [], loading: true, error: '', page: 0, total: 0, nextCursor: null, epoch: null }
  const publish = (patch) => { state = { ...state, ...patch }; listener(state) }
  async function load() {
    const current = ++generation
    publish({ loading: true, error: '', entries: [], page, nextCursor: null })
    try {
      const result = await request(location.assetId, location.fileId || '', location.path || '', {
        logical: location.logical, cursor: cursors[page], limit: BROWSE_PAGE_SIZE,
      })
      if (current !== generation) return
      if (!result.ok) throw new Error(result.body?.message || result.body?.error || `HTTP ${result.status}`)
      publish({ ...result.body, entries: result.body.entries || [], loading: false, page })
    } catch (error) {
      if (current === generation) publish({ loading: false, entries: [], error: error.message || String(error) })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn) { listener = fn; return () => { listener = () => {}; generation += 1 } },
    navigate(next) { location = next; cursors = ['']; page = 0; return load() },
    next() { if (state.loading || !state.nextCursor) return; cursors = [...cursors.slice(0, page + 1), state.nextCursor]; page += 1; return load() },
    previous() { if (state.loading || page === 0) return; page -= 1; return load() },
    refresh() { cursors = ['']; page = 0; return load() },
    dispose() { generation += 1; listener = () => {} },
  }
}
