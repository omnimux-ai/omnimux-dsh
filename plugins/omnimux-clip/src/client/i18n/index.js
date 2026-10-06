import { useHostLocale } from '../useHostLocale.js'
import { translateZh, makeClipT } from './translate.js'

export { translateZh, makeClipT }

/**
 * Clip i18n bridge for the vendored OpenReel GUI.
 *
 * Contract note (openreel-vendor-contract §3.3 单向适配): vendored files may
 * import this plugin-local module by relative path (same precedent as
 * Toolbar.tsx importing useHostLocale.js). They MUST NOT import
 * @deepseek-ai/* host APIs.
 *
 * Dictionary keys are the English source literals so vendored strings can be
 * wrapped in place: `"Export"` -> `t("Export")`.
 */

/**
 * React hook: subscribe to the host locale singleton (primed by
 * OpenReelStudioTab/ClipStage) and return t(src).
 */
export function useClipT() {
  const snapshot = useHostLocale()
  return makeClipT(snapshot?.active)
}

/** Non-hook lookup for data/config files rendered under a subscribed tree. */
export function clipNow() {
  return translateZh
}
