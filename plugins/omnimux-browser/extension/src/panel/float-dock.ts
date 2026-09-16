/**
 * Move the conversation out of the page-hosted floating workstation and into
 * Chrome's native side panel before browser automation can navigate/reload.
 *
 * The floating iframe lives inside the page DOM: a tool-driven refresh tears it
 * down and drops the visible session. The native side panel survives navigation.
 *
 * `chrome.sidePanel.open` must run inside a user gesture. Callers invoke this
 * synchronously from click/send handlers — before any `await` — so the gesture
 * is still valid. Collapsing (and optionally unloading) the workstation happens
 * in the same turn so the page no longer hosts a second live panel.
 *
 * @module
 */

export interface FloatDockChrome {
  sidePanel?: {
    open?: (options: { windowId: number }) => Promise<void> | void
  }
  windows?: {
    WINDOW_ID_CURRENT?: number
  }
}

export interface FloatDockHost {
  parent?: {
    postMessage: (message: unknown, targetOrigin: string) => void
  } | null
}

/**
 * Open the native side panel and collapse the floating workstation.
 *
 * @param unload - when true, ask the host page to drop the iframe `src` so the
 *   float port disconnects and only the native panel remains present.
 */
export function dockFloatToNativeSidePanel(
  chromeApi: FloatDockChrome | undefined = typeof chrome === 'undefined' ? undefined : chrome,
  host: FloatDockHost | undefined = typeof window === 'undefined' ? undefined : window,
  unload = true,
): void {
  const windowId = chromeApi?.windows?.WINDOW_ID_CURRENT
  try {
    if (typeof windowId === 'number' && chromeApi?.sidePanel?.open) {
      void Promise.resolve(chromeApi.sidePanel.open({ windowId })).catch(() => {})
    }
  } catch {
    // Side panel APIs are absent on some targets; collapse still helps.
  }
  try {
    host?.parent?.postMessage(
      unload
        ? { type: 'COLLAPSE_WORKSTATION', unload: true }
        : { type: 'COLLAPSE_WORKSTATION' },
      '*',
    )
  } catch {
    // The parent frame may already be gone.
  }
}
