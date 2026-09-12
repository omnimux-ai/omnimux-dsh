import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PREFLIGHT = fileURLToPath(new URL('./verify-profile-preflight.mjs', import.meta.url))

/**
 * 造一个最小 Profile：dependencies 里声明 `omnimux-*` 插件，
 * 并在 node_modules 下把它们物化成可加载的入口文件。
 *
 * @param {Array<{ name: string, source: string }>} plugins
 * @param {Record<string, string>} [extraPackages] 额外物理落地的包（包名 → 入口源码）
 */
function makeProfile(plugins, extraPackages = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-preflight-'))
  const dependencies = Object.fromEntries([
    ...plugins.map((plugin) => [plugin.name, '*']),
    ...Object.keys(extraPackages).map((name) => [name, '*']),
  ])
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'profile-fixture', dependencies }))

  for (const plugin of plugins) writePackagedModule(root, plugin.name, plugin.source)
  for (const [name, source] of Object.entries(extraPackages)) writePackagedModule(root, name, source)
  return root
}

function writePackagedModule(root, name, source) {
  const dir = join(root, 'node_modules', name)
  mkdirSync(dirname(join(dir, 'index.js')), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }))
  writeFileSync(join(dir, 'index.js'), source)
}

function runPreflight(profileRoot) {
  return spawnSync(process.execPath, [PREFLIGHT, profileRoot], { encoding: 'utf8' })
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

test('preflight: 宿主包解析不到时用最小替身接上，演练放行并如实标注', () => {
  const profile = makeProfile([{ name: 'omnimux-host-user', source: HOST_TOOL_PLUGIN }])
  const run = runPreflight(profile)

  assert.equal(run.status, 0, `应当通过，实际 stderr: ${run.stderr}`)
  assert.match(run.stdout, /✔ \[omnimux-host-user\] apply\(ctx\) 演练成功 \(注册 1 个合规工具\)/)
  assert.match(run.stdout, /1 次宿主包解析使用最小替身/, '摘要必须如实标注替身介入次数')
})

test('preflight: 宿主包物理存在时不得启用替身', () => {
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
  const profile = makeProfile([{ name: 'omnimux-host-user', source }], { '@deepseek-ai/dsh-tools': hostTwin })
  const run = runPreflight(profile)

  assert.equal(run.status, 0, `物理包可用时必须通过，实际 stderr: ${run.stderr}`)
  assert.doesNotMatch(run.stdout, /最小替身/, '包能解析到时替身不应介入')
})

test('preflight: 非宿主包缺失仍然阻断（不得一刀切掩盖）', () => {
  const source = `
import { anything } from 'omnimux-package-that-does-not-exist'
export function apply() {}
`
  const profile = makeProfile([{ name: 'omnimux-broken', source }])
  const run = runPreflight(profile)

  assert.equal(run.status, 1, '非宿主包缺失必须继续阻断物化')
  assert.match(run.stderr, /✖ \[omnimux-broken\] 启动预检演练失败/)
  assert.match(run.stderr, /物化演练预检失败/)
})

test('preflight: 替身不绕过 tools.register 契约门禁', () => {
  const source = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export function apply(ctx) {
  ctx.tools.register(defineTool({ description: '缺少 name', output: { schema: {}, render: () => '' } }))
}
`
  const profile = makeProfile([{ name: 'omnimux-bad-tool', source }])
  const run = runPreflight(profile)

  assert.equal(run.status, 1, '工具缺少 name 时必须被契约门禁拦下')
  assert.match(run.stderr, /must declare a non-empty name/)
})

test('preflight: 替身保留插件自带 render，不改写既有契约', () => {
  const source = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export function apply(ctx) {
  const tool = defineTool({ name: 'rendered', description: 'd', parameters: {}, output: { schema: {}, render: () => 'x' } })
  if (typeof tool.output.render !== 'function' || tool.output.render() !== 'x') throw new Error('render 未保留')
  ctx.tools.register(tool)
}
`
  const profile = makeProfile([{ name: 'omnimux-render', source }])
  const run = runPreflight(profile)

  assert.equal(run.status, 0, `render 必须被保留，实际 stderr: ${run.stderr}`)
})
