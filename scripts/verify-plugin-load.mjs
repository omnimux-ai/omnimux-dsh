#!/usr/bin/env node
/**
 * verify-plugin-load.mjs — real-Cordis plugin load check (Issue #2891 / AC-5).
 *
 * For every plugin package under plugins/ (and any workspace dir passed), this checker:
 *  1. imports its declared host entry (package.json exports["."]) with the real
 *     @deepseek-ai/cordis resolved from the plugin's own node_modules;
 *  2. provides ONLY the services that plugin declares in `inject` (via a sibling provider
 *     fiber — the same shape DSH uses, where an undeclared ctx.<service> read throws
 *     `cannot get property "<name>" without inject`);
 *  3. runs `ctx.plugin(plugin, config)` where config comes from the plugin's own
 *     `cordis.patch.yml` insert entry, and waits for the fiber;
 *  4. FAILS the package when the fiber throws, ends in a failed state, or never activates
 *     (missing/incorrectly-declared inject).
 *
 * When the package also ships a client entry (exports["./client"]), the bundle is
 * evaluated against a real-module-fallback-stub require inside minimal browser-ish
 * globals, then the same Cordis inject check runs with client-side service stubs —
 * catching the historical "ctx.slots without inject" loader crash class (#2712).
 * Both bundle formats are supported: plain CJS (module.exports) and the production
 * `window.__ModuleLoader__.load({id, factory})` wrapper. A declared-but-missing client
 * bundle fails loudly rather than silently skipping the check (#2956).
 * Client checks run in tolerantApply mode: effect/inject callback errors are recorded
 * per label instead of aborting, so one environment-fidelity stub error cannot mask a
 * real unbound-identifier ReferenceError registered later — that crash class is what
 * let #2950's `injectMediaViewerStyles is not defined` reach main.
 *
 * Fixture self-test: scripts/verify-plugin-load.test.mjs drives this checker over
 * scripts/test-fixtures/plugin-load/ — a fixture that reads an undeclared service must
 * fail; a well-formed fixture must pass.
 *
 * Usage: node scripts/verify-plugin-load.mjs [--json <file>] [--only <pkg> ...] [--fixtures]
 *         [--skip-missing-client]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir as osTmpdir } from 'node:os'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Workspace directories scanned for plugin packages. */
const WORKSPACE_DIRS = ['plugins', 'packages']

/** Services a client-side ctx may offer; provided as permissive stubs for declared injects. */
const PERMISSIVE_PROXY_KEYS = new Set(['then', 'symbol'])

/**
 * A deep "absorb-anything" service stub: every property returns another callable proxy so
 * apply-time calls like ctx.tools.register(...) or ctx.webServer.route({...}) succeed.
 * `then`/symbols return undefined so the stub is never thenable or iterable — and so
 * Cordis's `Object.hasOwn(value, symbols.shadow)` check stays false (a universal `has` or
 * descriptor trap makes Cordis unwrap the stub to its prototype and reads go undefined).
 */
export function serviceStub(label) {
  const fn = function () {}
  const proxy = new Proxy(fn, {
    get(_t, prop) {
      if (prop === 'then' || prop === 'constructor' || prop === 'prototype' || prop === 'name' ||
          prop === 'length' || prop === 'caller' || prop === 'callee' || prop === 'arguments' ||
          typeof prop === 'symbol') {
        if (prop === 'valueOf' || prop === 'toString') return () => ''
        return undefined
      }
      return proxy
    },
    apply() {
      return proxy
    },
    construct() {
      return proxy
    },
  })
  return proxy
}

/** Names Cordis or the harness core gives every ctx; these never need inject. */
const BUILTIN_CTX_PROPS = new Set([
  'on', 'off', 'once', 'emit', 'parallel', 'effect', 'dispose', 'plugin', 'inject',
  'provide', 'get', 'set', 'scope', 'extend', 'isolate', 'intercept', 'logger',
  'root', 'fiber', 'registry', 'events', 'reflect', 'router', 'config', 'options',
])

