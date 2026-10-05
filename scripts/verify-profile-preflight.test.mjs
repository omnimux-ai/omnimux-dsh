import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const PREFLIGHT = fileURLToPath(new URL('./verify-profile-preflight.mjs', import.meta.url))

/**
 * 门禁在 Electron 下运行（pnpm 的 node shim），而 Electron 会把含 `.asar` 的路径
 * 当作归档内部路径解析，连写出归档文件本身都会失败。写夹具归档必须走 `original-fs`。
 */
const archiveFs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : null

/**
 * 造一个最小 Profile：dependencies 里声明 `omnimux-*` 插件，
 * 并在 node_modules 下把它们物化成可加载的入口文件。
 *
 * @param {Array<{ name: string, source: string }>} plugins
 * @param {Record<string, string | { source: string, version?: string }>} [extraPackages]
 *   额外物理落地的包（包名 → 入口源码，或 `{ source, version }`）
 */
function makeProfile(plugins, extraPackages = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-preflight-'))
  const dependencies = Object.fromEntries([
    ...plugins.map((plugin) => [plugin.name, '*']),
    ...Object.keys(extraPackages).map((name) => [name, '*']),
  ])
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'profile-fixture', dependencies }))

  for (const plugin of plugins) writePackagedModule(root, plugin.name, plugin.source)
  for (const [name, spec] of Object.entries(extraPackages)) {
    if (typeof spec === 'string') writePackagedModule(root, name, spec)
    else writePackagedModule(root, name, spec.source, spec.version)
  }
  return root
}

function writePackagedModule(root, name, source, version = '0.0.0') {
  const dir = join(root, 'node_modules', name)
  mkdirSync(dirname(join(dir, 'index.js')), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }))
  writeFileSync(join(dir, 'index.js'), source)
}

/**
 * 造一个最小目标应用 Bundle：`Contents/Resources/build-info.json` 声明宿主代际，
 * 自带宿主包默认落在 `app.asar.unpacked/node_modules`（`asar: true` 时放进 app.asar）。
 *
 * @param {{ generation?: string, packages?: Record<string, { source: string, version?: string }>, asar?: boolean }} [options]
 */
function makeApp({ generation = '0.1.5-rc.1', packages = {}, asar = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-preflight-app-'))
  const resources = join(root, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeFileSync(join(resources, 'build-info.json'), JSON.stringify({ dsh: { packageSpec: generation } }))

  const files = {}
  for (const [name, spec] of Object.entries(packages)) {
    const version = spec.version ?? generation
    files[`node_modules/${name}/package.json`] = JSON.stringify({ name, version, main: 'index.js' })
    files[`node_modules/${name}/index.js`] = spec.source
  }
  if (asar) {
    ;(archiveFs ?? { writeFileSync }).writeFileSync(join(resources, 'app.asar'), buildAsar(files))
    return root
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = join(resources, 'app.asar.unpacked', relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

/** 最小 asar 归档写出器（Electron/Chromium pickle 头 + 顺序文件体）。 */
function buildAsar(files) {
  const header = { files: {} }
  const chunks = []
  let offset = 0
  for (const [relative, content] of Object.entries(files)) {
    const buffer = Buffer.from(content, 'utf8')
    const parts = relative.split('/')
    let node = header
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} }
      node = node.files[part]
    }
    node.files[parts.at(-1)] = { size: buffer.length, offset }
    chunks.push(buffer)
    offset += buffer.length
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const base = Math.ceil((16 + json.length) / 4) * 4
  const head = Buffer.alloc(base)
  head.writeUInt32LE(4, 0)
  head.writeUInt32LE(base - 8, 4)
  head.writeUInt32LE(json.length + 4, 8)
  head.writeUInt32LE(json.length, 12)
  json.copy(head, 16)
  return Buffer.concat([head, ...chunks])
}

function runPreflight(profileRoot, appRoot) {
  return spawnSync(process.execPath, [PREFLIGHT, profileRoot, '--app', appRoot], { encoding: 'utf8' })
}

/** 一个用宿主包 `defineTool` 注册单个工具的插件。 */
const HOST_TOOL_PLUGIN = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'demo-tool',
    description: 'demo',
    parameters: {},
    output: { schema: {}, render: () => 'ok' },
  }))
}
`

const DSH_TOOLS_FACE = `
export function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: { schema: options.output.schema, render: options.output.render },
  }
}
export default { defineTool }
`

/** 目标应用自带宿主包的最小面（对应 0.1.5-rc.1）。 */
const RC1_HOST_PACKAGES = {
  '@deepseek-ai/dsh-tools': { source: DSH_TOOLS_FACE },
  '@deepseek-ai/dsh-settings': {
    source: 'export function installSettingsSection(...args) { return () => {}; }\nexport function settingsNamespace(name) { return name; }\n',
  },
  '@deepseek-ai/dsh-attachment': {
    source: 'export class AttachmentError extends Error {}\nexport function AttachmentId(id) { return id; }\n',
  },
  '@deepseek-ai/dsh-fs': { source: 'export class FsError extends Error {}\n' },
  '@deepseek-ai/dsh-sandbox': { source: 'export function canonicalPath(path) { return path; }\n' },
}

test('preflight: 宿主包解析不到时用最小替身接上，演练放行并如实标注', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const profile = makeProfile([{ name: 'omnimux-host-user', source: HOST_TOOL_PLUGIN }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `应当通过，实际 stderr: ${run.stderr}`)
  assert.match(run.stdout, /✔ \[omnimux-host-user\] apply\(ctx\) 演练成功 \(注册 1 个合规工具\)/)
  assert.match(run.stdout, /1 次宿主包解析使用最小替身/, '摘要必须如实标注替身介入次数')
  assert.match(run.stdout, /导出面取自目标代际 0\.1\.5-rc\.1/, '摘要必须写明替身导出面来自目标代际')
})

test('preflight: 宿主包物理存在且代际一致时不得启用替身', () => {
  // 物理落地一个"真包"：它导出一个替身没有的 marker，且把工具名改写为 REAL-*。
  const hostTwin = `
