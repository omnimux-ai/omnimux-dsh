/**
 * Ordinary Host commands own the native menu rows. This listener receives only
 * the initiating client's acknowledgment; session log replay never opens UI.
 * @param {{ on: (event: string, listener: Function) => () => void }} ctx
 * @param {{ openLibrary: (sessionId: string) => void }} actions
 */
export function listenComposerAddCommands(ctx, actions) {
  return ctx.on('command/executed', (sessionId, name, result) => {
    if (result?.kind !== 'success') return
    if (name === 'add-from-library') actions.openLibrary(sessionId)
  })
}
