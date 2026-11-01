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
  hasShippedPresetRoot,
  readStructuredFile,
  stringifyStructuredFile,
  pruneRejectedFields,
  pruneUnresolvable,
  resolveHostRuntimeLayout,
  upstreamPresetIds,
} from './host-runtime-layout.mjs'

/** 把序列化结果写回临时目录并返回路径（round-trip 用）。 */
function writeAndReturn(directory, text) {
  const file = join(directory, 'round-trip.yml')
  writeFileSync(file, text)
  return file
}

/** 造一个 App bundle 目录：layout = 'app' | 'app.asar'。 */
function fakeBundle(t, layout) {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-layout-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  const appRoot = join(resources, layout)
  if (layout === 'app.asar') {
    // 归档布局的判据是「能列出 preset/agent-presets」：这里用目录模拟一个可读归档
    // （真实 Electron 下 asar 也表现为可读目录）。不可读归档由单独用例覆盖。
    mkdirSync(join(appRoot, 'preset', 'agent-presets', 'legacy-preset'), { recursive: true })
    writeFileSync(join(appRoot, 'preset', 'agent-presets', 'legacy-preset', 'agent.cordis.yml'), '[]\n')
  } else {
    mkdirSync(join(appRoot, 'lib'), { recursive: true })
    writeFileSync(join(appRoot, 'lib', 'desktop-cli.js'), '// wrapper\n')
    mkdirSync(join(appRoot, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
    writeFileSync(join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), '{"name":"@deepseek-ai/dsh"}\n')
  }
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

  // 旧布局：app.asar 是归档文件，按「归档存在」判定，wrapper 仍是归档内路径。
  const legacy = fakeBundle(t, 'app.asar')
  const fallback = resolveHostRuntimeLayout({ bundle: legacy.bundle })
  assert.equal(fallback.layout, 'app.asar')
  assert.equal(fallback.wrapper, join(legacy.appRoot, 'lib/desktop-cli.js'))
  assert.equal(fallback.appRoot, legacy.appRoot)
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
    plugins: [{ name: 'cordis:group' }, { name: '@deepseek-ai/dsh-present' }, { name: '@deepseek-ai/dsh-missing' }, { name: 'local-alias' }],
  })
  const composition = composeAgentPresetRows({ appRoot, resolvable: (name) => name === '@deepseek-ai/dsh-present' })
  assert.deepEqual(composition.droppedPackages, ['@deepseek-ai/dsh-missing'])
  assert.deepEqual(composition.rows[0].config.plugins.map((row) => row.name),
    ['cordis:group', '@deepseek-ai/dsh-present', 'local-alias'])
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

