import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appAnchorFor,
  appPackageRootFor,
  composeAgentPresetRows,
  defaultHostLayout,
  pruneRejectedFields,
  pruneUnresolvable,
  resolveHostRuntimeLayout,
  upstreamPresetIds,
} from './host-runtime-layout.mjs'

/** 造一个 App bundle 目录：layout = 'app' | 'app.asar'。 */
function fakeBundle(t, layout) {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-layout-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const appRoot = join(bundle, 'Contents', 'Resources', layout)
  mkdirSync(join(appRoot, 'lib'), { recursive: true })
  writeFileSync(join(appRoot, 'lib', 'desktop-cli.js'), '// wrapper\n')
  mkdirSync(join(appRoot, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  writeFileSync(join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), '{"name":"@deepseek-ai/dsh"}\n')
  return { bundle, appRoot }
}

/** 写一个预设目录（preset.yml + agent.cordis.yml）。 */
function writePreset(appRoot, id, { manifest = {}, plugins }) {
  const directory = join(appRoot, 'preset', 'agent-presets', id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'preset.yml'), Object.entries(manifest).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n')
  writeFileSync(join(directory, 'agent.cordis.yml'), JSON.stringify(plugins) + '\n')
}

test('布局探测优先 asar:false 的 Resources/app，并回退旧 app.asar', (t) => {
  const modern = fakeBundle(t, 'app')
  const resolved = resolveHostRuntimeLayout({ bundle: modern.bundle })
  assert.equal(resolved.layout, 'app')
  assert.equal(resolved.wrapper, join(modern.appRoot, 'lib/desktop-cli.js'))
  assert.equal(resolved.appRoot, modern.appRoot)
  assert.equal(resolved.executable, join(modern.bundle, 'Contents/MacOS/OmniMux'))

  const legacy = fakeBundle(t, 'app.asar')
  const fallback = resolveHostRuntimeLayout({ bundle: legacy.bundle })
  assert.equal(fallback.layout, 'app.asar')
  assert.equal(fallback.wrapper, join(legacy.appRoot, 'lib/desktop-cli.js'))
})

test('两种入口都缺失时报 RUNTIME_MISSING 并列出候选路径', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-layout-empty-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  mkdirSync(join(bundle, 'Contents', 'Resources'), { recursive: true })
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), (error) => {
    assert.equal(error.code, 'TEST_ENV_RUNTIME_MISSING')
    assert.equal(error.detail.candidates.length, 2)
    assert.match(error.hint, /desktop-cli\.js/)
    return true
  })
})

test('appAnchor 跟着实际布局走，不再写死 app.asar', (t) => {
  const modern = fakeBundle(t, 'app')
  const legacy = fakeBundle(t, 'app.asar')
  assert.equal(appAnchorFor(join(modern.appRoot, 'lib/desktop-cli.js')),
    join(modern.appRoot, 'node_modules/@deepseek-ai/dsh/package.json'))
  assert.equal(appAnchorFor(join(legacy.appRoot, 'lib/desktop-cli.js')),
    join(legacy.appRoot, 'node_modules/@deepseek-ai/dsh/package.json'))
  assert.equal(appPackageRootFor(join(modern.appRoot, 'lib/desktop-cli.js')),
    join(modern.appRoot, 'node_modules/@deepseek-ai/dsh'))
})

test('preset 合成跳过上游已声明 id，并保留 manifest 名称', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  writePreset(appRoot, 'standard', { manifest: { name: '上游' }, plugins: [{ name: 'x' }] })
  writePreset(appRoot, 'omni-agent', { manifest: { name: '全域社媒操盘手' }, plugins: [{ name: 'a' }, { name: 'b' }] })
  const upstream = join(appRoot, 'node_modules/@deepseek-ai/dsh-web-app/presets')
  mkdirSync(upstream, { recursive: true })
  writeFileSync(join(upstream, 'standard.patch.yml'), JSON.stringify([
    { insert: [{ id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } }] },
  ]))
  const composition = composeAgentPresetRows({ appRoot })
  assert.deepEqual(composition.skippedPresetIds, ['standard'])
  assert.deepEqual(composition.rows.map((row) => row.config.id), ['omni-agent'])
  const [row] = composition.rows
  assert.equal(row.id, 'omnimux-preset-omni-agent')
  assert.equal(row.name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(row.config.name, '全域社媒操盘手')
  assert.equal(row.config.plugins.length, 2)
})