/**
 * Resolve a plugin's declared host entry (exports["."]) and client entry (exports["./client"])
 * to absolute paths. Returns { entry, clientEntry } (either may be undefined).
 */
export function pluginEntries(pkgDir, manifest) {
  const def = (spec) => {
    if (!spec) return undefined
    const value = typeof spec === 'string' ? spec : (spec.import ?? spec.default ?? spec.require)
    if (!value) return undefined
    const abs = join(pkgDir, value)
    return existsSync(abs) ? abs : undefined
  }
  const exportsField = manifest.exports ?? {}
  const entry = def(exportsField['.']) ?? (manifest.main ? join(pkgDir, manifest.main) : undefined)
  const clientEntry = def(exportsField['./client'])
  // A declared-but-unbuilt client bundle must surface as a failure, not a silent skip:
  // lib/ is gitignored, so a fresh checkout or a missed build would otherwise exempt the
  // plugin's entire client-side apply check (#2950/#2956).
  const clientDeclared = Boolean(exportsField['./client'])
  return {
    entry: entry && existsSync(entry) ? entry : undefined,
    clientEntry,
    clientDeclared,
  }
}

/** Plugins whose server apply() is expected to set HTTP listeners on real ports in dev; they still must load. */
export function discoverPlugins(root = repoRoot) {
  const found = []
  for (const group of WORKSPACE_DIRS) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(base, entry.name)
      const manifestPath = join(dir, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      // Workspace libraries (dsh-ui-kit, craft, form-contract) are not Cordis
      // plugins: they have no cordis.patch.yml. Skip rather than fail on apply/inject.
      if (!existsSync(join(dir, 'cordis.patch.yml'))) continue
      const { entry: hostEntry, clientEntry, clientDeclared } = pluginEntries(dir, manifest)
      if (!hostEntry && !clientEntry && !clientDeclared) continue
      found.push({ name: manifest.name || entry.name, dir, hostEntry, clientEntry, clientDeclared })
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** Read the plugin's `inject` list from its module exports (host or evaluated client bundle). */
export function normalizeInject(inject) {
  if (!inject) return []
  if (Array.isArray(inject)) return inject
  if (typeof inject === 'object') {
    const names = []
    for (const [name, cfg] of Object.entries(inject)) {
      names.push(name)
    }
    return names
  }
  return []
}

/**
 * Evaluate a client bundle with a permissive require, return its module.exports.
 * The bundle's externals (react, @deepseek-ai/*, etc.) receive deep stubs.
 *
 * Two bundle formats are supported:
 *  - plain CJS: the code assigns to `module.exports` directly;
 *  - `window.__ModuleLoader__.load({id, factory})` (the plugins' production wrapper):
 *    the registration is captured by the real loader stub in makeClientEnv, and each
 *    captured factory is executed afterwards with the same stub require. This is the
 *    format nearly every plugin ships; without it, eval yields {} and the client-side
 *    apply/inject check silently never runs (#2950/#2956).
 */
export function evalClientBundle(file) {
  const code = readFileSync(file, 'utf8')
  const moduleObj = { exports: {} }
  const fn = new Function('module', 'exports', 'require', 'window', 'document', 'globalThis', 'self', 'top', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'location', 'navigator', 'console', 'fetch', code)
  // Prefer the REAL module over a stub: esbuild's __toESM() copies own enumerable
  // properties, which an absorb-anything proxy cannot provide — `extends EventEmitter`
  // or `React.createContext` then collapse to undefined (omnimux-clip/omnimux-forms).
  const realRequire = createRequire(file)
  const fakeRequire = (id) => {
    try { return realRequire(id) } catch { return serviceStub(`require:${id}`) }
  }
  const env = makeClientEnv()
  // Deferred effect callbacks execute under Cordis later, in the real Node global
  // scope — the Function-parameter globals above only exist during eval. Install the
  // browser stubs on globalThis as well so callbacks resolve them at run time.
  const installedGlobals = []
  for (const key of ['HTMLStyleElement', 'HTMLElement', 'HTMLDivElement', 'HTMLAnchorElement',
    'HTMLIFrameElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLVideoElement', 'HTMLCanvasElement', 'HTMLTemplateElement', 'SVGElement', 'Element',
    'Node', 'DocumentFragment', 'ShadowRoot', 'DOMParser', 'CSSStyleSheet', 'CSS',
    'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'Event', 'CustomEvent',
    'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'InputEvent', 'FileReader',
    'Image', 'Audio', 'getComputedStyle']) {
    if (env[key] !== undefined && globalThis[key] === undefined) {
      globalThis[key] = env[key]
      installedGlobals.push(key)
    }
  }
  fn(
    moduleObj,
    moduleObj.exports,
    fakeRequire,
    env.window,
    env.document,
    env.globalThis ?? env,
    env.self ?? env.window,
    env.top ?? env.window,
    env.setTimeout,
    env.clearTimeout,
    env.setInterval,
    env.clearInterval,
    env.requestAnimationFrame,
    env.cancelAnimationFrame,
    env.location,
    env.navigator,
    console,
    env.fetch,
  )
  if (env.moduleLoaderRegistrations.length === 0) return moduleObj.exports
  // __ModuleLoader__ bundles: run each registered factory and collect its exports.
  // A factory that surfaces the real plugin module (apply/inject) wins over partial
  // registrations; merge into one object as a fallback.
  let primary
  const merged = {}
  for (const reg of env.moduleLoaderRegistrations) {
    if (typeof reg?.factory !== 'function') continue
    const mod = reg.factory(fakeRequire) ?? {}
    for (const [k, v] of Object.entries(mod)) merged[k] = v
    if (!primary && (mod.apply || mod.inject)) primary = mod
  }
  return primary ?? merged
}

/**
 * Minimal browser-ish globals for client-bundle eval. Plugins registering slot factories
 * at apply-time typically don't render; DOM calls get permissive stubs, timers are real.
 *
 * `window.__ModuleLoader__` is REAL, not a stub: the plugins' client bundles are built as
 * `window.__ModuleLoader__.load({id, factory})` wrappers (#2950 regression showed a
 * stubbed loader silently drops the factory, so eval returns {} and the apply/inject
 * check never runs). Registrations are collected on env.moduleLoaderRegistrations so
 * evalClientBundle can execute the captured factory afterwards.
 */
function makeClientEnv() {
  const moduleLoaderRegistrations = []
  const moduleLoader = { load: (reg) => moduleLoaderRegistrations.push(reg) }
  const element = serviceStub('element')
  element.addEventListener = () => () => {}
  element.appendChild = (x) => x
  element.createElement = () => serviceStub('element')
  const document = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'head' || prop === 'body' || prop === 'documentElement') return element
      if (prop === 'createElement' || prop === 'createElementNS' || prop === 'getElementById' || prop === 'querySelector' || prop === 'querySelectorAll') return (...args) => (Array.isArray(args) && args[0]?.includes('All') ? [] : serviceStub('element'))
      if (prop === 'addEventListener' || prop === 'removeEventListener' || prop === 'dispatchEvent') return () => {}
      return element
    },
  })
  const window = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'document') return document
      if (prop === 'navigator') return { language: 'en-US', userAgent: 'plugin-load-check' }
      if (prop === 'location') return { href: 'http://localhost/', search: '', hash: '', protocol: 'http:', host: 'localhost', hostname: 'localhost', port: '', pathname: '/' }
      if (prop === 'localStorage' || prop === 'sessionStorage') return { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }
      if (prop === 'matchMedia') return () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
      if (prop === '__DSH_BOOT__' || prop === '__omnimuxWorkbench' || prop === '__omnimuxLocale') return serviceStub(prop)
      if (prop === '__ModuleLoader__' || prop === 'ModuleLoader') return moduleLoader
      if (prop === 'addEventListener' || prop === 'removeEventListener') return () => {}
      if (prop === 'open') return () => null
      return serviceStub(`window.${String(prop)}`)
    },
    set() { return true },
  })
  const timers = {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout,
    setInterval: (...args) => setInterval(...args),
    clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  }
  // Browser globals bundles legitimately touch at apply-time. Without them the eval
  // throws ReferenceError (e.g. `HTMLStyleElement is not defined`) which is an
  // environment-fidelity artifact, not a plugin bug.
  class StubElement {}
  const browserGlobals = {
    HTMLElement: StubElement,
    HTMLStyleElement: class extends StubElement {},
    HTMLDivElement: class extends StubElement {},
    HTMLAnchorElement: class extends StubElement {},
    HTMLIFrameElement: class extends StubElement {},
    HTMLImageElement: class extends StubElement {},
    HTMLInputElement: class extends StubElement {},
    HTMLTextAreaElement: class extends StubElement {},
    HTMLVideoElement: class extends StubElement {},
    HTMLCanvasElement: class extends StubElement {},
    HTMLTemplateElement: class extends StubElement {},
    SVGElement: class extends StubElement {},
    Element: StubElement,
    Node: class {},
    DocumentFragment: class {},
    ShadowRoot: class {},
    DOMParser: class { parseFromString() { return serviceStub('parsed-doc') } },
    CSSStyleSheet: class { replace() {} replaceSync() {} },
    CSS: { supports: () => true, escape: (v) => String(v) },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return [] } },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    Event: class {},
    CustomEvent: class extends Event { constructor(type, init) { super(); this.detail = init?.detail } },
    KeyboardEvent: class extends Event {},
    MouseEvent: class extends Event {},
    PointerEvent: class extends Event {},
    WheelEvent: class extends Event {},
    InputEvent: class extends Event {},
    FileReader: class {},
    Image: class {},
    Audio: class {},
    getComputedStyle: () => serviceStub('computed-style'),
  }
  return {
    window,
    document,
    globalThis: window,
    self: window,
    top: window,
    ...timers,
    ...browserGlobals,
    location: window.location,
    navigator: window.navigator,
    fetch: (...args) => Promise.reject(new Error(`load check blocked fetch ${args[0]}`)),
    moduleLoaderRegistrations,
  }
}

