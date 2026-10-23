import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { resolveChannelPlan } from '../catalog/serving/channel-groups.js'
import { parseTextConfig, resolveTextRoute } from '../text/catalog.js'
import { executeOmnimuxText } from '../text/execute.js'
import { executeOmnimuxMedia } from './execute.js'
import { parseMediaConfig, resolveMediaRoute } from './route.js'

// Public routing and execution seams only; injected transports never contact a service.
describe('routing request boundaries', () => {
  it('rejects conflicting inline and field groups while accepting aliases of the same line', () => {
    const media = parseMediaConfig()
    const text = parseTextConfig()
    assert.throws(() => resolveMediaRoute('video', { model: 'seedance-2-0@cheap', group: 'standard' }, media, {}), { code: 'unknown-group' })
    // #3516：claude 的文本渠道分组已随渠道停用退场；文本路由用现役 gemini-3.8-flash 分组验证冲突。
    assert.throws(() => resolveTextRoute({ model: 'gemini-3.8-flash@standard', group: 'unknown-text-line' }, text, {}), { code: 'unknown-group' })
    assert.deepEqual(resolveMediaRoute('video', { model: 'seedance-2-0@standard', group: 'default' }, media, {}).candidates, ['seedance-2-0@default'])
    // #3516：minimax-h3 专线整体退场；现役多线路模型 seedance-2-5 上同一线路的 id/wireGroup 写法可互换。
    assert.deepEqual(resolveMediaRoute('video', { model: 'seedance-2-5@480p', group: 'desktop-480p' }, media, {}).candidates, ['seedance-2-5@desktop-480p'])
    assert.throws(() => resolveMediaRoute('video', { model: 'seedance-2-5@480p', group: '720p' }, media, {}), { code: 'unknown-group' })
    assert.throws(() => resolveMediaRoute('video', { model: 'minimax-h3@turbo', group: 'default' }, media, {}), { code: 'unknown-group' })
    assert.deepEqual(resolveTextRoute({ model: 'gemini-3.8-flash@standard', group: 'STANDARD' }, text, {}).candidates, ['gemini-3.8-flash@default'])
  })

  it('rejects disabled, unknown, excluded and malformed pools without widening channel plans', () => {
    const cases = [
      { model: 'seedance-2-5', options: { group: 'pro' }, unresolved: ['pro'] },
      { model: 'seedance-2-0-fast', options: { group: 'preferred' }, unresolved: ['preferred'] },
      { model: 'seedance-2-0', options: { group: 'unknown-line' }, unresolved: ['unknown-line'] },
      { model: 'seedance-2-0', options: { group: 'pro', allowedGroups: ['cheap'] }, unresolved: ['pro'] },
      { model: 'seedance-2-0', options: { allowedGroups: [' '] }, unresolved: [' '] },
      { model: 'seedance-2-0', options: { allowedGroups: ['cheap', null] }, unresolved: ['cheap'] },
      { model: 'seedance-2-0', options: { allowedGroups: 'cheap' }, unresolved: [] },
      { model: 'grok-imagine-image-2', options: { group: 'standard' }, unresolved: ['standard'] },
      { model: 'grok-imagine-image-2', options: { strategy: 'auto' }, unresolved: [] },
    ]
    for (const entry of cases) {
      assert.deepEqual(resolveChannelPlan(entry.model, entry.options), { candidates: [], unresolvedGroups: entry.unresolved }, entry.model)
    }
    assert.deepEqual(resolveChannelPlan('seedance-2-0', { allowedGroups: [] }).candidates, resolveChannelPlan('seedance-2-0').candidates)
  })

  it('locks a single explicit line and preserves allowed strategy, wire models and verified BYOK', () => {
    const media = parseMediaConfig()
    const text = parseTextConfig()
    assert.deepEqual(resolveMediaRoute('video', { model: 'seedance-2-5', group: '480p', strategy: 'stability_first' }, media, {}).candidates, ['seedance-2-5@desktop-480p'])
    assert.deepEqual(resolveTextRoute({ model: 'gemini-3.8-flash', group: 'standard', strategy: 'cost_first' }, text, {}).candidates, ['gemini-3.8-flash@default'])
    assert.deepEqual(resolveChannelPlan('seedance-2-5', { group: '480p', allowedGroups: ['480p', '720p'], strategy: 'cost_first' }).candidates, ['seedance-2-5@desktop-480p', 'seedance-2-5@desktop-720p'])
    assert.deepEqual(resolveChannelPlan('seedance-2-5', { group: '720p', allowedGroups: ['480p', '720p'], strategy: 'cost_first' }).candidates, ['seedance-2-5@desktop-720p', 'seedance-2-5@desktop-480p'])
    assert.deepEqual(resolveChannelPlan('seedance-2-0', { group: 'BYOK-FAL', runtimeSettings: { runtimeKeyVerified: true, runtimeMediaProvider: 'fal', runtimeMediaVideo: true } }).candidates, ['seedance-2-0@byok-fal'])
  })

  it('rejects unsafe media requests before HTTP, credentials or output writes', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-routing-boundary-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const dest = join(dir, 'rejected.bin')
    let fetchCalls = 0
    let credentialCalls = 0
    const cases = [
      { capability: 'video', model: 'seedance-2-0@cheap', group: 'standard' },
      { capability: 'video', model: 'minimax-h3@turbo', group: 'standard' },
      { capability: 'video', model: 'seedance-2-5', group: 'pro' },
      { capability: 'video', model: 'seedance-2-0-fast', group: 'preferred' },
      { capability: 'video', model: 'seedance-2-0', group: 'unknown-line' },
      { capability: 'video', model: 'seedance-2-0', group: 'pro', allowedGroups: ['cheap'] },
      { capability: 'video', model: 'seedance-2-0', allowedGroups: [' '] },
      { capability: 'video', model: 'seedance-2-0', allowedGroups: ['cheap', null] },
      { capability: 'video', model: 'seedance-2-0', allowedGroups: 'cheap' },
      { capability: 'image', model: 'grok-imagine-image-2', allowedGroups: ['standard'] },
      { capability: 'image', model: 'grok-imagine-image-2', strategy: 'auto' },
      { capability: 'image', model: 'gpt-image-2.5-flare', group: 'pro' },
    ]
    for (const entry of cases) {
      await assert.rejects(() => executeOmnimuxMedia(entry.capability, {
        prompt: 'synthetic routing rejection', dest, wait: false,
        model: entry.model, group: entry.group, allowedGroups: entry.allowedGroups, strategy: entry.strategy,
        env: { OMNIMUX_API_KEY: 'sk-routing-test-only' },
        credentials: { resolve: async () => { credentialCalls += 1; throw new Error('credentials must not be read') } },
        fetcher: async () => { fetchCalls += 1; throw new Error('HTTP must not be called') },
      }), { code: entry.allowedGroups !== undefined
        && (!Array.isArray(entry.allowedGroups) || entry.allowedGroups.some((item) => typeof item !== 'string' || !item.trim()))
        ? 'omnimux-invalid-request' : 'unknown-group' }, entry.model)
      assert.equal(fetchCalls, 0, entry.model)
      assert.equal(credentialCalls, 0, entry.model)
      assert.equal(existsSync(dest), false, entry.model)
    }
  })

  it('rejects unsafe text routing before HTTP or the session stream', async () => {
    let fetchCalls = 0
    let streamCalls = 0
    // 2026-10-21 #3527：chat 白名单只剩 gemini-3.8-flash；claude/grok 等未上架型号
    // 在任何分组解析之前就以 unknown-model 拒绝，现役型号的非法分组仍走 unknown-group。
    const cases = [
      [{ model: 'gemini-3.8-flash@claude-plus' }, 'unknown-group'],
      [{ model: 'gemini-3.8-flash', group: 'claude-plus' }, 'unknown-group'],
      [{ model: 'gemini-3.8-flash', group: 'unknown-line' }, 'unknown-group'],
      [{ model: 'gemini-3.8-flash', group: 'cheap' }, 'unknown-group'],
      [{ model: 'gemini-3.8-flash', group: 'standard', allowedGroups: ['claude-plus'] }, 'unknown-group'],
      [{ model: 'gemini-3.8-flash', allowedGroups: [' '] }, 'omnimux-invalid-request'],
      [{ model: 'gemini-3.8-flash', allowedGroups: ['standard', null] }, 'omnimux-invalid-request'],
      [{ model: 'gemini-3.8-flash', allowedGroups: 'standard' }, 'omnimux-invalid-request'],
      [{ model: 'claude-opus-4-6', allowedGroups: ['standard'] }, 'unknown-model'],
      [{ model: 'grok-4.6', strategy: 'auto' }, 'unknown-model'],
    ]
    for (const [entry, code] of cases) {
      await assert.rejects(() => executeOmnimuxText({
        prompt: 'synthetic routing rejection',
        model: entry.model, group: entry.group, allowedGroups: entry.allowedGroups, strategy: entry.strategy,
        env: { OMNIMUX_API_KEY: 'sk-routing-test-only' },
        fetcher: async () => { fetchCalls += 1; throw new Error('HTTP must not be called') },
        llm: { stream: async function* () { streamCalls += 1; throw new Error('stream must not be called') } },
      }), { code }, `${entry.model} ${entry.group ?? ''}`)
      assert.equal(fetchCalls, 0, entry.model)
      assert.equal(streamCalls, 0, entry.model)
    }
  })
})