export const marker = 'physical'
export function defineTool(options) {
  return {
    name: 'REAL-' + options.name,
    description: options.description,
    parameters: options.parameters,
    output: { schema: options.output.schema, render: options.output.render },
  }
}
export default { defineTool }
`
  const source = `
import { defineTool, marker } from '@deepseek-ai/dsh-tools'
if (marker !== 'physical') throw new Error('应当解析到物理包，而不是替身')
export function apply(ctx) {
  ctx.tools.register(defineTool({ name: 'demo', description: 'd', parameters: {}, output: { schema: {}, render: () => '' } }))
}
`
  const app = makeApp({ generation: '0.0.0-test', packages: { '@deepseek-ai/dsh-tools': { source: DSH_TOOLS_FACE } } })
  const profile = makeProfile(
    [{ name: 'omnimux-host-user', source }],
    { '@deepseek-ai/dsh-tools': { source: hostTwin, version: '0.0.0-test' } },
  )
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `物理包可用时必须通过，实际 stderr: ${run.stderr}`)
  assert.doesNotMatch(run.stdout, /最小替身/, '包能解析到时替身不应介入')
})

test('preflight: 真实解析到的宿主包与目标代际不一致时指名失败', () => {
  const app = makeApp({ generation: '0.1.5-rc.1', packages: RC1_HOST_PACKAGES })
  const profile = makeProfile(
    [{ name: 'omnimux-host-user', source: HOST_TOOL_PLUGIN }],
    {
      '@deepseek-ai/dsh-settings': {
        source: 'export function settingsNamespace(name) { return name; }\n',
        version: '0.1.5-rc.3',
      },
    },
  )
  const run = runPreflight(profile, app)

  assert.equal(run.status, 1, '代际不一致必须阻断物化')
  assert.match(run.stderr, /宿主包代际与目标应用不一致/)
  assert.match(run.stderr, /@deepseek-ai\/dsh-settings/)
  assert.match(run.stderr, /期望代际 0\.1\.5-rc\.1/)
  assert.match(run.stderr, /实际代际 0\.1\.5-rc\.3/)
  assert.match(run.stderr, new RegExp(profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '必须写明解析到哪个副本')
  assert.doesNotMatch(run.stdout, /apply\(ctx\) 演练成功/, '代际不一致时不得继续演练插件')
})

test('preflight: 目标应用代际无法确定时明确报错，不退回替身', () => {
  const profile = makeProfile([{ name: 'omnimux-host-user', source: HOST_TOOL_PLUGIN }])
  const run = spawnSync(process.execPath, [PREFLIGHT, profile], { encoding: 'utf8' })

  assert.equal(run.status, 1, '无法确定目标应用时必须阻断')
  assert.match(run.stderr, /无法确定被物化目标应用/)
  assert.match(run.stderr, /--app/)
  assert.doesNotMatch(run.stdout, /最小替身/)
})

test('preflight: 替身不再制造目标代际没有的导出', () => {
  // 目标应用代际 0.1.5-rc.3：其 dsh-settings 已移除 installSettingsSection。
  const app = makeApp({
    generation: '0.1.5-rc.3',
    packages: {
      '@deepseek-ai/dsh-settings': {
        source: 'export function settingsNamespace(name) { return name; }\nexport class SettingsProvider {}\n',
      },
    },
  })
  const source = `
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
export function apply() { installSettingsSection(settingsNamespace('demo'), {}, () => {}) }
`
  const profile = makeProfile([{ name: 'omnimux-rc3-user', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 1, '目标代际没有的导出必须让预检失败，而不是被替身补上')
  assert.match(run.stderr, /installSettingsSection/)
  assert.match(run.stderr, /does not provide an export named/)
  assert.doesNotMatch(run.stdout, /最小替身/, '替身未介入时不应出现替身注记')
})

test('preflight: 替身的导出面逐条取自目标应用（目标代际有则可用）', () => {
  const app = makeApp({ generation: '0.1.5-rc.1', packages: RC1_HOST_PACKAGES })
  const source = `
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
export function apply() {
  const dispose = installSettingsSection(settingsNamespace('demo'), {}, () => {})
  if (typeof dispose !== 'function') throw new Error('installSettingsSection 替身签名不可用')
}
`
  const profile = makeProfile([{ name: 'omnimux-rc1-user', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `目标代际具备该导出时必须通过，实际 stderr: ${run.stderr}`)
  assert.match(run.stdout, /导出面取自目标代际 0\.1\.5-rc\.1/)
})

test('preflight: 目标应用不提供该宿主包时不制造替身', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const source = `
import { anything } from '@deepseek-ai/dsh-not-shipped'
export function apply() { return anything }
`
  const profile = makeProfile([{ name: 'omnimux-unknown-host', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 1, '目标应用不提供的宿主包不得被替身补上')
  assert.match(run.stderr, /@deepseek-ai\/dsh-not-shipped/)
  assert.match(run.stderr, /不会为该模块制造替身/)
})

test('preflight: 宿主包位于 app.asar 归档内时同样按目标代际取导出面', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES, asar: true })
  const source = `
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
export function apply() { installSettingsSection(settingsNamespace('demo'), {}, () => {}) }
`
  const profile = makeProfile([{ name: 'omnimux-asar-user', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `asar 内的宿主包必须能被读取，实际 stderr: ${run.stderr}`)
  assert.match(run.stdout, /导出面取自目标代际 0\.1\.5-rc\.1/)
})

test('preflight: 非宿主包缺失仍然阻断（不得一刀切掩盖）', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const source = `
import { anything } from 'omnimux-package-that-does-not-exist'
export function apply() {}
`
  const profile = makeProfile([{ name: 'omnimux-broken', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 1, '非宿主包缺失必须继续阻断物化')
  assert.match(run.stderr, /✖ \[omnimux-broken\] 启动预检演练失败/)
  assert.match(run.stderr, /物化演练预检失败/)
})

test('preflight: 替身不绕过 tools.register 契约门禁', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const source = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export function apply(ctx) {
  ctx.tools.register(defineTool({ description: '缺少 name', output: { schema: {}, render: () => '' } }))
}
`
  const profile = makeProfile([{ name: 'omnimux-bad-tool', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 1, '工具缺少 name 时必须被契约门禁拦下')
  assert.match(run.stderr, /must declare a non-empty name/)
})

