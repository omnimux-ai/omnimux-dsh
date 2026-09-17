/**
 * Ordinary Host commands own the native menu rows. A client decoration opens
 * the library picker or native file selector on the same click / Enter that
 * closes the menu. The executed-event listener remains only for hosts that
 * cannot decorate.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{ openLibrary: (sessionId: string) => void, openFile?: (sessionId: string) => void }} actions
 */
export const LIBRARY_COMMAND = 'add-from-library'
export const FILE_COMMAND = 'add-file'

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
 * Open the native file selector immediately on a bare menu / Enter invocation.
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openFile?: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateFileCommand(commandUi, actions) {
  if (!commandUi || typeof commandUi.decorate !== 'function') return () => {}
  return commandUi.decorate({
    name: FILE_COMMAND,
    available: () => true,
    ui: {
      kind: 'action',
      run: (session) => {
        actions.openFile?.(session?.sessionId)
      },
    },
  })
}

/**
 * Open the picker immediately on a bare menu / Enter invocation.
 * @param {{ decorate?: Function } | undefined} commandUi
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function decorateLibraryCommand(commandUi, actions) {
  if (!commandUi || typeof commandUi.decorate !== 'function') return () => {}
  return commandUi.decorate({
    name: LIBRARY_COMMAND,
    available: () => true,
    ui: {
      kind: 'action',
      run: (session) => {
        actions.openLibrary(session?.sessionId)
      },
    },
  })
}

/**
 * Ordinary Host commands own the native menu rows. This listener receives only
 * the initiating client's acknowledgment; session log replay never opens UI.
 * @param {{ on: (event: string, listener: Function) => () => void }} ctx
 * @param {{ openLibrary: (sessionId: string) => void, openFile?: (sessionId: string) => void }} actions
 */
export function listenComposerAddCommands(ctx, actions) {
  return ctx.on('command/executed', (sessionId, name, result) => {
    if (result?.kind !== 'success') return
    if (name === LIBRARY_COMMAND) actions.openLibrary(sessionId)
    if (name === FILE_COMMAND) actions.openFile?.(sessionId)
  })
}

/**
 * Prefer the click-time decoration; fall back to the local acknowledgment.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{ openLibrary: (sessionId: string) => void, openFile?: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function installComposerAddCommands(ctx, actions) {
  const commandUi = ctx?.commandUi || ctx?.get?.('commandUi')
  const effectiveActions = {
    openFile: () => triggerNativeFileInput(),
    ...actions,
  }
  const stopDecorateLibrary = decorateLibraryCommand(commandUi, effectiveActions)
  const stopDecorateFile = decorateFileCommand(commandUi, effectiveActions)
  const stopListen = typeof ctx?.on === 'function'
    ? listenComposerAddCommands(ctx, effectiveActions)
    : () => {}
  return () => {
    stopDecorateLibrary()
    stopDecorateFile()
    stopListen()
  }
}
