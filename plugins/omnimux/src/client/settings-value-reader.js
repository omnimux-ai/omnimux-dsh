/**
 * Read the Hub's settings namespace value across DSH client API generations.
 *
 * DSH 0.1.5 exposes `ctx.settingsScope.bind({ namespace })` and returns a scope
 * whose `getSnapshot()` carries `{ value }`. DSH 0.2.x removed that service and
 * exposes `ctx.configForms.get(<entryId>)` instead, whose snapshot carries the
 * same `value` field. Both snapshots are live: call `read()` again rather than
 * caching a value.
 *
 * Newer service wins when both happen to exist, so a partially migrated host
 * cannot flip the reader back to the retired path.
 */

/**
 * Narrow one snapshot to its namespace value.
 * @param {unknown} snapshot - snapshot from either generation.
 * @returns {unknown} the namespace value, or undefined before the first read.
 */
function valueOf(snapshot) {
  return snapshot && typeof snapshot === 'object' ? snapshot.value : undefined
}

/**
 * Install the cross-generation reader on one client context.
 * @param {object} options
 * @param {object} options.ctx - client context carrying `ctx.inject`.
 * @param {string} options.namespace - settings namespace owned by this plugin.
 * @param {string} [options.entryId] - Host plugin entry id for `configForms`; defaults to the namespace.
 * @returns {(() => unknown) | null} live reader, or null when no supported service is present.
 */
export function installSettingsValueReader({ ctx, namespace, entryId = namespace }) {
  if (!ctx || typeof ctx.inject !== 'function') return null
  /** @type {{ controller: { getSnapshot?: () => unknown } | null, fromConfigForms: boolean }} */
  const state = { controller: null, fromConfigForms: false }

  /** @returns {unknown} */
  const read = () => {
    if (!state.controller || typeof state.controller.getSnapshot !== 'function') return undefined
    return valueOf(state.controller.getSnapshot())
  }

  /**
   * Adopt one generation's controller; the retired path never replaces the new one.
   * @param {{ getSnapshot?: () => unknown } | null | undefined} controller
   * @param {boolean} fromConfigForms
   */
  const adopt = (controller, fromConfigForms) => {
    if (!controller || typeof controller.getSnapshot !== 'function') return
    if (state.controller && state.fromConfigForms && !fromConfigForms) return
    state.controller = controller
    state.fromConfigForms = fromConfigForms
  }

  ctx.inject(['settingsScope'], scopeCtx => {
    const binder = scopeCtx?.settingsScope
    if (!binder || typeof binder.bind !== 'function') return
    adopt(binder.bind({ namespace }), false)
  })
  ctx.inject(['configForms'], formCtx => {
    const forms = formCtx?.configForms
    if (!forms || typeof forms.get !== 'function') return
    adopt(forms.get(entryId), true)
  })

  return read
}
