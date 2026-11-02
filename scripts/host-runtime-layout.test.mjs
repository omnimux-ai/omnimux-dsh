import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appAnchorFor,
  archiveResolvable,
  appPackageRootFor,
  asarEntry,
  composeAgentPresetRows,
  readAsarTree,
  resolvePresetRoot,
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
    // 真实语义：app.asar 是单个归档文件，判据读它的目录表（普通 Node 读不进归档）。
    writeAsarArchive(t, resources, {
      files: {
        lib: { files: { 'desktop-cli.js': { size: 4962 } } },
        preset: { files: { 'agent-presets': { files: { 'legacy-preset': { files: { 'agent.cordis.yml': { size: 3 } } } } } } },
        node_modules: { files: { '@deepseek-ai': { files: { dsh: { files: { 'package.json': { size: 60 }, lib: { files: { 'bin.js': { size: 10 } } } } } } } } },
      },
    })
    // 归档内容按 Electron 语义标成 unpacked 落在旁边（探测与预设根都依赖它）。
    const unpackedPreset = join(resources, 'app.asar.unpacked', 'preset', 'agent-presets', 'legacy-preset')
    mkdirSync(unpackedPreset, { recursive: true })
    writeFileSync(join(unpackedPreset, 'agent.cordis.yml'), '[]\n')
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

test('pruneUnresolvable 递归进 cordis:group 的 config 数组（与壳一致）', () => {
  const rows = [{
    id: 'delegation', name: 'cordis:group',
    config: [
      { name: '@deepseek-ai/dsh-missing' },
      { name: 'omnimux' },
      { id: 'nested', name: 'cordis:group', config: [{ name: '@other-harness/absent' }] },
    ],
  }]
  const { plugins, dropped } = pruneUnresolvable(rows, () => false)
  assert.deepEqual(dropped.sort(), ['@deepseek-ai/dsh-missing', '@other-harness/absent'])
  assert.deepEqual(plugins[0].config.map((row) => row.name), ['omnimux', 'cordis:group'])
  assert.deepEqual(plugins[0].config[1].config, [])
})

test('probeArchive 在注入 io 缺 existsSync 时显式报错，不悄悄读真实 fs', () => {
  assert.throws(() => resolveHostRuntimeLayout({ io: { statSync: () => ({ isFile: () => false }) } }),
    { name: 'TypeError', message: /io\.existsSync is required/ })
})

/**
 * 造一个**真实语义**的 asar 文件：[16 字节 pickle 头][JSON 目录表][内容]。
 * 普通 Node 对它 readdirSync/accessSync 都会 ENOTDIR，只能靠目录表读。
 */
function writeAsarArchive(t, directory, tree) {
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const header = Buffer.alloc(16);
  // 真实 Electron asar 的 pickle 几何（老包实测 headerSize-strLen=11、strSize-strLen=7）。
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(json.length + 11, 4);
  header.writeUInt32LE(json.length + 7, 8);
  header.writeUInt32LE(json.length, 12);
  const archive = join(directory, 'app.asar');
  writeFileSync(archive, Buffer.concat([header, json, Buffer.from('payload')]));
  return archive;
}

test('真实语义 asar：目录表里有 preset 即判为可用布局', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-real-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsarArchive(t, resources, {
    files: {
      lib: { files: { 'desktop-cli.js': { size: 4962 } } },
      preset: { files: { 'agent-presets': { files: { 'omni-agent': { files: { 'preset.yml': { size: 10 } } } } } } },
      node_modules: { files: { '@deepseek-ai': { files: { dsh: { files: { lib: { files: { 'bin.js': { size: 9303 } } } } } } } } },
    },
  })
  const unpackedPreset = join(resources, 'app.asar.unpacked', 'preset', 'agent-presets', 'omni-agent')
  mkdirSync(unpackedPreset, { recursive: true })
  writeFileSync(join(unpackedPreset, 'preset.yml'), 'name: demo\n')
  const layout = resolveHostRuntimeLayout({ bundle })
  assert.equal(layout.layout, 'app.asar')
  const tree = readAsarTree(layout.appRoot)
  assert.equal(Object.keys(asarEntry(tree, 'preset/agent-presets').files).length, 1)
  assert.ok(asarEntry(tree, 'node_modules/@deepseek-ai/dsh/lib/bin.js'))
  assert.equal(asarEntry(tree, 'preset/missing'), null)
})

