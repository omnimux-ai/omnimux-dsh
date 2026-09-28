/**
 * Isolated timer maps for Veo Host polling vs local upscale fake progress.
 * Keeping them separate prevents handleUpscale from killing fetchVeoTask polls.
 */

/**
 * @param {Map<string, unknown>} map
 * @param {string} taskId
 * @param {(id: unknown) => void} clearFn
 */
export function clearTimerInMap(map, taskId, clearFn = clearInterval) {
  if (!map || typeof map.get !== 'function') return false
  const timer = map.get(taskId)
  if (timer == null) return false
  clearFn(timer)
  map.delete(taskId)
  return true
}

/**
 * Clear every timer in `map` via `clearFn`. Does not touch any other map.
 * @param {Map<string, unknown>} map
 * @param {(id: unknown) => void} clearFn
 */
export function clearAllTimersInMap(map, clearFn = clearInterval) {
  if (!map || typeof map.forEach !== 'function') return 0
  let n = 0
  map.forEach((timer) => {
    clearFn(timer)
    n += 1
  })
  map.clear()
  return n
}

/**
 * Clear both poll and upscale timers for one taskId.
 * Each map is cleared independently — clearing upscale never mutates poll.
 * @param {{ pollTimers: Map<string, unknown>, upscaleTimers: Map<string, unknown> }} maps
 * @param {string} taskId
 * @param {(id: unknown) => void} clearFn
 */
export function clearTaskTimers(maps, taskId, clearFn = clearInterval) {
  const clearedPoll = clearTimerInMap(maps.pollTimers, taskId, clearFn)
  const clearedUpscale = clearTimerInMap(maps.upscaleTimers, taskId, clearFn)
  return { clearedPoll, clearedUpscale }
}

/**
 * Unmount / full teardown: drain both maps without cross-touching.
 * @param {{ pollTimers: Map<string, unknown>, upscaleTimers: Map<string, unknown> }} maps
 * @param {(id: unknown) => void} clearFn
 */
export function clearAllTaskTimers(maps, clearFn = clearInterval) {
  const pollCleared = clearAllTimersInMap(maps.pollTimers, clearFn)
  const upscaleCleared = clearAllTimersInMap(maps.upscaleTimers, clearFn)
  return { pollCleared, upscaleCleared }
}
