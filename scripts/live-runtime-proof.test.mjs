import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { assertRuntimeProofStable, captureRuntimeProof, declaredClientBundle } from './live-runtime-proof.mjs'

const { transform } = createRequire(import.meta.url)('esbuild')
const roots = []

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function registration(plugin, body = `return ${JSON.stringify(plugin)};`) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(plugin)},
  factory: (require) => {
    ${body}
  }
});`
}

function fixture(plugins = ['omnimux', 'omnimux-assets']) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-runtime-proof-'))
  roots.push(root)
  for (const plugin of plugins) {
    const dir = join(root, 'plugins', plugin, 'lib')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(root, 'plugins', plugin, 'package.json'), JSON.stringify({ name: plugin, exports: { './client': './lib/client.js' } }))
    writeFileSync(join(dir, 'client.js'), registration(plugin))
  }
  return root
}

function writeBundle(root, plugin, source) {
  writeFileSync(join(root, 'plugins', plugin, 'lib/client.js'), source)
}

function fakeTab({ origin = 'http://127.0.0.1:45120', scripts, hasMore = false, truncated = false }) {
  const calls = []
  const byId = new Map(scripts.map((script) => [script.scriptId, script.source]))
  return {
    calls,
    async url() { return `${origin}/` },
    capabilities: { async get(name) {
      assert.equal(name, 'cdp')
      return {
        async readEvents(options) {
          calls.push(['readEvents', options])
          return options.afterSequence === undefined ? { cursor: 4 } : {
            cursor: 8, hasMore, truncated,
            events: scripts.map(({ scriptId, url }) => ({ params: { scriptId, url } })),
          }
        },
        async send(method, params) {
          calls.push(['send', method, params])
          if (method === 'Debugger.getScriptSource') return { scriptSource: byId.get(params.scriptId) }
          return {}
        },
      }
    } },
  }
}

async function oldCanonicalCode(source) {
  const result = await transform(source, {
    loader: 'js',
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    legalComments: 'none',
    sourcemap: false,
  })
  return result.code.trimEnd()
}

test('binds the selected renderer to exact hub and selected plugin registrations', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const assets = declaredClientBundle(root, 'omnimux-assets').source
  const tab = fakeTab({ scripts: [
    { scriptId: '1', url: '/devtools/irrelevant.js', source: 'not a plugin bundle' },
    { scriptId: '2', url: '/plugins/all.js', source: `${hub}\n${assets}` },
  ] })
  const proof = await captureRuntimeProof(tab, { root, url: 'http://127.0.0.1:45120/', target: 'dev', targets: [{ tabId: 'omnimux-assets:library' }] })
  assert.equal(proof.bundles.length, 2)
  assert.equal(proof.bundles[1].plugin, 'omnimux-assets')
  assert.ok(proof.bundles.every((bundle) => bundle.bundleSha256 && bundle.loadedScriptSha256))
  assert.deepEqual(tab.calls.filter((call) => call[1] === 'Debugger.getScriptSource').map((call) => call[2].scriptId), ['2'])
  assert.ok(tab.calls.some((call) => call[1] === 'Debugger.disable'))
})

test('matches an isolated registration across concat identifier deconfliction and source-path comments', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const local = registration('omnimux-assets', 'var CSS = `.test {color:red}`; // ../../../omnimux-dsh-wt-current/node_modules/dsh-ui-kit/lib/index.js\n    return CSS;')
  const installed = registration('omnimux-assets', 'var CSS = `.test {color:red}`; // ../../../omnimux-dsh-wt-older/node_modules/dsh-ui-kit/lib/index.js\n    return CSS;')
  const next = 'window.__ModuleLoader__.load({id:"other",factory:require=>{return CSS.escape("x");}});'
  writeBundle(root, 'omnimux-assets', local)

  const isolated = await oldCanonicalCode(local)
  const concatenated = await oldCanonicalCode(`${local}\n;\n${next}`)
  assert.ok(isolated.includes('var CSS='))
  assert.ok(concatenated.includes('var CSS2='))
  assert.equal(concatenated.includes(isolated), false, 'old whole-script normalization must reproduce the false negative')
  assert.equal(`${hub}\n${installed}\n${next}`.includes(local), false, 'path comments must prevent a raw bundle match')

  const proof = await captureRuntimeProof(fakeTab({ scripts: [{
    scriptId: '1', url: '/plugins/??omnimux,omnimux-assets,other/client.js', source: `${hub}\n;\n${installed}\n;\n${next}`,
  }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] })
  const assets = proof.bundles.find((bundle) => bundle.plugin === 'omnimux-assets')
  assert.equal(assets.match, 'normalized-registration')
  assert.match(assets.loadedRegistrationSha256, /^[a-f0-9]{64}$/)
  assert.match(assets.loadedScriptSha256, /^[a-f0-9]{64}$/)
  assert.notEqual(assets.loadedRegistrationSha256, assets.loadedScriptSha256, 'registration and complete Host script fingerprints have distinct meanings')
})

test('ignores loader-like text in strings, templates, comments, and nested functions', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const assets = declaredClientBundle(root, 'omnimux-assets').source
  const decoys = [
    '"window.__ModuleLoader__.load({id:\\"omnimux-assets\\",factory:()=>{throw 1}})";',
    '`window.__ModuleLoader__.load({id:"omnimux-assets",factory:()=>{throw 2}})`;',
    '// window.__ModuleLoader__.load({id:"omnimux-assets",factory:()=>{throw 3}})',
    '/* window.__ModuleLoader__.load({id:"omnimux-assets",factory:()=>{throw 4}}) */',
    'function neverCalled() { window.__ModuleLoader__.load({id:"omnimux-assets",factory:()=>{throw 5}}); }',
  ].join('\n')
  const proof = await captureRuntimeProof(fakeTab({ scripts: [{
    scriptId: '1', url: '/plugins/??omnimux,omnimux-assets/client.js', source: `${decoys}\n${hub}\n${assets}`,
  }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] })
  assert.ok(proof.bundles.every((bundle) => bundle.matchingRegistrationCount === 1))
})

test('rejects wrong modules, mutated factories, and duplicate old/new registrations', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const assets = declaredClientBundle(root, 'omnimux-assets').source
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{
    scriptId: '1', url: '/plugins/??omnimux,omnimux-assets/client.js', source: `${hub}\n${registration('another-plugin')}`,
  }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /not loaded/)
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{
    scriptId: '1', url: '/plugins/??omnimux,omnimux-assets/client.js', source: `${hub}\n${registration('omnimux-assets', 'return "mutated";')}`,
  }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /does not match/)
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{
    scriptId: '1', url: '/plugins/??omnimux,omnimux-assets/client.js', source: `${hub}\n${assets}\n${registration('omnimux-assets', 'return "old";')}`,
  }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /multiple registrations/)
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [
    { scriptId: '1', url: '/plugins/omnimux/client.js', source: hub },
    { scriptId: '2', url: '/plugins/omnimux-assets/client.js?rev=new', source: assets },
    { scriptId: '3', url: '/plugins/omnimux-assets/client.js?rev=old', source: registration('omnimux-assets', 'return "old";') },
  ] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /ambiguous old\/new/)
})

test('rejects wrong origin, incomplete event pages, missing bundles, and parse failures', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const assets = declaredClientBundle(root, 'omnimux-assets').source
  await assert.rejects(captureRuntimeProof(fakeTab({ origin: 'http://127.0.0.1:44200', scripts: [] }), { root, url: 'http://127.0.0.1:45120/', targets: [] }), /origin changed before/)
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{ scriptId: '1', url: '/plugins/all.js', source: `${hub}\n${assets}` }], hasMore: true }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /incomplete/)
  writeBundle(root, 'omnimux-assets', '')
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /empty/)
  writeBundle(root, 'omnimux-assets', assets)
  await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{ scriptId: '1', url: '/plugins/all.js', source: `${hub}\nwindow.__ModuleLoader__.load({` }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), /parse|Unexpected token/i)
})

test('rejects dynamic or duplicate properties, invalid factories, and extra local statements', async () => {
  const root = fixture()
  const hub = declaredClientBundle(root, 'omnimux').source
  const invalid = [
    ['window.__ModuleLoader__.load({ id: pluginId, factory: () => true });', /static string id/],
    ['window.__ModuleLoader__.load({ id: "omnimux-assets", factory: true });', /function factory/],
    ['window.__ModuleLoader__.load({ id: "omnimux-assets", id: "omnimux-assets", factory: () => true });', /exactly one static id/],
    ['window.__ModuleLoader__.load({ id: "omnimux-assets", factory: () => true, factory: () => false });', /exactly one function factory/],
    ['window.__ModuleLoader__.load({ ["id"]: "omnimux-assets", factory: () => true });', /static id and factory properties/],
    ['window.__ModuleLoader__.load({ id: "omnimux-assets", get factory() { return () => true; } });', /static id and factory properties/],
    ['window.__ModuleLoader__.load({ id: "omnimux-assets", factory: () => true, ...extra });', /static id and factory properties/],
    [`${registration('omnimux-assets')}\nwindow.sideEffect = true;`, /exactly one top-level registration/],
    [`${registration('another-plugin')}\n${registration('omnimux-assets')}`, /exactly one top-level registration/],
  ]
  for (const [source, expected] of invalid) {
    writeBundle(root, 'omnimux-assets', source)
    await assert.rejects(captureRuntimeProof(fakeTab({ scripts: [{ scriptId: '1', url: '/plugins/all.js', source: hub }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] }), expected)
  }
  const withNonExecutableTrivia = `// generated bundle\n;;${registration('omnimux-assets')};;;/* end */`
  writeBundle(root, 'omnimux-assets', withNonExecutableTrivia)
  const proof = await captureRuntimeProof(fakeTab({ scripts: [{ scriptId: '1', url: '/plugins/all.js', source: `${hub}\n${withNonExecutableTrivia}` }] }), { root, url: 'http://127.0.0.1:45120/', targets: [{ plugin: 'omnimux-assets' }] })
  assert.equal(proof.bundles.find((bundle) => bundle.plugin === 'omnimux-assets').match, 'raw-registration')
})

