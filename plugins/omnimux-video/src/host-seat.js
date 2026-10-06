/**
 * Optional host seats (execution seams) are resolved through `ctx.get` only.
 *
 * The Host guards undeclared service properties: reading `ctx.<name>` for a
 * seam that is not in this plugin's `inject` throws instead of returning
 * `undefined`. A `ctx.<name> ?? ctx.get?.(<name>)` fallback therefore never
 * reaches its right-hand side and the seam stays unreachable — the plugin then
 * fails every request that needs it, including the internal-driver fallback.
 *
 * @param {unknown} ctx host context
 * @param {string} name seat name, e.g. `videoGenerate`
 * @returns {any} the seat, or `undefined` when it is not provided
 */
export function readSeat(ctx, name) {
  if (!ctx || typeof ctx !== 'object') return undefined
  const get = /** @type {{ get?: unknown }} */ (ctx).get
  if (typeof get !== 'function') return undefined
  try {
    return get.call(ctx, name)
  } catch {
    return undefined
  }
}