test('preset 合成丢弃宿主解析不到的包行，但放过 Loader 内建别名', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  writePreset(appRoot, 'demo', {
    manifest: { name: 'demo' },
    plugins: [{ name: 'cordis:group' }, { name: 'omnimux' }, { name: 'not-installed-anywhere' }],
  })
  const composition = composeAgentPresetRows({ appRoot, resolvable: (name) => name === 'omnimux' })
  assert.deepEqual(composition.droppedPackages, ['not-installed-anywhere'])
  assert.deepEqual(composition.rows[0].config.plugins.map((row) => row.name), ['cordis:group', 'omnimux'])
})

test('rc.3 拒绝的 subagent 字段被裁掉，其它行不受影响', () => {
  const plugins = [
    { name: '@deepseek-ai/dsh-tool-subagent', config: { persona: 'x', toolFilter: ['y'], keep: 1 } },
    { name: 'omnimux', config: { persona: 'keep-me' } },
  ]
  const { plugins: pruned, reduced } = pruneRejectedFields(plugins)
  assert.equal(reduced, true)
  assert.deepEqual(pruned[0].config, { keep: 1 })
  assert.deepEqual(pruned[1].config, { persona: 'keep-me' })
  assert.deepEqual(plugins[0].config.persona, 'x', '不得改动传入对象')
})

test('没有预设目录的旧 App 返回空合成结果', (t) => {
  const { appRoot } = fakeBundle(t, 'app.asar')
  const composition = composeAgentPresetRows({ appRoot })
  assert.deepEqual(composition, { rows: [], skippedPresetIds: [], droppedPackages: [], reducedPresetIds: [] })
})

test('upstreamPresetIds 只认 name 为 dsh-agent-preset 的行', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  const upstream = join(appRoot, 'node_modules/@deepseek-ai/dsh-web-app/presets')
  mkdirSync(upstream, { recursive: true })
  writeFileSync(join(upstream, 'a.patch.yml'), JSON.stringify([
    { insert: [{ name: '@deepseek-ai/dsh-agent-preset', config: { id: 'alpha' } }, { name: 'other', config: { id: 'beta' } }] },
  ]))
  assert.deepEqual([...upstreamPresetIds(appRoot)], ['alpha'])
})

test('pruneUnresolvable 不把无 name 的行当作需要解析的包', () => {
  const { plugins, dropped } = pruneUnresolvable([{ id: 'row-1' }, { name: '' }], () => false)
  assert.deepEqual(dropped, [])
  assert.equal(plugins.length, 2)
})

test('注入的 fs 缺 statSync 时退回默认布局，不因本机没装 App 报错', () => {
  const stub = { accessSync() {}, existsSync: () => false, readdirSync: () => [] }
  const resolved = resolveHostRuntimeLayout({ io: stub })
  assert.equal(resolved.layout, 'app')
  assert.match(resolved.wrapper, /Resources\/app\/lib\/desktop-cli\.js$/)
})

test('defaultHostLayout 不探测文件系统（CI 上没有 App 也能给出默认布局）', () => {
  const layout = defaultHostLayout({ bundle: '/nonexistent/OmniMux Dev.app' })
  assert.equal(layout.layout, 'app')
  assert.equal(layout.executable, '/nonexistent/OmniMux Dev.app/Contents/MacOS/OmniMux')
  assert.deepEqual(layout.candidates.length, 2)
})