test('真实语义 asar：目录表里没有 preset 时判为不可用并报 RUNTIME_MISSING', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-nopreset-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsarArchive(t, resources, { files: { lib: { files: { 'desktop-cli.js': { size: 10 } } } } })
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), { code: 'TEST_ENV_RUNTIME_MISSING' })
})

test('归档头部损坏时判为不可用并报可读错误', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-broken-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeFileSync(join(resources, 'app.asar'), 'not-an-asar')
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), { code: 'TEST_ENV_RUNTIME_MISSING' })
})

test('归档布局下预设根走 app.asar.unpacked（普通 Node 可读），不是归档内路径', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-unpacked-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  // 归档本身带 preset 目录表（判据用），内容标成 unpacked 落在归档旁边。
  writeAsarArchive(t, resources, {
    files: {
      lib: { files: { 'desktop-cli.js': { size: 4962 } } },
      preset: { files: { 'agent-presets': { files: { 'omni-agent': { files: { 'preset.yml': { size: 10 } } } } } } },
    },
  })
  const unpacked = join(resources, 'app.asar.unpacked', 'preset', 'agent-presets', 'omni-agent')
  mkdirSync(unpacked, { recursive: true })
  writeFileSync(join(unpacked, 'preset.yml'), 'name: demo\n')
  writeFileSync(join(unpacked, 'agent.cordis.yml'), JSON.stringify([{ name: 'omnimux' }]))

  const layout = resolveHostRuntimeLayout({ bundle })
  assert.equal(layout.layout, 'app.asar')
  assert.equal(resolvePresetRoot(layout.appRoot), join(resources, 'app.asar.unpacked', 'preset', 'agent-presets'))
  const composition = composeAgentPresetRows({ appRoot: layout.appRoot })
  assert.deepEqual(composition.rows.map((row) => row.config.id), ['omni-agent'])
  assert.equal(composition.rows[0].config.name, 'demo')
})

test('归档布局下没有 unpacked 内容时预设根为 null（调用方据此响亮失败）', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-nounpacked-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsarArchive(t, resources, {
    files: {
      lib: { files: { 'desktop-cli.js': { size: 4962 } } },
      preset: { files: { 'agent-presets': { files: { 'x': { files: { 'preset.yml': { size: 1 } } } } } } },
    },
  })
  // 没有 unpacked 时探测阶段就判不可用（口径与 resolvePresetRoot 一致）。
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), (error) => {
    assert.equal(error.detail.archiveProbe.reason, 'preset-content-not-unpacked')
    return true
  })
  assert.equal(resolvePresetRoot(join(resources, 'app.asar')), null)
})

test('归档里只有 preset 没有 desktop-cli 时判为不可用（reason 指明 wrapper 缺失）', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-asar-nowrapper-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsarArchive(t, resources, {
    files: { preset: { files: { 'agent-presets': { files: { x: { files: { 'preset.yml': { size: 1 } } } } } } } },
  })
  assert.throws(() => resolveHostRuntimeLayout({ bundle }), (error) => {
    assert.equal(error.code, 'TEST_ENV_RUNTIME_MISSING')
    assert.equal(error.detail.archiveProbe.reason, 'wrapper-missing-in-archive')
    return true;
  })
})

test('注入 io 缺 readAsarTree 时显式报错，不静默读真实 fs', () => {
  assert.throws(() => resolveHostRuntimeLayout({
    io: { statSync: () => ({ isFile: () => false }), existsSync: () => true },
    bundle: '/nonexistent/OmniMux Dev.app',
  }), { name: 'TypeError', message: /io\.readAsarTree is required/ })
})

