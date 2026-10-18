import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatErrorMessage } from './http-routes.js'

test('configuration failures retain distinct hub causes instead of guessing a missing API key', () => {
  for (const message of ['请确认此用途的模型服务', '自备服务尚未填写接口地址', '读取执行凭据失败，请重试']) {
    assert.equal(formatErrorMessage(Object.assign(new Error(message), { code: 'omnimux-unconfigured' })), message)
  }
  assert.equal(formatErrorMessage({ code: 'omnimux-unconfigured' }), '分析服务尚未配置，请检查所选服务')
  for (const code of ['official-credential-unavailable', 'official-credential-rejected', 'official-permission-denied']) {
    assert.equal(formatErrorMessage({ code, message: '执行服务返回的具体原因' }), '执行服务返回的具体原因')
  }
  assert.match(formatErrorMessage({ code: 'needs-omnimux', message: 'unsigned' }), /登录 OmniMux 账号/)
})
