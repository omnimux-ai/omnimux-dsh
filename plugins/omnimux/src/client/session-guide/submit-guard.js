/** Stop before the Hub's document-level envelope/attachment submit handlers. */
export function installGuideSubmitGuard(root, check) {
  const win = root.ownerDocument.defaultView
  let blockedPointer = false
  const sendButton = target => target?.closest?.('button[aria-label="Send message"],button[aria-label="发送消息"],[data-send-button]')
  const belongs = target => target && root.contains(target)
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation() }
  function pointer(event) {
    if (!belongs(event.target) || !sendButton(event.target)) return
    blockedPointer = !check()
    if (blockedPointer) stop(event)
  }
  function click(event) {
    if (!belongs(event.target) || !sendButton(event.target)) return
    const blocked = blockedPointer
    blockedPointer = false
    if (blocked || !check()) stop(event)
  }
  function key(event) {
    if (!belongs(event.target) || event.key !== 'Enter' || event.shiftKey
      || event.isComposing || event.keyCode === 229) return
    if (root.ownerDocument.querySelector('[data-trigger-menu] [aria-activedescendant]')?.getAttribute('aria-activedescendant')) return
    // Only the official editor or send button. Enter in our URL field stays local.
    if (!event.target.closest?.('[data-composer-input="true"]') && !sendButton(event.target)) return
    if (!check()) stop(event)
  }
  win.addEventListener('pointerdown', pointer, true)
  win.addEventListener('click', click, true)
  win.addEventListener('keydown', key, true)
  return () => {
    win.removeEventListener('pointerdown', pointer, true)
    win.removeEventListener('click', click, true)
    win.removeEventListener('keydown', key, true)
  }
}