test('archiveResolvable 支持 exports 子路径（按包目录判定，不误丢合法行）', (t) => {
  const { appRoot } = fakeBundle(t, 'app.asar')
  const tree = readAsarTree(appRoot)
  const resolvable = archiveResolvable(tree, () => false)
  // fakeBundle 的归档里有 @deepseek-ai/dsh
  assert.equal(resolvable('@deepseek-ai/dsh'), true)
  assert.equal(resolvable('@deepseek-ai/dsh/lib/bin.js'), true)
  assert.equal(resolvable('@deepseek-ai/dsh-tool-subagent-control/list-agents'), false)
  assert.equal(resolvable('omnimux'), false)
})

test('归档探测的五种失败原因逐条可断言', (t) => {
  const reasons = []
  const probe = (bundle) => {
    try { resolveHostRuntimeLayout({ bundle }) } catch (error) { reasons.push(error.detail.archiveProbe.reason) }
  }
  const mk = (prefix) => {
    const bundle = mkdtempSync(join(tmpdir(), prefix))
    t.after(() => rmSync(bundle, { recursive: true, force: true }))
    const resources = join(bundle, 'Contents', 'Resources')
    mkdirSync(resources, { recursive: true })
    return { bundle, resources }
  }
  probe(mk('omnimux-r1-').bundle)
  const broken = mk('omnimux-r2-')
  writeFileSync(join(broken.resources, 'app.asar'), 'not-an-asar')
  probe(broken.bundle)
  const noPreset = mk('omnimux-r3-')
  writeAsarArchive(t, noPreset.resources, { files: { lib: { files: { 'desktop-cli.js': { size: 1 } } } } })
  probe(noPreset.bundle)
  const noWrapper = mk('omnimux-r4-')
  writeAsarArchive(t, noWrapper.resources, {
    files: { preset: { files: { 'agent-presets': { files: { x: { files: { 'preset.yml': { size: 1 } } } } } } } },
  })
  probe(noWrapper.bundle)
  const noUnpacked = mk('omnimux-r5-')
  writeAsarArchive(t, noUnpacked.resources, {
    files: {
      lib: { files: { 'desktop-cli.js': { size: 1 } } },
      preset: { files: { 'agent-presets': { files: { x: { files: { 'preset.yml': { size: 1 } } } } } } },
    },
  })
  probe(noUnpacked.bundle)
  assert.deepEqual(reasons, [
    'archive-missing', 'asar-unreadable', 'preset-root-missing',
    'wrapper-missing-in-archive', 'preset-content-not-unpacked',
  ])
})

test('归档布局下 upstreamPresetIds 走 unpacked（改回归档内路径会红）', (t) => {
  const bundle = mkdtempSync(join(tmpdir(), 'omnimux-up-'))
  t.after(() => rmSync(bundle, { recursive: true, force: true }))
  const resources = join(bundle, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsarArchive(t, resources, {
    files: {
      lib: { files: { 'desktop-cli.js': { size: 1 } } },
      preset: { files: { 'agent-presets': { files: { x: { files: { 'preset.yml': { size: 1 } } } } } } },
    },
  })
  const unpackedPreset = join(resources, 'app.asar.unpacked', 'preset', 'agent-presets', 'x')
  mkdirSync(unpackedPreset, { recursive: true })
  writeFileSync(join(unpackedPreset, 'preset.yml'), 'name: x\n')
  writeFileSync(join(unpackedPreset, 'agent.cordis.yml'), JSON.stringify([{ name: 'omnimux' }]))
  const upstream = join(resources, 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets')
  mkdirSync(upstream, { recursive: true })
  writeFileSync(join(upstream, 'standard.patch.yml'), JSON.stringify([
    { insert: [{ name: '@deepseek-ai/dsh-agent-preset', config: { id: 'x' } }] },
  ]))
  const layout = resolveHostRuntimeLayout({ bundle })
  assert.deepEqual([...upstreamPresetIds(layout.appRoot)], ['x'])
  assert.deepEqual(composeAgentPresetRows({ appRoot: layout.appRoot }).skippedPresetIds, ['x'])
})
