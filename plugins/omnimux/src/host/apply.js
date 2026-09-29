import { createHubEventBus } from '../events/hub-event-bus.js'
import { registerHubEventStream } from '../events/stream.js'
import { createWorkbenchMailbox } from '../workbench/mailbox.js'
import { registerWorkbenchHttpRoutes } from '../workbench/http-routes.js'
import { mountWorkbenchTools } from '../workbench/tools.js'
import { mountWorkbenchContextInjector } from '../workbench/context-injector.js'
import { mountCanvasGenerationEvents } from '../workbench/generation-events.js'
import { mountSurfaceFollow } from '../workbench/surface-follow.js'
import { mountCommentInjector } from '../workbench/comment-injector.js'
import { mountContractsPrompt } from '../agents/contracts-loader.js'
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
import { createSessionModelPreference } from '../session/model-preference.js'
import { registerSessionModelRoutes } from '../session/http.js'
import { registerDirectMediaRoutes } from '../media/direct-http.js'
import { mountSessionModelInjector } from '../session/context-injector.js'
import { mountSpeechToText } from '../media/stt-mount.js'
import { mountAudioVoices } from '../media/voices-mount.js'
import { executeOmnimuxSpeechToText } from '../media/stt.js'
import { mountTextComplete } from '../text/mount.js'
import { buildModelCatalog } from '../catalog/list.js'
import { createComposerListSync } from '../catalog/composer-sync.js'
import { SettingsConfig } from '../settings/schema.js'
import { mountHubHttp } from './http.js'
import { mountComposerCommands } from './composer-commands.js'
import { hubHomeDir, hubProfileName } from './paths.js'
import { mountWebSocketHmr } from '../hmr/host.js'
import { mountPresetsTools } from '../presets/tools.js'
import { mountTemplatesTools } from '../templates/tools.js'
import { mountDecisions } from '../decisions/mount.js'

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
    settings: ctx.get?.('settings'),
    credentials: ctx.get?.('credentials'),
  }
  mountComposerCommands(ctx)
  // Session model pin: the composer's picker writes it here, the agent is told
  // about it each turn, and the media tools fall back to it when `model` is
  // omitted. Owned by the hub so both readers share one authority.
  const sessionModelPreference = createSessionModelPreference()
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
        httpCtx.effect(() => registerWorkbenchHttpRoutes(server, { mailbox, getConnection: () => ctx.get?.('connection') }), 'omnimux: workbench HTTP')
        httpCtx.effect(() => registerSessionModelRoutes(server, { preference: sessionModelPreference }), 'omnimux: session model HTTP')
        httpCtx.effect(() => registerDirectMediaRoutes(server, {
          executeImage: (req) => executeOmnimuxImage({ ...req, media: hub.media, store, credentials: ctx.get?.('credentials'), runtimeSettings: ctx.get?.('settings')?.get?.('omnimux') }),
          executeVideo: (req) => executeOmnimuxVideo({ ...req, media: hub.media, store, credentials: ctx.get?.('credentials'), runtimeSettings: ctx.get?.('settings')?.get?.('omnimux') }),
        }), 'omnimux: direct media generate HTTP')
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
      // The settings service arrives after httpDeps is built; hand it to the
      // HTTP faces (BYOK / agent routes) only once it actually exists.
      httpDeps.settings = settings
      const scope = settings.register('omnimux', SettingsConfig, {
        base: {
          defaultTextModel: hub.text.defaultModel,
          defaultImageModel: hub.media.providers.omnimux.models.image,
          defaultVideoModel: hub.media.providers.omnimux.models.video,
          defaultAudioModel: hub.media.providers.omnimux.models.audio,
        },
      })
      // The composer's text-model list is a settings surface of the pi-ai
      // provider route. Keep it in step with the hub: the hub decides which
      // models are in play, the shipped profile describes them, and the
      // visibility field below can only subtract from that set.
      const logComposerSync = (event, detail) => {
        try {
          ctx.logger?.info?.(`omnimux: ${event}`, detail ?? {})
        } catch {
          /* logging must never break the sync */
        }
      }
      const composerSync = createComposerListSync({ settings, log: logComposerSync })
      /**
       * The stored OmniMux settings. `register()` hands back a scope carrying
       * `get()`; the service read is the fallback, so a scope without it still
       * yields the stored value instead of silently dropping the user's
       * visibility choice.
       */
      const readOmnimuxSettings = () => {
        if (scope && typeof scope.get === 'function') return scope.get()
        const settingsService = typeof ctx.get === 'function' ? ctx.get('settings') : undefined
        return settingsService && typeof settingsService.get === 'function'
          ? settingsService.get('omnimux')
          : undefined
      }
      let retryTimer = null
      const syncComposerList = async (retryStep = 0) => {
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        const current = readOmnimuxSettings()
        const hiddenIds = current && typeof current === 'object' ? current.composerHiddenModels : undefined
        let hubText
        try {
          hubText = listCatalog().text
        } catch (error) {
          // `buildModelCatalog` is fail-closed: an unhealthy contract throws
          // rather than serving a partial directory. The composer keeps its last
          // accepted list, and plugin startup must not fail because of it.
          logComposerSync('composer-list-hub-unavailable', {
            message: error instanceof Error ? error.message : String(error),
          })
          return
        }
        try {
          const res = await composerSync.sync({ hubText, hiddenIds })
          // If llm-pi-ai settings namespace registration lagged behind in
          // Cordis startup order, back off and retry up to 3 times so the list
          // converges without waiting for an external settings change.
          if (res && res.reason === 'namespace-absent' && retryStep < 3) {
            const delays = [300, 1000, 2500]
            retryTimer = setTimeout(() => {
              retryTimer = null
              void syncComposerList(retryStep + 1)
            }, delays[retryStep])
          }
        } catch {
          /* fail-closed: unhandled error must not propagate */
        }
      }

      if (scope && typeof scope.watch === 'function') {
        scope.watch(() => {
          ctx.emit?.('omnimux/model-catalog-updated')
          void syncComposerList(0)
        })
      }

      // Re-sync on adapter mount/update so lagging provider registrations converge.
      if (typeof ctx.on === 'function') {
        ctx.on('llm/adapters-updated', () => {
          void syncComposerList(0)
        })
        ctx.on('omnimux/model-catalog-updated', () => {
          void syncComposerList(0)
        })
      }

      void syncComposerList(0)
    })
  }

  const jsonOut = JSON_TOOL_OUTPUT
  const mediaDeps = { media: hub.media, gate: hub.gate, store, jsonOut, sessionModel: sessionModelPreference }
  mountMedia(ctx, { kind: 'video', execute: executeOmnimuxVideo, ...mediaDeps })
  mountMedia(ctx, { kind: 'image', execute: executeOmnimuxImage, ...mediaDeps })
  mountMedia(ctx, { kind: 'audio', execute: executeOmnimuxAudio, ...mediaDeps })
  mountAudioVoices(ctx, { gate: hub.gate, jsonOut })
  mountSpeechToText(ctx, { execute: executeOmnimuxSpeechToText, media: hub.media, gate: hub.gate, store, jsonOut })
  mountTextComplete(ctx, hub, jsonOut, rethrow)
  mountOfficial(ctx, {
    accountMetaStore,
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
  mountDecisions(ctx, {
    hub,
    objectParams,
    jsonOut,
    rethrow,
    credentials: ctx.get?.('credentials'),
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
  mountPresetsTools(ctx)
  mountTemplatesTools(ctx)
  mountCanvasGenerationEvents(ctx, { hubEvents })
  mountSurfaceFollow(ctx, {
    mailbox,
    getSettings: () => {
      const s = typeof ctx.get === 'function' ? ctx.get('settings') : null
      return s && typeof s.get === 'function' ? s.get('omnimux') : null
    },
  })
  mountWorkbenchContextInjector(ctx, { mailbox })
  mountSessionModelInjector(ctx, { preference: sessionModelPreference })
  if (typeof ctx.on === 'function') mountCommentInjector(ctx)
  mountContractsPrompt(ctx)
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