test('没有预设目录时返回空合成结果（调用方据此响亮失败）', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  const composition = composeAgentPresetRows({ appRoot })
  assert.deepEqual(composition, {
    rows: [], skippedPresetIds: [], droppedPackages: [], reducedPresetIds: [],
    unreadablePresetIds: [], unreadablePresetReasons: [],
  })
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

test('注入的 fs 缺 statSync 时显式报错，不再静默当成布局存在', () => {
  const stub = { accessSync() {}, existsSync: () => false, readdirSync: () => [] }
  assert.throws(() => resolveHostRuntimeLayout({ io: stub }), { name: 'TypeError', message: /io\.statSync is required/ })
})

test('defaultHostLayout 不探测文件系统（CI 上没有 App 也能给出默认布局）', () => {
  const layout = defaultHostLayout({ bundle: '/nonexistent/OmniMux Dev.app' })
  assert.equal(layout.layout, 'app')
  assert.equal(layout.executable, '/nonexistent/OmniMux Dev.app/Contents/MacOS/OmniMux')
  assert.deepEqual(layout.candidates.length, 2)
})

test('!!js 表达式 round-trip 后仍是表达式，不会写成 undefined', (t) => {
  const source = [
    '- id: tool-x',
    '  name: "@deepseek-ai/dsh-tool-x"',
    '  config:',
    '    disabled: !!js process.platform === "win32"',
    '',
  ].join('\n')
  const directory = mkdtempSync(join(tmpdir(), 'omnimux-js-tag-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'rows.yml')
  writeFileSync(file, source)
  const rows = readStructuredFile(file)
  assert.equal(rows[0].config.disabled.__jsExpr, 'process.platform === "win32"')
  const written = stringifyStructuredFile(rows)
  assert.match(written, /!!js "process\.platform === \\"win32\\""/)
  assert.doesNotMatch(written, /!!js undefined/)
  const roundTrip = readStructuredFile(writeAndReturn(directory, written))
  assert.equal(roundTrip[0].config.disabled.__jsExpr, 'process.platform === "win32"')
})

test('嵌套在 cordis:group 的 config 数组里的 persona/toolFilter 也被裁掉', () => {
  const plugins = [{
    id: 'delegation', name: 'cordis:group', group: true,
    config: [
      { id: 'sub', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', persona: 'x', toolFilter: ['y'] } },
      { id: 'keep', name: 'omnimux' },
    ],
  }]
  const { plugins: pruned, reduced } = pruneRejectedFields(plugins)
  assert.equal(reduced, true)
  assert.deepEqual(pruned[0].config[0].config, { provider: 'spawn' })
  assert.deepEqual(pruned[0].config[1], { id: 'keep', name: 'omnimux' })
  assert.equal(plugins[0].config[0].config.persona, 'x', '不得改动传入对象')
})

test('没有嵌套拒绝字段时 reduced 为 false，且返回同一引用', () => {
  const plugins = [{ id: 'a', name: 'omnimux', config: { keep: 1 } }]
  const { plugins: pruned, reduced } = pruneRejectedFields(plugins)
  assert.equal(reduced, false)
  assert.equal(pruned, plugins)
})

test('新布局缺 preset 目录时 hasShippedPresetRoot 为 false（调用方据此响亮失败）', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  assert.equal(hasShippedPresetRoot(appRoot), false)
  writePreset(appRoot, 'demo', { manifest: { name: 'demo' }, plugins: [{ name: 'x' }] })
  assert.equal(hasShippedPresetRoot(appRoot), true)
})

test('不可读的 app.asar 归档被判为不可用，响亮报 RUNTIME_MISSING', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-broken-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  // 真实语义：归档是文件，普通 Node 读不到里面的 preset。
  writeFileSync(join(resources, 'app.asar'), 'asar-archive-bytes')
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), { code: 'TEST_ENV_RUNTIME_MISSING' })
})

test('!!js 表达式含 # / 冒号 / 行首特殊符号时也能安全 round-trip', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'omnimux-js-escape-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const expressions = [
    "process.platform === 'win32'",
    "a === 'x # not a comment'",
    "b === 'k: v'",
    "-leading-dash",
    "!bang",
    "&anchor",
    "multi\nline",
  ]
  const rows = expressions.map((expression, index) => ({ id: `row-${index}`, name: '@deepseek-ai/dsh-tool-x', config: { disabled: { __jsExpr: expression } } }))
  const written = stringifyStructuredFile(rows)
  assert.doesNotMatch(written, /!!js undefined/)
  const file = join(directory, 'escape.yml')
  writeFileSync(file, written)
  const parsed = readStructuredFile(file)
  assert.deepEqual(parsed.map((row) => row.config.disabled.__jsExpr), expressions)
})

test('pruneUnresolvable 只对 @ 作用域包名做解析判定（与壳一致）', () => {
  const rows = [{ name: 'omnimux-local-alias' }, { name: '@deepseek-ai/dsh-nope' }, { name: 'cordis:group' }]
  const { plugins, dropped } = pruneUnresolvable(rows, () => false)
  assert.deepEqual(dropped, ['@deepseek-ai/dsh-nope'])
  assert.deepEqual(plugins.map((row) => row.name), ['omnimux-local-alias', 'cordis:group'])
})

test('单个 preset 解析失败进入诊断字段，不静默消失', (t) => {
  const { appRoot } = fakeBundle(t, 'app')
  writePreset(appRoot, 'good', { manifest: { name: 'good' }, plugins: [{ name: 'x' }] })
  const broken = join(appRoot, 'preset', 'agent-presets', 'broken')
  mkdirSync(broken, { recursive: true })
  writeFileSync(join(broken, 'preset.yml'), 'name: broken\n')
  writeFileSync(join(broken, 'agent.cordis.yml'), 'key: [unclosed\n')
  const composition = composeAgentPresetRows({ appRoot })
  assert.deepEqual(composition.rows.map((row) => row.config.id), ['good'])
  assert.deepEqual(composition.unreadablePresetIds, ['broken'])
  assert.match(composition.unreadablePresetReasons[0], /broken/)
})
