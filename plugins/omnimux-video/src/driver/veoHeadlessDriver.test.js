import test from 'node:test'
import assert from 'node:assert/strict'
import { validateVeoTaskRequest, GOOGLE_VIDS_PROTO_TEMPLATES } from '../contracts/veoContracts.js'
import {
  compareSemver,
  detectOpenCliEnvironment,
  resolveOpenCliEnvironment,
} from './veoHeadlessDriver.js'

test('veoContracts 与 veoHeadlessDriver 测试套件', async (t) => {
  await t.test('validateVeoTaskRequest 参数校验规则', () => {
    assert.equal(validateVeoTaskRequest(null).valid, false)
    assert.equal(validateVeoTaskRequest({}).valid, false)
    assert.equal(validateVeoTaskRequest({ prompt: '   ' }).valid, false)
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', mode: 'invalid_mode' }).valid, false)
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 15 } }).valid, false)
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 10 } }).valid, true)
  })

  await t.test('GOOGLE_VIDS_PROTO_TEMPLATES 374 与 376 模板生成契约', () => {
    const t374 = GOOGLE_VIDS_PROTO_TEMPLATES.TEXT_TO_VIDEO('doc_test_1', 'a cat running', 10)
    assert.equal(t374[0], 374, '纯文生视频代码必须为 374')
    assert.equal(t374[3][3][0][0][2], 'a cat running')
    assert.equal(t374[4][15][8], 10, '时长必须为 10 秒')

    const t376 = GOOGLE_VIDS_PROTO_TEMPLATES.IMAGE_TO_VIDEO('doc_test_2', 'skincare model', 'AVL_token_123', 'UUID_abc', 8)
    assert.equal(t376[0], 376, '参考图生视频代码必须为 376')
    assert.equal(t376[2][25][0][0][7][1][11][8][3], 'AVL_token_123')
    assert.equal(t376[4][15][8], 8, '时长必须为 8 秒')
  })

  await t.test('compareSemver 正确比较版本', () => {
    assert.ok(compareSemver('1.8.8', '0.9.6') > 0)
    assert.ok(compareSemver('1.8.8', '1.8.6') > 0)
    assert.equal(compareSemver('1.8.8', '1.8.8'), 0)
  })

  await t.test('resolveOpenCliEnvironment 优先 bridgeConnected 且版本更高', () => {
    const env = resolveOpenCliEnvironment({
      list: () => ['/old/opencli', '/new/opencli', '/bridged/opencli'],
      probe: (bin) => {
        if (bin === '/old/opencli') {
          return { bin, installed: true, version: '0.9.6', bridgeConnected: false }
        }
        if (bin === '/new/opencli') {
          return { bin, installed: true, version: '1.8.8', bridgeConnected: false }
        }
        return { bin, installed: true, version: '1.8.6', bridgeConnected: true }
      },
    })
    assert.equal(env.installed, true)
    assert.equal(env.bridgeConnected, true)
    assert.equal(env.bin, '/bridged/opencli')
    assert.equal(env.version, '1.8.6')
  })

  await t.test('resolveOpenCliEnvironment 无桥接时选最高版本', () => {
    const env = resolveOpenCliEnvironment({
      list: () => ['/old/opencli', '/new/opencli'],
      probe: (bin) => ({
        bin,
        installed: true,
        version: bin.includes('new') ? '1.8.8' : '0.9.6',
        bridgeConnected: false,
      }),
    })
    assert.equal(env.bin, '/new/opencli')
    assert.equal(env.version, '1.8.8')
    assert.equal(env.bridgeConnected, false)
  })

  await t.test('detectOpenCliEnvironment 环境就绪探测', { skip: !detectOpenCliEnvironment().installed }, () => {
    const env = detectOpenCliEnvironment()
    assert.equal(typeof env.installed, 'boolean')
    assert.equal(typeof env.bridgeConnected, 'boolean')
    // 在当前开发机上必须探测到已安装（绝对路径 + 版本优选）
    assert.equal(env.installed, true)
    assert.equal(typeof env.bin, 'string')
    assert.ok(env.bin.includes('opencli'))
    assert.ok(compareSemver(env.version || '0', '1.0.0') >= 0)
  })
})
