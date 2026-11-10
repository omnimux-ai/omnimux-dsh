import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AGENT_AUTO_REFRESH_MS,
  agentModelSource,
  agentScanUrl,
  agentStatusText,
  agentUpdatesUrl,
  countInstalledAgents,
  shouldAutoRefresh,
} from './agent-live-view.js'

function t(key) {
  if (key === 'runtime.cliNeedsLogin') return '需要登录'
  if (key === 'runtime.unconfigured') return '未配置'
  if (key === 'runtime.notDetected') return '未检测到程序安装'
  return key
}

describe('agentScanUrl', () => {
  it('asks the Host to skip its cache only for an explicit scan', () => {
    assert.equal(agentScanUrl(), '/omnimux/agents')
    assert.equal(agentScanUrl(false), '/omnimux/agents')
    assert.equal(agentScanUrl(true), '/omnimux/agents?refresh=1')
    assert.equal(agentUpdatesUrl(true), '/omnimux/agents/updates?refresh=1')
    assert.equal(agentUpdatesUrl(), '/omnimux/agents/updates')
  })
})

describe('countInstalledAgents', () => {
  it('counts only rows the scan proved installed', () => {
    assert.equal(countInstalledAgents([{ installed: true }, { installed: false }, { installed: true }]), 2)
    assert.equal(countInstalledAgents([]), 0)
    assert.equal(countInstalledAgents(null), 0)
  })
})

describe('agentStatusText', () => {
  it('prefers the live version and explains an unusable CLI', () => {
    assert.equal(agentStatusText(t, { version: 'codex-cli 0.167.0' }), 'codex-cli 0.167.0')
    assert.equal(agentStatusText(t, { version: '' }), '未检测到程序安装')
    assert.equal(agentStatusText(t, { auth: { state: 'signed-out', loginSupported: true } }), '需要登录')
    assert.equal(agentStatusText(t, { auth: { state: 'signed-out', loginSupported: false } }), '未配置')
    assert.equal(agentStatusText(t, { version: '2.5.2', auth: { state: 'signed-in' } }), '2.5.2')
  })
})

describe('agentModelSource', () => {
  it('maps only the two Host-declared provenances', () => {
    assert.equal(agentModelSource({ modelsSource: 'live' }), 'live')
    assert.equal(agentModelSource({ modelsSource: 'preset' }), 'preset')
    assert.equal(agentModelSource({}), '')
    assert.equal(agentModelSource(null), '')
  })
})

describe('shouldAutoRefresh', () => {
  it('throttles focus re-scans and never runs while hidden', () => {
    assert.equal(shouldAutoRefresh(0, 1000, 'visible'), true)
    assert.equal(shouldAutoRefresh(0, 1000, 'hidden'), false)
    assert.equal(shouldAutoRefresh(1000, 1000 + AGENT_AUTO_REFRESH_MS - 1), false)
    assert.equal(shouldAutoRefresh(1000, 1000 + AGENT_AUTO_REFRESH_MS), true)
    assert.equal(shouldAutoRefresh(Number.NaN, 1000), true)
  })
})