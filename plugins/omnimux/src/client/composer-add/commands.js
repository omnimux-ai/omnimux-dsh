/** Register composer add actions in the native command menu. */

/**
 * @param {{
 *   inject?: (deps: string[], cb: (inner: object) => void) => void,
 *   effect?: (factory: () => () => void, label?: string) => void,
 * }} ctx
 * @param {{
 *   t: (key: string) => string,
 *   onAddFile: (sessionId: string, signal: AbortSignal, restoreComposerFocus: () => void, registrationSignal: AbortSignal) => void | Promise<void>,
 *   onAddLibrary: (sessionId: string, signal: AbortSignal, restoreComposerFocus: () => void, registrationSignal: AbortSignal) => void | Promise<void>,
 *   onClientActionUnavailable?: () => void,
 * }} actions
 */
export function registerComposerAddCommands(ctx, actions) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['commandUi'], (inner) => {
    const commandUi = inner.commandUi ?? inner.get?.('commandUi')
    if (!commandUi || typeof commandUi.register !== 'function') return
    if (commandUi.capabilities?.clientAction !== true) {
      actions.onClientActionUnavailable?.()
      return
    }
    const t = actions.t
    const registration = new AbortController()
    const stopFile = commandUi.register({
      name: 'add-file',
      description: t('composerAdd.addFile'),
      available: () => true,
      ui: {
        kind: 'clientAction',
        run: ({ session, signal, restoreComposerFocus }) =>
          actions.onAddFile(session.sessionId, signal, restoreComposerFocus, registration.signal),
      },
    })
    const stopLibrary = commandUi.register({
      name: 'add-from-library',
      description: t('composerAdd.fromLibrary'),
      available: () => true,
      ui: {
        kind: 'clientAction',
        run: ({ session, signal, restoreComposerFocus }) =>
          actions.onAddLibrary(session.sessionId, signal, restoreComposerFocus, registration.signal),
      },
    })
    ctx.effect?.(() => () => {
      registration.abort()
      try { stopFile?.() } catch { /* ignore disposer failures */ }
      try { stopLibrary?.() } catch { /* ignore disposer failures */ }
    }, 'omnimux: composer add commands')
  })
}
