import { createHubEventBus } from '../events/hub-event-bus.js'
import { registerHubEventStream } from '../events/stream.js'
import { createWorkbenchMailbox } from '../workbench/mailbox.js'
import { registerWorkbenchHttpRoutes } from '../workbench/http-routes.js'
import { mountWorkbenchTools } from '../workbench/tools.js'
import { executeOmnimuxAudio } from '../media/audio.js'
import { executeOmnimuxImage } from '../media/image.js'
import { executeOmnimuxVideo } from '../media/video.js'
import { CLIENT_NAME, DEFAULT_SITE, resolveSiteBaseUrl } from '../auth/omnimux-auth.js'
import { createAppsStore } from '../apps/store.js'
import { createTabsStore } from '../apps/tabs.js'
import { createIdentity } from '../auth/identity.js'
import { createTokenStore } from '../auth/store.js'
import { parseHubConfig } from '../config.js'
import { createAccountAvatarStore } from '../official/account-avatar.js'
import { createAccountMetaStore } from '../official/account-meta.js'
import { mountOfficial } from '../official/mount.js'
import { mountReader } from '../reader/mount.js'
import { createAvatarStore } from '../avatar/store.js'
import { JSON_TOOL_OUTPUT, objectParams, rethrow } from '../tools/schema.js'
import { mountMedia } from '../media/mount.js'
import { mountSpeechToText } from '../media/stt-mount.js'
import { executeOmnimuxSpeechToText } from '../media/stt.js'
import { mountTextComplete } from '../text/mount.js'
import { buildModelCatalog } from '../catalog/list.js'
import { SettingsConfig } from '../settings/schema.js'
import { mountHubHttp } from './http.js'
import { mountComposerCommands } from './composer-commands.js'
import { hubHomeDir, hubProfileName } from './paths.js'
import { mountWebSocketHmr } from '../hmr/host.js'

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   jobs?: { start: (spec: object) => string },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 *   effect?: (factory: () => () => void, label?: string) => void,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 * }} ctx
 * @param {{ siteBaseUrl?: string, clientName?: string, productName?: string, logoSvg?: string, wordmarkText?: string, replaceHeroMark?: boolean, hidePreviewBadge?: boolean, rewriteWelcome?: boolean, heroHeadline?: string, heroHeadlineFit?: boolean, heroHeadlineMaxPx?: number, heroHeadlineMinPx?: number, media?: unknown }} [config]
 */
