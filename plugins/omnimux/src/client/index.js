import { mountFormsBridge } from './forms/mount.js'
/** Registers OmniMux profile in Settings and Apps under 新会话. */
import { NS } from './locales.js'
import { SessionGuide } from './session-guide/SessionGuide.jsx'
import { createGuideStore } from './session-guide/state.js'
import { guideZh, guideEn } from './session-guide/catalog.js'
import { installGuideStyles } from './session-guide/styles.js'
import { ProfileSection } from './ProfileSection.jsx'
import { DshPluginsSection } from './DshPluginsSection.jsx'
import { ModelsSettingsCard } from './ModelsSettingsCard.jsx'
import { LoginGate } from './LoginGate.jsx'
import { QuotaGate } from './QuotaGate.jsx'
import { installQuotaGlobal } from './quota-gate.js'
import { SidebarUpdateAction } from './SidebarUpdateAction.jsx'
import { getStatusCached } from './api.js'
import { installHubChrome } from './chrome.js'
import { installWorkbenchGlobal } from './workbench.js'
import { STYLES_ID, injectHubStyles } from './styles.js'
import { HeroBrandMark } from './HeroBrandMark.jsx'
import { installHeroBrandSlot } from './hero-brand.js'
import { installStatsLineShadow } from './stats-line-shadow.js'
import { AttachmentTray } from './attachments/AttachmentTray.tsx'
import { getGlobalAttachmentStore } from './attachments/store.ts'
import { createEventsClient, installHubEventsGlobal } from './events-client.js'
import { installWebSocketHmr } from '../hmr/client.js'
import { injectUiContextStyle } from './composer-envelope.js'
import { installComposerAddCapture } from './composer-add/install.js'
import { listenComposerAddCommands } from './composer-add/commands.js'
import { createAttachmentAdmission } from './composer-add/attachment-admission.js'
import { AttachmentSubmitBridge } from './composer-add/AttachmentSubmitBridge.jsx'
import { installAgentPresetsI18n } from './agent-presets-i18n.js'
import { installSessionCopyI18n } from './session-copy-i18n.js'
import { installCommandsI18n } from './composer-commands-i18n.js'
import { ComposerPresetsTriggers } from './presets/index.js'
import { ComposerModeTabs } from './composer-mode/ComposerModeTabs.jsx'
import { registerLinkTriggerSource } from './attachments/linkTriggerSource.ts'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

export const name = 'omnimux'
export const inject = ['slots', 'locale']
// settingsScope is optional: Hosts without ui-settings still mount chrome.

/**
 * Client seam for vertical plugins: single source of truth for the
 * first-level product stage and the workbench split. `installStageGlobal()`
 * installs `window.__omnimuxStage`; `installWorkbenchGlobal()` installs
 * `window.__omnimuxWorkbench`. Vertical plugins read those globals in
 * their own `apply()` instead of shipping a copy or depending on
 * cross-plugin client service ordering. Only the hub installs the chrome
 * style and the document click listener, so concurrent verticals cannot
 * double-register global side-effects (the duplicate-copy race that wedged
 * the page).
 * @param {{
 *   locale: { register: Function, bind: Function },
 *   slots: { inject: Function, register: Function },
 *   effect?: Function,
 * }} ctx
 */