test('stable proof compares registration and complete-script fingerprints', () => {
  const bundle = {
    plugin: 'omnimux',
    bundlePath: 'plugins/omnimux/lib/client.js',
    bundleSha256: 'disk',
    bundleRegistrationSha256: 'disk-registration',
    bundleCodeSha256: 'disk-code',
    bundleBytes: 1,
    loadedScriptUrl: '/all.js',
    loadedScriptSha256: 'complete-loaded-script',
    loadedScriptCodeSha256: 'complete-loaded-code',
    loadedRegistrationSha256: 'loaded-registration',
    loadedRegistrationCodeSha256: 'loaded-registration-code',
    match: 'normalized-registration',
    matchingRegistrationCount: 1,
  }
  const proof = { requestedOrigin: 'http://127.0.0.1:45120', target: 'dev', allocation: null, bundles: [bundle] }
  assertRuntimeProofStable(proof, structuredClone(proof))
  for (const field of ['bundleSha256', 'bundleRegistrationSha256', 'bundleCodeSha256', 'loadedScriptSha256', 'loadedScriptCodeSha256', 'loadedRegistrationSha256', 'loadedRegistrationCodeSha256', 'match', 'matchingRegistrationCount']) {
    assert.throws(() => assertRuntimeProofStable(proof, { ...proof, bundles: [{ ...bundle, [field]: 'changed' }] }), /changed/)
  }
})