test('preflight: 替身保留插件自带 render，不改写既有契约', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const source = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export function apply(ctx) {
  const tool = defineTool({ name: 'rendered', description: 'd', parameters: {}, output: { schema: {}, render: () => 'x' } })
  if (typeof tool.output.render !== 'function' || tool.output.render() !== 'x') throw new Error('render 未保留')
  ctx.tools.register(tool)
}
`
  const profile = makeProfile([{ name: 'omnimux-render', source }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `render 必须被保留，实际 stderr: ${run.stderr}`)
})

/** 导入替身必须声明的宿主机面导出：静态 ESM 缺任何一条都会在解析期直接失败。 */
const HOST_NAMED_EXPORTS_PLUGIN = `
import { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import { FsError } from '@deepseek-ai/dsh-fs'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
export function apply() {
  const attachmentError = new AttachmentError('demo')
  const fsError = new FsError('demo')
  const path = canonicalPath('/tmp/demo')
  const id = AttachmentId('demo-attachment')
  installSettingsSection(settingsNamespace('demo'), {}, () => {})
  if (!attachmentError || !fsError || !path || !id) throw new Error('stub face unusable')
}
`

test('preflight: 替身声明插件实际使用的宿主机面导出，解析期不再缺名', () => {
  const app = makeApp({ packages: RC1_HOST_PACKAGES })
  const profile = makeProfile([{ name: 'omnimux-host-face-user', source: HOST_NAMED_EXPORTS_PLUGIN }])
  const run = runPreflight(profile, app)

  assert.equal(run.status, 0, `应当通过，实际 stderr: ${run.stderr}`)
  assert.match(run.stdout, /✔ \[omnimux-host-face-user\] apply\(ctx\) 演练成功/)
})
