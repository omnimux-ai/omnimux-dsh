/** Client half: 手机管理 sidebar entry + workbench stage store.
 *
 * The web runtime applies this module as a standard Cordis client plugin
 * (same shape as omnimux-assets / omnimux-accounts): it must export
 * `name`, `inject` and `apply`, otherwise the loader rejects it with
 * "invalid plugin, expect function or object with an apply method" and
 * the app boots into the plugin recovery screen.
 */
import { mountSidebarEntry } from './sidebar-entry.js'
import { DeviceStage } from './DeviceStage.jsx'
import { locales, createTranslate } from './locales.js'

export const name = 'omnimux-device'
export const inject = ['locale']

const NS = 'omnimux-device'

export { DeviceStage, locales, createTranslate, mountSidebarEntry }

/**
 * @param {{
 *   locale: { register: Function, bind: Function, subscribe?: Function },
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: locales['zh-CN'], en: locales['en-US'] }), 'omnimux-device: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-device: sidebar entry')
}
