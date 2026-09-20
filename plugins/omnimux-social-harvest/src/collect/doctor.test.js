/**
 * @file 环境检测单测 —— 注入假 run，验证缓存与失败形态。
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { detectEnvironment, resetDoctorCache } from './doctor.js'

describe('detectEnvironment', () => {
  beforeEach(() => resetDoctorCache())

  it('未安装（--version 非 0）→ installed: false，不跑 doctor', async () => {
    let doctorCalled = false
    const r = await detectEnvironment({ nowMs: 1 }, {
      run: async (argv) => {
        if (argv[0] === 'doctor') doctorCalled = true
        return { stdout: '', stderr: 'spawn opencli ENOENT', code: 1 }
      },
    })
    assert.equal(r.installed, false)
    assert.equal(doctorCalled, false)
  })

  it('已安装 + doctor 通过 → bridgeOk: true，且 doctor 参数不带 -f', async () => {
    let doctorArgv = null
    const r = await detectEnvironment({ nowMs: 1 }, {
      run: async (argv) => {
        if (argv[0] === '--version') return { stdout: '1.8.8\n', stderr: '', code: 0 }
        doctorArgv = argv
        return { stdout: 'Everything looks good!\n', stderr: '', code: 0 }
      },
    })
    assert.equal(r.installed, true)
    assert.equal(r.version, '1.8.8')
    assert.equal(r.bridgeOk, true)
    assert.deepEqual(doctorArgv, ['doctor'])
  })

  it('doctor 失败 → bridgeOk: false 且带诊断', async () => {
    const r = await detectEnvironment({ nowMs: 1 }, {
      run: async (argv) => argv[0] === '--version'
        ? { stdout: '1.8.8', stderr: '', code: 0 }
        : { stdout: '', stderr: 'extension not connected', code: 69 },
    })
    assert.equal(r.installed, true)
    assert.equal(r.bridgeOk, false)
    assert.match(r.bridgeDetail, /extension/)
  })

  it('60s 内命中缓存不再执行', async () => {
    let calls = 0
    const run = async () => { calls++; return { stdout: '1.8.8', stderr: '', code: 0 } }
    await detectEnvironment({ nowMs: 1000 }, { run })
    await detectEnvironment({ nowMs: 2000 }, { run })
    assert.equal(calls, 2) // version + doctor 各一次
    await detectEnvironment({ nowMs: 61_001 }, { run })
    assert.equal(calls, 4)
  })
})
