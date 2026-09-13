import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, humanApprovalReason, needsHumanApproval, sessionApprovalPolicy } from './index.js'

test('Full access 的 never 策略不强制 ask，避免静默拒绝', () => {
  const signal = new AbortController().signal
  assert.equal(needsHumanApproval({ name: 'automation_create', signal }, true, 'never'), false)
  assert.equal(needsHumanApproval({ name: 'automation_delete', signal }, true, 'never'), false)
  assert.equal(needsHumanApproval({ name: 'automation_run_now', signal }, true), false)
})

test('Read Only / Workspace Write 的 ask 策略会走官方授权', () => {
  const signal = new AbortController().signal
  assert.equal(needsHumanApproval({ name: 'automation_create', signal }, true, 'ask'), true)
  assert.equal(needsHumanApproval({ name: 'automation_delete', signal }, true, 'ask'), true)
  assert.equal(needsHumanApproval({ name: 'automation_run_now', signal }, true, 'ask'), true)
  assert.equal(needsHumanApproval({
    name: 'automation_update',
    arguments: { id: 'automation-1', status: 'paused' },
    signal,
  }, true, 'ask'), false)
  assert.equal(needsHumanApproval({
    name: 'automation_update',
    arguments: { id: 'automation-1', name: '新名称' },
    signal,
  }, true, 'ask'), true)
  assert.equal(needsHumanApproval({ name: 'automation_list', signal }, true, 'ask'), false)
  assert.match(humanApprovalReason('automation_delete'), /永久删除/)
})

test('会话策略优先读 override，否则回退配置默认值', () => {
  assert.equal(sessionApprovalPolicy({
    overrideOf: () => 'never',
    config: { policy: 'ask' },
  }, {}), 'never')
  assert.equal(sessionApprovalPolicy({
    overrideOf: () => undefined,
    config: { policy: 'ask' },
  }, {}), 'ask')
  assert.equal(sessionApprovalPolicy(undefined, {}), undefined)
})

test('未挂载的 Agent、非变更工具与已中止信号都不弹窗', () => {
  const aborted = new AbortController()
  aborted.abort()
  assert.equal(needsHumanApproval({ name: 'automation_create', signal: aborted.signal }, true, 'ask'), false)
  assert.equal(needsHumanApproval({ name: 'automation_create', signal: new AbortController().signal }, false, 'ask'), false)
  assert.equal(needsHumanApproval({ name: 'automation_runs', signal: new AbortController().signal }, true, 'ask'), false)
})

test('Config 默认值与插件注入列表保持契约', async () => {
  const module = await import('./index.js')
  assert.deepEqual(module.inject, [
    'storageDomain', 'agents', 'sessions', 'workspaceRegistry', 'agentDefaultModel',
    'agentPresets', 'permissionPresets', 'tools', 'connection', 'llm',
  ])
  const parsed = Config({})
  assert.equal(parsed.runTimeoutMinutes, 60)
  assert.equal(parsed.misfireGraceMinutes, 15)
  assert.equal(parsed.historyLimit, 200)
})