export function apply(ctx, config = {}) {
  const hub = parseHubConfig(config)
  const siteBaseUrl = resolveSiteBaseUrl(config.siteBaseUrl || process.env.OMNIMUX_SITE_URL || DEFAULT_SITE)
  const clientName = config.clientName || CLIENT_NAME
  const brand = hub
  const homeDir = hubHomeDir()
  const store = createTokenStore({
    credentials: ctx.get?.('credentials'),
    homeDir,
  })
  const identity = createIdentity({ store, siteBaseUrl })
  ctx.provide('identity', { status: identity.status, require: identity.require })
  const profile = hubProfileName()
  const appsStore = createAppsStore({
    home: homeDir,
    profile,
    apps: hub.apps,
    siteBaseUrl,
  })
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => appsStore.dispose(), 'omnimux: apps catalog')
  }
  appsStore.maybeRefresh()
  const avatarStore = createAvatarStore({ home: homeDir })
  const accountMetaStore = createAccountMetaStore({ home: homeDir })
  const accountAvatarStore = createAccountAvatarStore({
    home: homeDir,
    config: hub.official.accountAvatars,
  })
  const tabsStore = createTabsStore({ home: homeDir })

  // Initialize in-process HubEventBus and Workbench mailbox
  const hubEvents = createHubEventBus()
  const mailbox = createWorkbenchMailbox({ hubEvents })
  ctx.provide?.('hubEvents', hubEvents)
  // Vertical tools (workflow_*) may read last-known viewport for default workspace targeting.
  // Read-only seam: getActiveView only — no open/RPC.
  ctx.provide?.('workbenchMailbox', {
    getActiveView: (sessionId) => mailbox.getActiveView(sessionId),
  })

  const listCatalog = () => {
    const settingsService = typeof ctx.get === 'function' ? ctx.get('settings') : undefined
    const settingsDefaults = settingsService && typeof settingsService.get === 'function'
      ? settingsService.get('omnimux')
      : undefined
    return buildModelCatalog({
      text: hub.text,
      media: hub.media,
      gate: hub.gate,
      env: process.env,
      settingsDefaults,
    })
  }

  const httpDeps = {
    store,
    identity,
    siteBaseUrl,
    clientName,
    hub,
    brand,
    homeDir,
    profile,
    appsStore,
    tabsStore,
    accountMetaStore,
    accountAvatarStore,
    avatarStore,
    listCatalog,
    hubEvents,
    mailbox,
    sessionQuery: null,
    getWorkspaceRegistry: () => ctx.get?.('workspaceRegistry'),
    getConnection: () => ctx.get?.('connection'),
    getDesktopRuntime: () => ctx.get?.('desktopRuntime'),
  }
  mountComposerCommands(ctx)
  const mountHttp = (httpCtx) => mountHubHttp(httpCtx, httpDeps)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['clientModules', 'webServer', 'loader', 'connection'], async hmrCtx => {
      const { apply: applyWatcher } = await hmrCtx.loader.import('@deepseek-ai/dsh-client-hmr')
      mountWebSocketHmr(hmrCtx, hubEvents, applyWatcher)
    })
    ctx.inject(['webServer'], (httpCtx) => {
      mountHttp(httpCtx)
      const server = httpCtx.webServer ?? httpCtx.get?.('webServer')
      if (server && typeof server.register === 'function') {
        httpCtx.effect(() => registerWorkbenchHttpRoutes(server, { mailbox }), 'omnimux: workbench HTTP')
      }
    })
    ctx.inject(['webServer', 'connection'], (streamCtx) => {
      streamCtx.effect(() => registerHubEventStream(streamCtx.webServer, {
        hubEvents,
        connection: streamCtx.connection,
      }), 'omnimux: hub event stream')
    })
    ctx.inject(['sessionQuery'], (inner) => {
      httpDeps.sessionQuery = inner.sessionQuery ?? inner.get?.('sessionQuery') ?? null
    })
  } else {
    mountHttp(ctx)
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      const settings = sctx.settings
      if (!settings || typeof settings.register !== 'function') return
      const scope = settings.register('omnimux', SettingsConfig, {
        base: {
          defaultTextModel: hub.text.defaultModel,
          defaultImageModel: hub.media.providers.omnimux.models.image,
          defaultVideoModel: hub.media.providers.omnimux.models.video,
          defaultAudioModel: hub.media.providers.omnimux.models.audio,
        },
      })
      if (scope && typeof scope.watch === 'function') {
        scope.watch(() => {
          ctx.emit?.('omnimux/model-catalog-updated')
        })
      }
    })
  }

  const jsonOut = JSON_TOOL_OUTPUT
  mountMedia(ctx, { kind: 'video', execute: executeOmnimuxVideo, media: hub.media, gate: hub.gate, store, jsonOut })
  mountMedia(ctx, { kind: 'image', execute: executeOmnimuxImage, media: hub.media, gate: hub.gate, store, jsonOut })
  mountMedia(ctx, { kind: 'audio', execute: executeOmnimuxAudio, media: hub.media, gate: hub.gate, store, jsonOut })
  mountSpeechToText(ctx, { execute: executeOmnimuxSpeechToText, media: hub.media, gate: hub.gate, store, jsonOut })
  mountTextComplete(ctx, hub, jsonOut, rethrow)
  mountOfficial(ctx, {
    hub,
    identity,
    store,
    siteBaseUrl,
    objectParams,
    jsonOut,
    rethrow,
    resolveApiKey: resolveOfficialApiKey,
  })
  mountReader(ctx, {
    hub,
    objectParams,
    jsonOut,
    rethrow,
    resolveApiKey: resolveOfficialApiKey,
  })
  mountWorkbenchTools(ctx, {
    mailbox,
    getSettings: () => {
      const s = typeof ctx.get === 'function' ? ctx.get('settings') : null
      return s && typeof s.get === 'function' ? s.get('omnimux') : null
    },
    jsonOut,
  })
  if (typeof ctx.provide === 'function') {
    ctx.provide('modelCatalog', { list: listCatalog })
  }

  /**
   * Chat (`llm-pi-ai`) resolves `OMNIMUX_API_KEY` from `$DSH_HOME/.credentials.yaml`.
   * Official tools historically only read `process.env`. Prefer env, then the
   * credentials store, so L2 / App sessions with a yaml key can fetch pages.
   */
  async function resolveOfficialApiKey() {
    const fromEnv = String(process.env.OMNIMUX_API_KEY || process.env.OMNIMUX_TOKEN || '').trim()
    if (fromEnv) return fromEnv
    const credentials = ctx.get?.('credentials')
    if (!credentials || typeof credentials.resolve !== 'function') return undefined
    for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
      try {
        const hit = await credentials.resolve(ref)
        const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
        if (value) return value
      } catch {
        // next ref
      }
    }
    return undefined
  }
}
