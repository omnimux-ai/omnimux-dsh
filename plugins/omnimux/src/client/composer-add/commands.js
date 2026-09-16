/**
 * Ordinary Host commands own the native menu rows. A client decoration opens
 * the library picker on the same click / Enter that closes the menu. The
 * executed-event listener remains only for hosts that cannot decorate.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 */
export const LIBRARY_COMMAND = 'add-from-library'

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
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 */
export function listenComposerAddCommands(ctx, actions) {
  return ctx.on('command/executed', (sessionId, name, result) => {
    if (result?.kind !== 'success') return
    if (name === LIBRARY_COMMAND) actions.openLibrary(sessionId)
  })
}

/**
 * Prefer the click-time decoration; fall back to the local acknowledgment.
 * @param {{ on?: Function, commandUi?: { decorate?: Function }, get?: Function }} ctx
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 * @returns {() => void}
 */
export function installComposerAddCommands(ctx, actions) {
  const commandUi = ctx?.commandUi || ctx?.get?.('commandUi')
  const stopDecorate = decorateLibraryCommand(commandUi, actions)
  const stopListen = typeof ctx?.on === 'function'
    ? listenComposerAddCommands(ctx, actions)
    : () => {}
  return () => {
    stopDecorate()
    stopListen()
  }
}
