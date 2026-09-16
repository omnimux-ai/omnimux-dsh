import type { HoveredMedia } from '../content/media-hover/types.ts'

interface MediaSender {
  id?: string
  url?: string
  frameId?: number
  tab?: { id?: number }
}
export function isOwnFloatingPanel(sender: MediaSender, extensionId: string, panelUrl: string): boolean {
  if (sender.id !== extensionId || sender.tab?.id === undefined) return false
  try {
    const actual = new URL(sender.url ?? '')
    const expected = new URL(panelUrl)
    return actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname
  } catch { return false }
}
interface Grant { tabId: number; media: HoveredMedia; expires: number }

/** Only extension-isolated content can choose a payload; the page sees an opaque receipt. */
export function createMediaGrants(extensionId: string, panelUrl: string) {
  const grants = new Map<string, Grant>()
  const prune = () => {
    for (const [id, grant] of grants) if (grant.expires <= Date.now()) grants.delete(id)
  }
  return {
    issue(sender: MediaSender, payload: unknown): string | null {
      prune()
      if (sender.id !== extensionId || sender.frameId !== 0 || sender.tab?.id === undefined
        || !/^https?:\/\//.test(sender.url ?? '')) return null
      if (typeof payload !== 'object' || payload === null) return null
      const media = payload as HoveredMedia
      if (typeof media.id !== 'string' || typeof media.src !== 'string'
        || (media.type !== 'image' && media.type !== 'video')) return null
      if (grants.size >= 128) return null
      const id = crypto.randomUUID()
      grants.set(id, { tabId: sender.tab.id, media: { ...media }, expires: Date.now() + 15_000 })
      return id
    },
    take(sender: MediaSender, id: unknown): HoveredMedia | null {
      prune()
      if (sender.id !== extensionId || sender.tab?.id === undefined || typeof id !== 'string') return null
      if (!isOwnFloatingPanel(sender, extensionId, panelUrl)) return null
      const grant = grants.get(id)
      if (!grant || grant.tabId !== sender.tab.id) return null
      grants.delete(id)
      return grant.media
    },
  }
}
