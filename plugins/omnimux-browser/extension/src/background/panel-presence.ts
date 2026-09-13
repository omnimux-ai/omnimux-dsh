/**
 * Which window each live side panel belongs to.
 *
 * A panel port carries no window of its own, so the panel reports it once over
 * `panel.window`. Everything that has to reason about "is the native side panel
 * open in THIS window" — selection capture, the media fallback, and the capsule
 * asking whether it may open the floating workstation instead — reads the answer
 * from here, so the rule has exactly one owner.
 *
 * @module
 */

/** Maps a live panel port to its window id. */
export type PanelWindowRegistry = WeakMap<chrome.runtime.Port, number>

/** Tracks which window every connected side panel reported. */
export class PanelPresence {
  private readonly windows: PanelWindowRegistry = new WeakMap()

  /** Records the window a panel belongs to. */
  register(port: chrome.runtime.Port, windowId: number): void {
    this.windows.set(port, windowId)
  }

  /** The window a panel belongs to, or `undefined` when it never reported one. */
  windowOf(port: chrome.runtime.Port): number | undefined {
    return this.windows.get(port)
  }

  /** Every registered port of one window. */
  portsFor(live: Iterable<chrome.runtime.Port>, windowId: number): chrome.runtime.Port[] {
    const found: chrome.runtime.Port[] = []
    for (const port of live) {
      if (this.windows.get(port) !== windowId) continue
      found.push(port)
    }
    return found
  }

  /**
   * Whether one window currently has a panel that can display a quote or take a
   * piece of page media.
   *
   * A port that has not identified its window yet does not count: the media
   * fallback must not be told a panel is available in a window nobody proved.
   */
  hasPanelInWindow(live: Iterable<chrome.runtime.Port>, windowId: number): boolean {
    for (const port of live) {
      if (this.windows.get(port) === windowId) return true
    }
    return false
  }

  /** Whether any window at all has an identified panel. */
  anyPanel(live: Iterable<chrome.runtime.Port>): boolean {
    for (const port of live) {
      if (this.windows.get(port) !== undefined) return true
    }
    return false
  }
}
