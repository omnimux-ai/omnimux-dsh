/**
 * Session-scoped model preference owned by the hub.
 *
 * The composer's model picker used to keep its choice in browser-local state
 * only, so no generation path could see it (see `.agent-reports/model-selection-audit/`).
 * The hub now owns the choice: the client writes it through
 * `/omnimux/session-model`, the pre-step injector tells the agent about it, and
 * the media tools fall back to it when the caller passes no `model`.
 *
 * Lifetime matches the host process, exactly like the browser-local copy it
 * replaces — a new user's first launch is an empty table, i.e. "automatic".
 */

/** @typedef {{ auto: boolean, modelId: string, label: string }} SessionModelChoice */

/** @type {Readonly<SessionModelChoice>} */
export const AUTO_SESSION_MODEL = Object.freeze({ auto: false, modelId: '', label: '' })

/**
 * A client may post a partial or hostile payload; only a usable shape is kept.
 * `auto: true` means "no preference" and is normalized to an empty choice.
 *
 * @param {unknown} input
 * @returns {SessionModelChoice}
 */
export function normalizeSessionModelChoice(input) {
  if (!input || typeof input !== 'object') return { ...AUTO_SESSION_MODEL }
  const row = /** @type {Record<string, unknown>} */ (input)
  // `auto` disabled the selection, so the model is not a preference any more.
  if (row.auto !== false) return { ...AUTO_SESSION_MODEL }
  const modelId = typeof row.modelId === 'string' ? row.modelId.trim() : ''
  const label = typeof row.label === 'string' ? row.label.trim() : ''
  if (!modelId) return { ...AUTO_SESSION_MODEL }
  return { auto: false, modelId, label }
}

/**
 * @returns {{
 *   get: (sessionId?: string) => SessionModelChoice | null,
 *   set: (sessionId: string, choice: unknown) => SessionModelChoice,
 *   clear: (sessionId?: string) => boolean,
 *   size: () => number,
 * }}
 */
export function createSessionModelPreference() {
  /** @type {Map<string, SessionModelChoice>} */
  const bySession = new Map()

  /**
   * @param {unknown} sessionId
   * @returns {string}
   */
  const keyOf = (sessionId) => (typeof sessionId === 'string' ? sessionId.trim() : '')

  return {
    /**
     * The effective preference, or `null` when the session runs on "automatic".
     * A session without a record, an `auto` choice and a blank model all mean
     * the same thing to every caller, so they collapse into one answer here.
     *
     * @param {unknown} [sessionId]
     * @returns {SessionModelChoice | null}
     */
    get(sessionId) {
      const key = keyOf(sessionId)
      if (!key) return null
      const choice = bySession.get(key)
      if (!choice || choice.auto !== false || !choice.modelId) return null
      return { ...choice }
    },

    /**
     * @param {unknown} sessionId
     * @param {unknown} choice
     * @returns {SessionModelChoice}
     */
    set(sessionId, choice) {
      const key = keyOf(sessionId)
      const normalized = normalizeSessionModelChoice(choice)
      if (!key) return normalized
      // "Automatic" is the absence of a preference, not a stored empty one:
      // a stale entry would resurrect itself if the client later posts a
      // partial payload.
      if (normalized.auto || !normalized.modelId) {
        bySession.delete(key)
        return normalized
      }
      bySession.set(key, normalized)
      return { ...normalized }
    },

    /**
     * @param {unknown} [sessionId]
     * @returns {boolean} whether a record was removed
     */
    clear(sessionId) {
      const key = keyOf(sessionId)
      if (!key) return false
      return bySession.delete(key)
    },

    size() {
      return bySession.size
    },
  }
}
