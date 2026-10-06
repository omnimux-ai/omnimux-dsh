import { zh } from './zh-CN.js'

/**
 * Pure (React-free) translation helpers for the vendored OpenReel GUI.
 * Dictionary keys are the English source literals; missing keys fall back to
 * the source text unchanged; `en` (and any non-zh locale) returns the source.
 */

function activeIsZh(active) {
  const a = String(active ?? 'zh').toLowerCase()
  return a === 'zh' || a.startsWith('zh') // zh / zh-cn / zh-hans …
}

export function translateZh(src) {
  if (typeof src !== 'string' || src.length === 0) return src
  return zh[src] || src
}

/** Build a t() for a given locale snapshot ({ active }) or active string. */
export function makeClipT(localeLike) {
  const active = typeof localeLike === 'string' ? localeLike : localeLike?.active
  if (!activeIsZh(active)) return (src) => src
  return translateZh
}
