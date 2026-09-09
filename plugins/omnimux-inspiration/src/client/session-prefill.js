/** Public hub seam; inspiration never owns composer state. */
export function queueSessionPrefill(request) {
  const seam = globalThis.window?.__omnimuxSessionPrefill
  return seam?.queueSessionPrefill?.(request) ?? Promise.resolve({ ok: false, error: 'composer-missing' })
}
