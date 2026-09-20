/**
 * @file 工具门禁链单测 —— 总开关 → 环境 → 执行。临时 DSH_HOME，注入假 run。
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import { ERROR_CODES } from './core/errors.js'
import { resetDoctorCache } from './collect/doctor.js'
import { saveConfig } from './store.js'
import { HARVEST_TOOL_NAMES, checkGates, gatedHarvest, registerHarvestTools } from './tools.js'

const home = mkdtempSync(path.join(tmpdir(), 'sh-tools-test-'))
process.env.DSH_HOME = home

const okRun = async (argv) => {
  if (argv[0] === '--version') return { stdout: '1.8.8\n', stderr: '', code: 0 }
  if (argv[0] === 'doctor') return { stdout: '{"ok":true}', stderr: '', code: 0 }
  return { stdout: JSON.stringify([{ title: 'x' }]), stderr: '', code: 0 }
}

const noBinRun = async () => ({ stdout: '', stderr: 'spawn opencli ENOENT', code: 1 })

describe('checkGates 门禁链', () => {
  before(async () => { await saveConfig({ enabled: false }); resetDoctorCache() })
  after(async () => { await saveConfig({ enabled: false }) })

  it('总开关关闭 → HARVEST_DISABLED', async () => {
    const gate = await checkGates({ run: okRun, nowMs: 1 })
    assert.equal(gate.code, ERROR_CODES.DISABLED)
    assert.match(gate.hint, /设置/)
  })

  it('开启但未装 OpenCLI → HARVEST_NOT_INSTALLED', async () => {
    await saveConfig({ enabled: true })
    resetDoctorCache()
    const gate = await checkGates({ run: noBinRun, nowMs: 2 })
    assert.equal(gate.code, ERROR_CODES.NOT_INSTALLED)
    assert.match(gate.hint, /OpenCLI/)
  })

  it('开启且环境就绪 → 放行（null）', async () => {
    resetDoctorCache()
    const gate = await checkGates({ run: okRun, nowMs: 3 })
    assert.equal(gate, null)
  })

  it('gatedHarvest 端到端：开启 + 就绪 → 返回信封', async () => {
    resetDoctorCache()
    const r = await gatedHarvest('tiktok', 'search', { query: 'blender', limit: 10 }, { run: okRun })
    assert.equal(r.ok, true)
    assert.equal(r.items.length, 1)
  })

  it('gatedHarvest：开关关闭时直接抛 DISABLED，不执行命令', async () => {
    await saveConfig({ enabled: false })
    resetDoctorCache()
    let called = false
    await assert.rejects(
      gatedHarvest('tiktok', 'search', { query: 'q' }, { run: async () => { called = true; return { stdout: '[]', stderr: '', code: 0 } } }),
      (e) => e.code === ERROR_CODES.DISABLED,
    )
    assert.equal(called, false)
    await saveConfig({ enabled: true })
    resetDoctorCache()
  })
})

describe('registerHarvestTools', () => {
  it('注册恰好 8 个工具，命名与参数面正确', () => {
    const registered = []
    registerHarvestTools({ tools: { register: (t) => registered.push(t) } }, { run: okRun })
    assert.equal(registered.length, 8)
    assert.deepEqual(registered.map((t) => t.name), [...HARVEST_TOOL_NAMES])
    for (const t of registered) {
      assert.equal(typeof t.execute, 'function', t.name)
      assert.equal(t.parameters.additionalProperties, false, t.name)
      assert.ok(t.output?.schema, t.name)
    }
    const login = registered.find((t) => t.name === 'harvest_site_login')
    assert.ok(login.parameters.properties.site.enum.length > 0)
    assert.ok(!login.parameters.properties.site.enum.includes('pinterest'))
    assert.ok(login.parameters.properties.site.enum.includes('flow'))
  })

  it('flow_image_generate 执行端到端', async () => {
    await saveConfig({ enabled: true })
    resetDoctorCache()
    const r = await gatedHarvest('flow', 'image', { prompt: 'a sunset', ratio: '16:9' }, { run: okRun })
    assert.equal(r.ok, true)
    assert.equal(r.site, 'flow')
    assert.equal(r.command, 'image')
  })

  it('flow_video_generate 执行端到端', async () => {
    await saveConfig({ enabled: true })
    resetDoctorCache()
    const r = await gatedHarvest('flow', 'video', { prompt: 'a video of city', ratio: '9:16' }, { run: okRun })
    assert.equal(r.ok, true)
    assert.equal(r.site, 'flow')
    assert.equal(r.command, 'video')
  })
})
