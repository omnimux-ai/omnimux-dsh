import { registerFormAttachmentRoutes } from './form-attachments-http.js'
import { createAuthDispatcher, registerAuthRoutes } from '../auth/http-routes.js'
import { createPendingStore } from '../auth/pending.js'
import { registerPluginRoutes, createPluginDispatcher } from '../plugins/http-routes.js'
import { createAppsDispatcher, registerAppsRoutes } from '../apps/http-routes.js'
import { createOfficialDispatcher, registerOfficialRoutes } from '../official/http-routes.js'
import { createInspirationDispatcher, registerInspirationRoutes } from '../official/inspiration-http.js'
import { createAvatarDispatcher, registerAvatarRoutes } from '../avatar/routes.js'
import { injectBrandBoot } from '../brand/inject-index.js'
import { registerCatalogRoutes } from '../catalog/http.js'
import { createComposerAttachmentsDispatcher, registerComposerAttachmentRoutes } from './composer-attachments-http.js'

/**
 * Mount Host HTTP faces. Match order is auth → plugins → apps → official → inspiration → avatar.
 * @param {{
 *   webServer?: { register: Function, tapIndex?: Function },
 *   get?: Function,
 *   effect?: Function,
 * }} httpCtx
 * @param {{
 *   store: object,
 *   identity: object,
 *   siteBaseUrl: string,
 *   clientName: string,
 *   hub: object,
 *   brand: object,
 *   homeDir: string,
 *   profile: string,
 *   appsStore: { view: Function },
 *   tabsStore: { remove: Function },
 *   accountMetaStore: object,
 *   accountAvatarStore?: object,
 *   avatarStore: object,
 *   listCatalog?: () => object,
 *   getConnection?: () => { requestRejection: Function } | undefined,
 *   getDesktopRuntime?: () => { pickFiles?: () => Promise<string[]> } | undefined,
 * }} deps
 */
export function mountHubHttp(httpCtx, deps) {
  const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
  if (!webServer || typeof webServer.register !== 'function') return
  const dispatcher = createAuthDispatcher({
    store: deps.store,
    pending: createPendingStore(),
    siteBaseUrl: deps.siteBaseUrl,
    clientName: deps.clientName,
    identity: deps.identity,
    capabilities: {
      identity: true,
      videoGenerate: true,
      imageGenerate: true,
      textComplete: true,
      official: deps.hub.official.mount,
    },
  })
  const shelfApps = () => {
    const body = deps.appsStore.view()
    return Array.isArray(body.apps) ? body.apps : []
  }
  const mount = () => {
    const stopAuth = registerAuthRoutes(webServer, dispatcher)
    const stopCatalog = registerCatalogRoutes(webServer, {
      list: typeof deps.listCatalog === 'function' ? deps.listCatalog : () => null,
    })
    const stopPlugins = registerPluginRoutes(webServer, createPluginDispatcher({
      appsView: shelfApps,
      tabsRemove: (id) => { deps.tabsStore.remove(id) },
      bundledDir: deps.hub.apps.bundledDir || process.env.OMNIMUX_APPS_BUNDLED_DIR || '',
    }))
    const stopApps = registerAppsRoutes(webServer, createAppsDispatcher({
      homeDir: deps.homeDir,
      profile: deps.profile,
      apps: deps.hub.apps,
      siteBaseUrl: deps.siteBaseUrl,
      store: deps.appsStore,
      tabsStore: deps.tabsStore,
    }))
    const officialDeps = {
      official: deps.hub.official,
      identity: deps.identity,
      store: deps.store,
      siteBaseUrl: deps.siteBaseUrl,
    }
    const stopOfficial = registerOfficialRoutes(webServer, createOfficialDispatcher({
      ...officialDeps,
      metaStore: deps.accountMetaStore,
      avatarStore: deps.accountAvatarStore,
    }))
    const stopInspiration = registerInspirationRoutes(webServer, createInspirationDispatcher(officialDeps))
    const stopAvatar = registerAvatarRoutes(webServer, createAvatarDispatcher({
      store: deps.avatarStore,
      identity: deps.identity,
    }))
    const stopFormAttachments = registerFormAttachmentRoutes(webServer, {
      homeDir: deps.homeDir, getConnection: deps.getConnection,
      getWorkspaceRegistry: deps.getWorkspaceRegistry, getSessionQuery: () => deps.sessionQuery,
    })
    const stopComposerAttachments = registerComposerAttachmentRoutes(
      webServer,
      createComposerAttachmentsDispatcher({
        getSessionQuery: () => deps.sessionQuery ?? null,
        getDesktopRuntime: deps.getDesktopRuntime,
      }),
      { getConnection: deps.getConnection },
    )
    return () => {
      stopAuth()
      stopCatalog()
      stopPlugins()
      stopApps()
      stopOfficial()
      stopInspiration()
      stopAvatar()
      stopComposerAttachments()
      stopFormAttachments()
    }
  }
  if (typeof httpCtx.effect === 'function') httpCtx.effect(mount, 'omnimux: http routes')
  else mount()
  if (typeof webServer.tapIndex !== 'function') return
  const tap = () => webServer.tapIndex(html => injectBrandBoot(html, deps.brand))
  if (typeof httpCtx.effect === 'function') httpCtx.effect(tap, 'omnimux: brand boot')
  else tap()
}
