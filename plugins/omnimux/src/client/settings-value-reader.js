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
 * @returns {(() => unknown) | null} live reader, or null when the context cannot inject at all.
 */
export function installSettingsValueReader({ ctx, namespace, entryId = namespace }) {
  if (!ctx || typeof ctx.inject !== 'function') return null
  /** @type {{ controller: { getSnapshot?: () => unknown } | null, fromConfigForms: boolean }} */
  const state = { controller: null, fromConfigForms: false }

  /**
   * Read the namespace value. A namespace the Host stopped serving reports
   * `status: 'unavailable'` while its last value may still sit in the snapshot,
   * so a stale value never counts as a readable choice.
   * @returns {unknown}
   */
  const read = () => {
    if (!state.controller || typeof state.controller.getSnapshot !== 'function') return undefined
    const snapshot = state.controller.getSnapshot()
    if (snapshot && typeof snapshot === 'object' && 'status' in snapshot && snapshot.status !== 'ready') return undefined
    return valueOf(snapshot)
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

  // Newer service first, so the guard below is the one that actually protects it.
  ctx.inject(['configForms'], formCtx => {
    const forms = formCtx?.configForms
    if (!forms || typeof forms.get !== 'function') return
    adopt(forms.get(entryId), true)
  })
  ctx.inject(['settingsScope'], scopeCtx => {
    const binder = scopeCtx?.settingsScope
    if (!binder || typeof binder.bind !== 'function') return
    adopt(binder.bind({ namespace }), false)
  })

  return read
}