/**
 * Parse a plugin's `cordis.patch.yml` for the config of this plugin's insert entry.
 * `!!js` tagged values resolve to `process.env.X` when the expression is
 * `process.env.NAME`; anything else evaluates to undefined (config validation then
 * surfaces the required value — same signal production sees without the env).
 */
export function patchConfig(pkgDir, manifest) {
  const patchPath = join(pkgDir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return undefined
  try {
    const yaml = resolvePackage(pkgDir, 'yaml')
    if (!yaml) return undefined
    const doc = yaml.parse(readFileSync(patchPath, 'utf8'), {
      customTags: [
        {
          tag: 'tag:yaml.org,2002:js/function',
          resolve: (str) => {
            const m = /^process\.env\.([A-Z0-9_]+)/.exec(String(str).trim())
            if (m) return process.env[m[1]]
            const n = Number(str)
            if (!Number.isNaN(n)) return n
            return undefined
          },
        },
        {
          tag: '!js',
          resolve: (str) => {
            const m = /^process\.env\.([A-Z0-9_]+)/.exec(String(str).trim())
            if (m) return process.env[m[1]]
            return undefined
          },
        },
      ],
    })
    const name = manifest.name
    const rows = doc?.insert ?? []
    for (const row of rows) {
      if (row && (row.name === name || row.id === name || row.id === pkgDir.split('/').pop())) {
        return row.config
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** resolvePackage: find a package resolvable from a directory (its own node_modules, then repo root). */
function resolvePackage(fromDir, name) {
  const require = createRequire(join(fromDir, 'package.json'))
  try {
    return require(name)
  } catch {
    const rootRequire = createRequire(join(repoRoot, 'package.json'))
    try {
      return rootRequire(name)
    } catch {
      return null
    }
  }
}

/**
 * Resolve a Cordis entry for the check: prefer the plugin's own installed copy (the peer
 * resolution DSH would satisfy), then any ascending node_modules, then the newest copy in
 * the repo pnpm store so fixtures and plain scripts still work.
 */
function resolveCordis(fromDir) {
  const require = createRequire(join(fromDir, 'package.json'))
  try {
    return require.resolve('@deepseek-ai/cordis')
  } catch { /* fall through */ }
  try {
    return require.resolve('@deepseek-ai/cordis', { paths: [repoRoot] })
  } catch { /* fall through */ }
  const store = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    const versions = readdirSync(store)
      .filter((d) => d.startsWith('@deepseek-ai+cordis@'))
      .sort()
    const newest = versions[versions.length - 1]
    if (newest) {
      const candidate = join(store, newest, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

const FIBER_ACTIVE = 2
const FIBER_FAILED = 3

/**
 * Load-check a single plugin module inside real Cordis, with only `inject` services provided.
 * `services` is the union of declared inject names; each becomes a sibling-provided stub.
 * @returns {{ok: boolean, reason?: string, declared: string[], fiberState?: number}}
 */
export async function checkPlugin({ module, services, config, label, timeoutMs = 8000, cordisPath, tolerantApply = false }) {
  const cordisModule = await import(pathToFileURL(cordisPath).href)
  const { Context } = cordisModule
  // Plugins legitimately read DSH_HOME during apply (forms opens a store there);
  // give the check a scratch home so load-time config validation runs the real path.
  const dshHome = process.env.DSH_HOME ?? mkdtempSync(join(osTmpdir(), 'verify-load-dsh-home-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome
  const ctx = new Context()
  const declared = normalizeInject(module.inject)
  // tolerantApply (client bundles): Cordis aborts apply() on the FIRST effect callback
  // that throws, which would let an environment-fidelity error (e.g. a stub service
  // method shape) mask a real unbound-identifier crash registered later (#2950/#2956).
  // Wrap the plugin's apply so every effect/inject callback error is recorded per label
  // instead of aborting the remaining callbacks; ReferenceErrors still fail the package.
  const recordedErrors = []
  const wrapCtx = (realCtx) => new Proxy(realCtx, {
    get(target, prop) {
      if (prop === 'effect') {
        return (fn, effectLabel) => {
          if (typeof fn !== 'function') return target.effect(fn, effectLabel)
          return target.effect(() => {
            try { return fn() } catch (err) { recordedErrors.push({ label: effectLabel, error: err }) }
          }, effectLabel)
        }
      }
      if (prop === 'inject') {
        return (deps, callback) => target.inject(deps, (inner) => {
          try { return callback(wrapCtx(inner)) } catch (err) { recordedErrors.push({ label: 'inject', error: err }) }
        })
      }
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
    has(target, prop) { return prop in target },
  })
  let module_ = module
  if (tolerantApply && typeof module.apply === 'function') {
    const realApply = module.apply
    module_ = { ...module, apply: (ctx2) => realApply(wrapCtx(ctx2)) }
  }

  // Sibling provider fiber: mimics the real host where services come from other plugins.
  await ctx.plugin({
    name: 'verify-load-host-stub',
    inject: [],
    apply(c) {
      for (const name of declared) {
        c.provide(name, stubFor(name))
      }
      // Common built-in-ish services that real hosts make available; stubs let apply() run.
      for (const extra of ['logger']) {
        try { c.provide(extra, serviceStub(`stub:${extra}`)) } catch { /* already present */ }
      }
    },
  })

  let fiber
  let thrown
  try {
    fiber = ctx.plugin(module_, config)
    const race = Promise.race([
      fiber.then(() => ({ settled: 'await' })),
      new Promise((r) => setTimeout(() => r({ settled: 'timeout' }), timeoutMs)),
    ])
    const outcome = await race
    if (outcome.settled === 'timeout') {
      return { ok: false, reason: `plugin fiber did not activate within ${timeoutMs}ms (missing inject: ${declared.join(',') || 'none'})`, declared, fiberState: fiber.state }
    }
  } catch (err) {
    thrown = err
  }
  if (thrown) {
    const msg = String(thrown?.message ?? thrown)
    const svc = /cannot get property "([^"]+)"/.exec(msg)?.[1]
    // Tolerant client path: the apply body itself may hit a stub-fidelity wall (e.g. an
    // injected service whose stub lacks a method). A ReferenceError is a real unbound
    // identifier — always a bug. Anything else downgrades to a warning.
    if (tolerantApply && !(thrown instanceof ReferenceError)) {
      recordedErrors.push({ label: 'apply', error: thrown })
    } else {
      return { ok: false, reason: `${msg}${svc ? ` (undeclared service: ${svc})` : ''}`, declared, fiberState: fiber?.state }
    }
  }
  if (fiber && fiber.state !== FIBER_ACTIVE && !tolerantApply) {
    return { ok: false, reason: `fiber ended in state ${fiber.state} (expected ${FIBER_ACTIVE}); declared inject: ${declared.join(',') || 'none'}`, declared, fiberState: fiber.state }
  }
  try {
    await fiber?.dispose?.()
  } catch { /* disposal best-effort */ }
  if (savedHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = savedHome
  // Under tolerantApply, callback errors were recorded instead of aborting. An unbound
  // identifier (ReferenceError: "X is not defined") is a real bug — fail. Other errors
  // are environment-fidelity artifacts of the stubbed services and stay warnings.
  const refErrors = recordedErrors.filter((e) => e.error instanceof ReferenceError)
  if (refErrors.length) {
    const detail = refErrors.map((e) => `[${e.label}] ${e.error.message}`).join('; ')
    return { ok: false, reason: `apply-time ReferenceError(s): ${detail}`, declared, fiberState: fiber?.state }
  }
  const warnings = recordedErrors.map((e) => `[${e.label}] ${e.error?.message ?? e.error}`)
  return { ok: true, declared, fiberState: fiber?.state, warnings }
}

/**
 * Per-service faithful stubs for the contract surface plugins actually touch at
 * apply() time. `permissionPresets` ships names + a defaultPreset the plugin
 * validates against; `storageDomain` must resolve .open() to a domain whose
 * .table(name) is Map-like ({get, set, put, delete, entries}).
 */
function stubFor(name) {
  if (name === 'permissionPresets') {
    return { names: ['read-only', 'ask'], defaultPreset: 'read-only', optionOf: (n) => n, set: () => {} }
  }
  if (name === 'storageDomain') {
    return {
      open: async () => {
        const store = new Map()
        return {
          table: () => ({
            get: (k) => store.get(k),
            set: (k, v) => { store.set(k, v) },
            put: (k, v) => { store.set(k, v) },
            delete: (k) => store.delete(k),
            entries: () => store.entries(),
          }),
          close: async () => {},
        }
      },
    }
  }
  if (name === 'agents') {
    return {
      roots: () => [],
      get: () => undefined,
      create: async () => ({ agent: { session: {}, whenIdle: async () => {} } }),
      withoutInitiator: async (fn) => fn?.(),
      events: { on: () => () => {} },
    }
  }
  if (name === 'locale') {
    return {
      register: () => () => {},
      bind: (ns) => () => ns,
      t: (key) => key,
      dicts: { get: () => new Map(), set: () => {}, has: () => false },
      onChange: () => () => {},
      current: () => 'en',
    }
  }
  if (name === 'slots') {
    return {
      inject: () => ({}),
      register: () => () => {},
      provide: () => () => {},
      list: () => [],
      get: () => undefined,
      slot: () => serviceStub('slot'),
    }
  }
  if (name === 'sessions') return { flush: async () => {}, list: () => [], get: () => undefined }
  if (name === 'workspaceRegistry') return { get: () => undefined, resolveByPath: async () => undefined }
  if (name === 'agentDefaultModel') return { currentSelection: () => undefined, resolve: async () => undefined }
  if (name === 'llm') return { listProviders: () => [], listModels: async () => [] }
  if (name === 'connection') return {
    rpc: { handle: () => () => {} },
    createSharedFetchHandler: () => ({ fetch: async () => new Response('not found', { status: 404 }) }),
  }
  return serviceStub(`stub:${name}`)
}

/**
 * Run the check for one plugin package: host entry first, then client bundle.
 * Returns a list of failure strings (empty = pass).
 */
export async function checkPackage(pkg, { verbose = false, skipMissingClient = false } = {}) {
  const failures = []
  const manifest = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
  const config = patchConfig(pkg.dir, manifest)

  if (pkg.hostEntry) {
    const cordisPath = resolveCordis(pkg.dir)
    if (!cordisPath) {
      failures.push(`${pkg.name}: cannot resolve @deepseek-ai/cordis from ${pkg.dir}`)
    } else {
      let module
      try {
        module = await import(pathToFileURL(pkg.hostEntry).href)
      } catch (err) {
        failures.push(`${pkg.name}: host entry import failed: ${err.message}`)
      }
      if (module) {
        const pluginModule = module.apply ? module : (module.default ?? module)
        if (!pluginModule.apply && !pluginModule.inject) {
          failures.push(`${pkg.name}: host entry exposes no apply/inject (not a Cordis plugin)`)
        } else {
          const result = await checkPlugin({ module: pluginModule, config, label: pkg.name, cordisPath })
          if (!result.ok) failures.push(`${pkg.name} (host): ${result.reason}`)
        }
      }
    }
  }

  if (pkg.clientDeclared && !pkg.clientEntry && !skipMissingClient) {
    failures.push(`${pkg.name}: exports["./client"] declared but bundle is missing — run the plugin's build first (e.g. node scripts/build-all.mjs)`)
  }
  if (pkg.clientEntry) {
    let exports_
    try {
      exports_ = evalClientBundle(pkg.clientEntry)
    } catch (err) {
      failures.push(`${pkg.name} (client): bundle eval failed: ${err.message}`)
    }
    if (exports_) {
      const cordisPath = resolveCordis(pkg.dir)
      if (!cordisPath) {
        failures.push(`${pkg.name}: cannot resolve @deepseek-ai/cordis for client check`)
      } else {
        const pluginModule = exports_.apply ? exports_ : (exports_.default ?? exports_)
        if (pluginModule.apply || pluginModule.inject) {
          const result = await checkPlugin({ module: pluginModule, config, label: pkg.name, cordisPath, tolerantApply: true })
          if (!result.ok) failures.push(`${pkg.name} (client): ${result.reason}`)
          else if (result.warnings?.length) {
            for (const w of result.warnings) console.log(`    ⚠ ${pkg.name} (client) apply warning: ${w}`)
          }
        }
      }
    }
  }
  return failures
}

function parseArgs(argv) {
  const opts = { json: '', only: [], fixtures: false, skipMissingClient: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') opts.json = argv[++i]
    else if (argv[i] === '--only') opts.only = argv.slice(i + 1).filter((v) => !v.startsWith('--')), (i = argv.length)
    else if (argv[i] === '--fixtures') opts.fixtures = true
    else if (argv[i] === '--skip-missing-client') opts.skipMissingClient = true
  }
  return opts
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  let packages = discoverPlugins()
  if (opts.only.length) {
    const unknown = opts.only.filter((n) => !packages.some((p) => p.name === n))
    if (unknown.length) {
      console.error(`unknown package(s): ${unknown.join(', ')}`)
      return 2
    }
    packages = packages.filter((p) => opts.only.includes(p.name))
  }

  const results = []
  for (const pkg of packages) {
    const failures = await checkPackage(pkg, { skipMissingClient: opts.skipMissingClient })
    results.push({ name: pkg.name, failures })
    const status = failures.length ? `FAIL (${failures.length})` : 'ok'
    console.log(`${pkg.name.padEnd(26)} ${status}`)
    for (const f of failures) console.log(`    ✖ ${f}`)
  }
  if (opts.json) {
    writeFileSync(opts.json, `${JSON.stringify(results, null, 2)}\n`)
  }
  const failed = results.filter((r) => r.failures.length)
  console.log(`\n${results.length - failed.length}/${results.length} package(s) passed plugin load check`)
  return failed.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const code = await main()
  process.exit(code)
}
