import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'

const SCRIPT_METHOD = 'Debugger.scriptParsed'
const MAX_SCRIPT_EVENTS = 1000
const requireFromHere = createRequire(import.meta.url)
const { parse } = requireFromHere('acorn')
const { transform } = requireFromHere('esbuild')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** Remove only comments and non-semantic whitespace with the project's bundler. */
async function canonicalCode(source) {
  const result = await transform(source, {
    loader: 'js',
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    legalComments: 'none',
    sourcemap: false,
  })
  assert.equal(typeof result.code, 'string', 'esbuild did not produce normalized JavaScript')
  // A standalone transform retains a terminal newline, while the same client
  // bundle in the middle of the Host concat is immediately followed by the
  // next factory. That boundary is not executable code.
  return result.code.trimEnd()
}

function propertyName(property) {
  if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function isModuleLoaderCall(node) {
  const callee = node?.type === 'ExpressionStatement' ? node.expression : null
  if (callee?.type !== 'CallExpression' || callee.optional) return false
  const load = callee.callee
  const loader = load?.type === 'MemberExpression' && !load.computed && !load.optional && load.property?.type === 'Identifier' && load.property.name === 'load'
    ? load.object
    : null
  return loader?.type === 'MemberExpression'
    && !loader.computed
    && !loader.optional
    && loader.object?.type === 'Identifier'
    && loader.object.name === 'window'
    && loader.property?.type === 'Identifier'
    && loader.property.name === '__ModuleLoader__'
}

function moduleRegistration(statement, source) {
  if (!isModuleLoaderCall(statement)) return null
  const call = statement.expression
  assert.equal(call.arguments.length, 1, 'Module loader registration must have exactly one argument')
  const descriptor = call.arguments[0]
  assert.equal(descriptor?.type, 'ObjectExpression', 'Module loader registration must use an object literal')
  assert.ok(descriptor.properties.every((property) => propertyName(property) !== null), 'Module loader registration must use plain, static id and factory properties')
  const ids = descriptor.properties.filter((property) => propertyName(property) === 'id')
  const factories = descriptor.properties.filter((property) => propertyName(property) === 'factory')
  assert.equal(ids.length, 1, 'Module loader registration must have exactly one static id')
  assert.equal(factories.length, 1, 'Module loader registration must have exactly one function factory')
  assert.ok(ids[0].value?.type === 'Literal' && typeof ids[0].value.value === 'string', 'Module loader registration must have a static string id')
  assert.ok(['ArrowFunctionExpression', 'FunctionExpression'].includes(factories[0].value?.type), 'Module loader registration must have a function factory')
  assert.ok(!factories[0].value.async && !factories[0].value.generator, 'Module loader registration factory must be synchronous')
  return { id: ids[0].value.value, source: source.slice(statement.start, statement.end) }
}

function parseProgram(source, label) {
  try {
    return parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  } catch (error) {
    throw new SyntaxError(`Unable to parse ${label}: ${error.message}`, { cause: error })
  }
}

function runtimeRegistrations(source, label) {
  return parseProgram(source, label).body.flatMap((statement) => {
    const registration = moduleRegistration(statement, source)
    return registration ? [registration] : []
  })
}

function declaredRegistration(source, plugin, path) {
  const program = parseProgram(source, `${plugin} declared client bundle ${path}`)
  const statements = program.body.filter((statement) => statement.type !== 'EmptyStatement')
  assert.equal(statements.length, 1, `${plugin} declared client bundle must contain exactly one top-level registration`)
  const registration = moduleRegistration(statements[0], source)
  assert.ok(registration, `${plugin} declared client bundle must contain exactly one top-level registration`)
  assert.equal(registration.id, plugin, `${plugin} declared client bundle registers the wrong module: ${registration.id}`)
  return registration
}

function cleanPluginId(value) {
  assert.equal(typeof value, 'string', 'Plugin identifier must be a string')
  assert.match(value, /^omnimux(?:-[a-z0-9-]+)?$/, `Invalid OmniMux plugin identifier: ${value}`)
  return value
}

function pluginFromTarget(target) {
  if (typeof target === 'string') return cleanPluginId(target)
  if (target?.plugin) return cleanPluginId(target.plugin)
  if (target?.tabId) return cleanPluginId(String(target.tabId).split(':', 1)[0])
  if (target?.stage) return cleanPluginId(`omnimux-${target.stage}`)
  throw new Error('Runtime proof target is missing plugin, tabId, or stage')
}

/** Resolve the bundle declared by a plugin package, never a guessed source path. */
export function declaredClientBundle(root, plugin) {
  const packageFile = join(root, 'plugins', plugin, 'package.json')
  assert.ok(existsSync(packageFile), `Missing package manifest for ${plugin}`)
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'))
  const manifestFile = join(root, 'plugins', plugin, 'dsh.manifest.json')
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {}
  const candidate = typeof manifest.client === 'string' ? manifest.client
    : typeof manifest.client?.entry === 'string' ? manifest.client.entry
      : typeof pkg.dsh?.client?.entry === 'string' ? pkg.dsh.client.entry
        : typeof pkg.exports?.['./client'] === 'string' ? pkg.exports['./client']
          : null
  assert.ok(candidate, `${plugin} does not declare a browser client bundle`)
  assert.ok(!candidate.startsWith('/') && !candidate.split(/[\\/]+/).includes('..'), `${plugin} has an unsafe client bundle declaration`)
  const file = resolve(root, 'plugins', plugin, candidate)
  const pluginRoot = `${resolve(root, 'plugins', plugin)}${sep}`
  assert.ok(file.startsWith(pluginRoot), `${plugin} client bundle escapes its plugin root`)
  assert.ok(existsSync(file), `${plugin} declared client bundle is missing: ${relative(root, file)}`)
  const source = readFileSync(file, 'utf8')
  assert.ok(source.length > 0, `${plugin} declared client bundle is empty: ${relative(root, file)}`)
  return { plugin, path: relative(root, file), source, sha256: sha256(source), bytes: Buffer.byteLength(source) }
}

function eventsFrom(response) {
  return response?.events || response?.items || []
}

function scriptParsed(event) {
  const params = event?.params || event
  return params?.scriptId ? params : null
}

function isPluginBundleScript(script, requestedUrl) {
  if (!script.url) return false
  try {
    const parsed = new URL(script.url, requestedUrl)
    return parsed.origin === new URL(requestedUrl).origin && parsed.pathname.startsWith('/plugins/')
  } catch {
    return false
  }
}

function urlMentionsPlugin(url, plugin) {
  const escaped = plugin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[/?&,=])${escaped}(?=$|[/?&,=])`).test(url)
}

async function assertTabOrigin(tab, url, phase) {
  const actual = await tab.url()
  assert.equal(new URL(actual).origin, new URL(url).origin, `IAB tab origin changed ${phase}: expected ${new URL(url).origin}, got ${new URL(actual).origin}`)
  return actual
}

/**
 * Bind a selected IAB tab to the exact plugin client bundles currently loaded
 * by its renderer. Only same-origin /plugins/ loader scripts are read; source
 * is intentionally kept in-memory only.
 */
export async function captureRuntimeProof(tab, { root, targets = [], url, target, allocation } = {}) {
  assert.ok(tab?.capabilities?.get, 'Selected IAB tab does not expose capabilities.get')
  assert.ok(root && url, 'Runtime proof requires root and requested URL')
  assert.ok(Array.isArray(targets), 'Runtime proof targets must be an array')
  const plugins = [...new Set(['omnimux', ...targets.map(pluginFromTarget)])]
  const bundles = await Promise.all(plugins.map(async (plugin) => {
    const bundle = declaredClientBundle(root, plugin)
    const registration = declaredRegistration(bundle.source, plugin, bundle.path)
    const normalized = await canonicalCode(registration.source)
    return {
      ...bundle,
      registration: registration.source,
      registrationSha256: sha256(registration.source),
      normalized,
      codeSha256: sha256(normalized),
    }
  }))
  const beforeUrl = await assertTabOrigin(tab, url, 'before proof')
  const cdp = await tab.capabilities.get('cdp')
  assert.ok(cdp?.send && cdp?.readEvents, 'Selected IAB tab does not expose the CDP Debugger API')

  let enabled = false
  let operationError
  try {
    const cursor = await cdp.readEvents({ methods: [SCRIPT_METHOD] })
    assert.ok(cursor && Object.hasOwn(cursor, 'cursor'), 'CDP script event cursor is missing')
    assert.ok(!cursor.truncated && !cursor.hasMore, 'CDP script event cursor is incomplete')
    await cdp.send('Debugger.enable')
    enabled = true
    const scriptsResponse = await cdp.readEvents({ afterSequence: cursor.cursor, methods: [SCRIPT_METHOD], limit: MAX_SCRIPT_EVENTS })
    assert.ok(!scriptsResponse?.truncated && !scriptsResponse?.hasMore, 'CDP script event capture is incomplete')
    const parsed = eventsFrom(scriptsResponse).map(scriptParsed).filter(Boolean)
    assert.ok(parsed.length > 0, 'CDP emitted no parsed scripts after Debugger.enable')
    const ids = new Set()
    const scripts = []
    for (const event of parsed) {
      if (ids.has(event.scriptId)) continue
      ids.add(event.scriptId)
      if (!isPluginBundleScript(event, url)) continue
      const response = await cdp.send('Debugger.getScriptSource', { scriptId: event.scriptId })
      assert.equal(typeof response?.scriptSource, 'string', `CDP returned no source for script ${event.scriptId}`)
      scripts.push({ scriptId: event.scriptId, url: event.url || '', source: response.scriptSource })
    }
    assert.ok(scripts.length > 0, 'CDP emitted no same-origin /plugins/ bundle scripts after Debugger.enable')
    const targetPlugins = new Set(plugins)
    await Promise.all(scripts.map(async (script) => {
      script.registrations = runtimeRegistrations(script.source, `CDP script ${script.scriptId}`)
      await Promise.all(script.registrations
        .filter((registration) => targetPlugins.has(registration.id))
        .map(async (registration) => { registration.normalized = await canonicalCode(registration.source) }))
      // This digest still identifies the complete Host script. It is evidence,
      // not the module comparison unit, because concat can rename local symbols.
      script.normalized = await canonicalCode(script.source)
    }))
    const proofBundles = bundles.map((bundle) => {
      const versionDigests = new Set(scripts.filter((script) => urlMentionsPlugin(script.url, bundle.plugin))
        .map((script) => sha256(script.source)))
      assert.ok(versionDigests.size <= 1, `${bundle.plugin} has ambiguous old/new client scripts in the IAB renderer`)
      const candidates = scripts.flatMap((script) => script.registrations
        .filter((registration) => registration.id === bundle.plugin)
        .map((registration) => ({ script, registration })))
      assert.ok(candidates.length > 0, `${bundle.plugin} current client bundle is not loaded in the IAB renderer`)
      assert.equal(candidates.length, 1, `${bundle.plugin} has multiple registrations in the IAB renderer`)
      const loaded = candidates[0]
      assert.ok(loaded.registration.normalized === bundle.normalized, `${bundle.plugin} loaded registration does not match its current client bundle`)
      const rawExact = loaded.registration.source === bundle.registration
      return {
        plugin: bundle.plugin,
        bundlePath: bundle.path,
        bundleSha256: bundle.sha256,
        bundleRegistrationSha256: bundle.registrationSha256,
        bundleCodeSha256: bundle.codeSha256,
        bundleBytes: bundle.bytes,
        loadedScriptUrl: loaded.script.url || null,
        loadedScriptSha256: sha256(loaded.script.source),
        loadedScriptCodeSha256: sha256(loaded.script.normalized),
        loadedRegistrationSha256: sha256(loaded.registration.source),
        loadedRegistrationCodeSha256: sha256(loaded.registration.normalized),
        match: rawExact ? 'raw-registration' : 'normalized-registration',
        matchingRegistrationCount: candidates.length,
      }
    })
    const afterUrl = await assertTabOrigin(tab, url, 'after proof')
    return {
      requestedOrigin: new URL(url).origin,
      beforeUrl,
      afterUrl,
      target: target || null,
      allocation: allocation || null,
      scriptCount: scripts.length,
      bundles: proofBundles,
    }
  } catch (error) {
    operationError = error
    throw error
  } finally {
    if (enabled) {
      try {
        await cdp.send('Debugger.disable')
      } catch (disableError) {
        if (!operationError) throw disableError
      }
    }
  }
}

/** Compare content identity only; CDP script IDs are session-local metadata. */
export function assertRuntimeProofStable(before, after) {
  assert.deepEqual({
    requestedOrigin: before?.requestedOrigin,
    target: before?.target,
    allocation: before?.allocation,
    bundles: before?.bundles?.map(({ plugin, bundlePath, bundleSha256, bundleRegistrationSha256, bundleCodeSha256, bundleBytes, loadedScriptUrl, loadedScriptSha256, loadedScriptCodeSha256, loadedRegistrationSha256, loadedRegistrationCodeSha256, match, matchingRegistrationCount }) =>
      ({ plugin, bundlePath, bundleSha256, bundleRegistrationSha256, bundleCodeSha256, bundleBytes, loadedScriptUrl, loadedScriptSha256, loadedScriptCodeSha256, loadedRegistrationSha256, loadedRegistrationCodeSha256, match, matchingRegistrationCount })),
  }, {
    requestedOrigin: after?.requestedOrigin,
    target: after?.target,
    allocation: after?.allocation,
    bundles: after?.bundles?.map(({ plugin, bundlePath, bundleSha256, bundleRegistrationSha256, bundleCodeSha256, bundleBytes, loadedScriptUrl, loadedScriptSha256, loadedScriptCodeSha256, loadedRegistrationSha256, loadedRegistrationCodeSha256, match, matchingRegistrationCount }) =>
      ({ plugin, bundlePath, bundleSha256, bundleRegistrationSha256, bundleCodeSha256, bundleBytes, loadedScriptUrl, loadedScriptSha256, loadedScriptCodeSha256, loadedRegistrationSha256, loadedRegistrationCodeSha256, match, matchingRegistrationCount })),
  }, 'Runtime proof changed while the browser QA was running')
}
