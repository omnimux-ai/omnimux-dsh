/**
 * Ordinary Host commands own the native menu rows. A client decoration opens
 * the matching picker or native file selector on the same click / Enter that
 * closes the menu. The executed-event listener remains only for hosts that
 * cannot decorate.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{
 *   openLibrary: (sessionId: string) => void,
 *   openProduct?: (sessionId: string) => void,
 *   openInspiration?: (sessionId: string) => void,
 *   openFile?: (sessionId: string) => void,
 * }} actions
 */
export const LIBRARY_COMMAND = 'add-from-library'
export const FILE_COMMAND = 'add-file'
export const PRODUCT_COMMAND = 'add-from-product'
export const INSPIRATION_COMMAND = 'add-from-inspiration'

/**
 * Trigger the native file input element rendered in composer card.
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function triggerNativeFileInput(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false
  const fileInput = doc.querySelector?.('[data-composer-card] input[type="file"]')
  if (fileInput) {
    fileInput.click()
    return true
  }
  const attachBtn = doc.querySelector?.(
    '[data-composer-card] button[aria-label="添加附件"], [data-composer-card] button[aria-label="Add attachment"]'
  )
  if (attachBtn) {
    attachBtn.click()
    return true
  }
  return false
}

/**
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {string} name
 * @param {(sessionId: string | undefined) => void} run
 * @returns {() => void}
 */
function decorateNamedCommand(commandUi, name, run) {
  if (!commandUi || typeof commandUi.decorate !== 'function') return () => {}
  return commandUi.decorate({
    name,
    available: () => true,
    ui: {
      kind: 'action',
      run: (session) => {
        run(session?.sessionId)
      },
    },
  })
}

/**
 * Open the native file selector immediately on a bare menu / Enter invocation.
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openFile?: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateFileCommand(commandUi, actions) {
  return decorateNamedCommand(commandUi, FILE_COMMAND, (id) => actions.openFile?.(id))
}

/**
 * Open the asset picker immediately on a bare menu / Enter invocation.
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateLibraryCommand(commandUi, actions) {
  return decorateNamedCommand(commandUi, LIBRARY_COMMAND, (id) => actions.openLibrary(id))
}

/**
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openProduct?: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateProductCommand(commandUi, actions) {
  return decorateNamedCommand(commandUi, PRODUCT_COMMAND, (id) => actions.openProduct?.(id))
}

/**
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openInspiration?: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateInspirationCommand(commandUi, actions) {
  return decorateNamedCommand(commandUi, INSPIRATION_COMMAND, (id) => actions.openInspiration?.(id))
}

/**
 * Ordinary Host commands own the native menu rows. This listener receives only
 * the initiating client's acknowledgment; session log replay never opens UI.
 * @param {{ on: (event: string, listener: Function) => () => void }} ctx
 * @param {{
 *   openLibrary: (sessionId: string) => void,
 *   openProduct?: (sessionId: string) => void,
 *   openInspiration?: (sessionId: string) => void,
 *   openFile?: (sessionId: string) => void,
 * }} actions
 */
export function listenComposerAddCommands(ctx, actions) {
  return ctx.on('command/executed', (sessionId, name, result) => {
    if (result?.kind !== 'success') return
    if (name === LIBRARY_COMMAND) actions.openLibrary(sessionId)
    if (name === FILE_COMMAND) actions.openFile?.(sessionId)
    if (name === PRODUCT_COMMAND) actions.openProduct?.(sessionId)
    if (name === INSPIRATION_COMMAND) actions.openInspiration?.(sessionId)
  })
}

/**
 * Prefer the click-time decoration; fall back to the local acknowledgment.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{
 *   openLibrary: (sessionId: string) => void,
 *   openProduct?: (sessionId: string) => void,
 *   openInspiration?: (sessionId: string) => void,
 *   openFile?: (sessionId: string) => void,
 * }} actions
 * @returns {() => void}
 */
export function installComposerAddCommands(ctx, actions) {
  const commandUi = ctx?.commandUi || ctx?.get?.('commandUi')
  const effectiveActions = {
    openFile: () => triggerNativeFileInput(),
    ...actions,
  }
  const stopDecorateFile = decorateFileCommand(commandUi, effectiveActions)
  const stopDecorateProduct = decorateProductCommand(commandUi, effectiveActions)
  const stopDecorateInspiration = decorateInspirationCommand(commandUi, effectiveActions)
  const stopDecorateLibrary = decorateLibraryCommand(commandUi, effectiveActions)
  const stopListen = typeof ctx?.on === 'function'
    ? listenComposerAddCommands(ctx, effectiveActions)
    : () => {}
  return () => {
    stopDecorateLibrary()
    stopDecorateFile()
    stopDecorateProduct()
    stopDecorateInspiration()
    stopListen()
  }
}