export function apply(ctx) {
  const t = installHubChrome(ctx)
  registerLinkTriggerSource(ctx)
  installAgentPresetsI18n(ctx)
  installSessionCopyI18n(ctx)
  installCommandsI18n(ctx, primitives)
  installQuotaGlobal(typeof window !== 'undefined' ? window : undefined)
  installHeroBrandSlot(ctx, HeroBrandMark)
  installStatsLineShadow(ctx)
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'omnimux-creative-presets-triggers',
    order: 30,
    locale: NS,
  }, ComposerPresetsTriggers))
  // Optional session warmup: fill the status cache so the first sidebar
  // click can take the sync short path. Not a startup gate — fire-and-forget,
  // never setState, never block apply().
  void getStatusCached().catch(() => {})
  ctx.effect?.(() => {
    injectHubStyles()
    return () => { document.getElementById(STYLES_ID)?.remove() }
  }, 'omnimux: hub client styles')

  // Apps shelf temporarily taken down (core-first): the 应用 row, app tabs,
  // and AppsStage overlay stay in the source tree (apps-store.js / app-tabs.js
  // / AppsStage.jsx / AppsEntry.jsx / catalog.json) and are re-enabled by
  // restoring the three mounts below. Pinned vertical plugins (账号 / 资产库 /
  // 专家·技能·连接器 / 工作流) open directly via the product stage and do not
  // depend on the catalog or the omnimux-app-open event.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'omnimux-profile',
    order: 5,
    label: () => t('profile.nav'),
    locale: NS,
    inject: () => ({ t }),
  }, ProfileSection))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'omnimux-dsh-plugins',
    order: 20,
    label: () => t('dshPlugins.nav'),
    locale: NS,
    inject: () => ({ t }),
  }, DshPluginsSection))
  // Canvas default models — Settings → 插件 → 可配置 (keyed by Host namespace).
  // Bind once when the slot mounts; do not re-bind inside the React card.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settingsScope'], (sctx) => {
      const binder = sctx.settingsScope
      if (!binder || typeof binder.bind !== 'function') return
      const scope = binder.bind({ namespace: 'omnimux' })
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'omnimux',
        id: 'omnimux',
        locale: NS,
        inject: () => ({ t, scope }),
      }, ModelsSettingsCard))
    })
  }
  // Unified login gate. It lives on the shell.overlay seat but renders as a
  // transient modal via createPortal(document.body) with a zIndex above every
  // other overlay; it returns null while closed so it never claims a product
  // slot or `data-dsh-product-stage`. Only the hub triggers it (single owner).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'omnimux-auth-gate',
    order: 30,
    locale: NS,
    inject: () => ({ t }),
  }, LoginGate))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'omnimux-quota-gate',
    order: 31,
    locale: NS,
    inject: () => ({ t }),
  }, QuotaGate))

  // 官方侧边栏底部槽位：设置正上方的更新交互栏
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'omnimux-desktop-updater',
    order: 10,
    locale: NS,
    inject: () => ({ t }),
  }, SidebarUpdateAction))

  const guideStore = createGuideStore()
  const attachmentDrafts = new Map()
  let guideSessions = null
  const guideFace = {
    store: guideStore,
    workbench: installWorkbenchGlobal(),
    attachmentDrafts,
    getCurrentSessionId: () => guideSessions?.list.getSnapshot().current,
  }
  ctx.effect(() => ctx.locale.register('omnimux-session-guide', { zh: guideZh, en: guideEn }), 'omnimux: starter locale')
  ctx.effect(() => () => guideStore.dispose(), 'omnimux: starter state')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'omnimux:session-guide', order: 110,
    locale: 'omnimux-session-guide', inject: () => guideFace,
  }, SessionGuide))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'omnimux-composer-mode-tabs',
    order: 115,
    locale: NS,
    inject: () => ({ workbench: guideFace.workbench }),
  }, ComposerModeTabs))
  // 全平台通用「添加到会话」附件附着槽 (挂载至输入框内侧 conversation.input.attachments)
  // Official `dsh-client-ui-attachment` already occupies this single cell at
  // default priority 0. Shadow it with a lower priority so OmniMux wins
  // (lowest renders) instead of failing the client Loader.
  const attachmentStore = getGlobalAttachmentStore()
  mountFormsBridge(ctx, attachmentStore)
  const attachmentAdmission = createAttachmentAdmission({ getSessions: () => guideSessions, store: attachmentStore, drafts: attachmentDrafts })
  ctx.effect(() => () => { attachmentAdmission.dispose(); attachmentDrafts.clear() }, 'omnimux: attachment admission')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'omnimux:attachment-submit', order: 120, locale: NS,
    inject: () => ({ attachmentStore, attachmentDrafts, attachmentAdmission, getCurrentSessionId: guideFace.getCurrentSessionId }),
  }, AttachmentSubmitBridge))
  ctx.effect?.(() => attachmentStore.installGlobalEvents(), 'omnimux: attachment global events')
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    id: 'omnimux-attachment-tray',
    priority: -10,
    locale: NS,
  }, AttachmentTray))

  ctx.effect(() => {
    const eventsClient = createEventsClient()
    const uninstall = installHubEventsGlobal(eventsClient)
    const hmr = ctx.inject(['loader', 'modules'], hmrCtx => {
      hmrCtx.effect(() => installWebSocketHmr(hmrCtx, eventsClient, document), 'omnimux: HMR client')
    })
    eventsClient.connect()
    return () => {
      void hmr.dispose()
      eventsClient.disconnect()
      uninstall()
    }
  }, 'omnimux: hub event client')
  if (typeof document !== 'undefined') {
    ctx.effect(() => installGuideStyles(document), 'omnimux: starter styles')
    ctx.effect(() => { injectUiContextStyle(document) }, 'omnimux: composer context style')
    ctx.inject(['commandUi', 'sessions'], (inner) => {
      guideSessions = inner.sessions
      inner.effect(() => {
        const controller = installComposerAddCapture(document, { t, store: attachmentStore, sessions: inner.sessions })
        const stopCommands = listenComposerAddCommands(inner, controller)
        return () => {
          stopCommands()
          guideSessions = null
          controller.dispose()
        }
      }, 'omnimux: composer add commands')
    })
  }
  // ctx.effect(() => mountSidebarEntry(apps, t, ctx.locale, SIDEBAR_GLOBAL().register), 'omnimux: sidebar apps entry')
  // ctx.effect(() => mountAppTabs(t, ctx.locale, SIDEBAR_GLOBAL().register), 'omnimux: sidebar app tabs')
  // ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  //   name: 'shell.overlay',
  //   id: 'omnimux-apps-stage',
  //   order: 20,
  //   locale: NS,
  //   inject: appsFace,
  // }, AppsStage))
}
