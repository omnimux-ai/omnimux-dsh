import test from 'node:test'
import assert from 'node:assert/strict'
import { getCreativePresetsStore } from './presets-store.js'
import { compileCreativePrompt } from './compiler.js'
import { CREATIVE_VIDEO_FORMATS, CREATIVE_HOOKS, CREATIVE_VISUAL_STYLES } from './catalog.js'

test('PresetsStore: handles multi-session isolated state, subscription, and reset', () => {
  const store = getCreativePresetsStore()
  const s1 = 'session-1'
  const s2 = 'session-2'

  // 1. 默认快照为空且引用稳定
  assert.deepEqual(store.getSnapshot(s1), { format: null, hook: null, style: null })
  assert.equal(store.getSnapshot(s1), store.getSnapshot(s1), 'getSnapshot must return stable cached reference')
  assert.equal(store.hasAnyPreset(s1), false)

  let notifyCount = 0
  const unsubscribe = store.subscribe(s1, () => {
    notifyCount++
  })

  // 2. 设置维度
  const sampleFormat = CREATIVE_VIDEO_FORMATS[0]
  store.setPreset(s1, 'format', sampleFormat)
  assert.equal(notifyCount, 1)
  assert.equal(store.getSnapshot(s1).format.id, sampleFormat.id)
  assert.equal(store.hasAnyPreset(s1), true)

  // 3. 多会话隔离验证
  assert.equal(store.getSnapshot(s2).format, null)
  assert.equal(store.hasAnyPreset(s2), false)

  // 4. 设置 hook 与 style
  const sampleHook = CREATIVE_HOOKS[0]
  const sampleStyle = CREATIVE_VISUAL_STYLES[0]
  store.setPreset(s1, 'hook', sampleHook)
  store.setPreset(s1, 'style', sampleStyle)
  assert.equal(notifyCount, 3)

  const s1State = store.getSnapshot(s1)
  assert.equal(s1State.hook.id, sampleHook.id)
  assert.equal(s1State.style.id, sampleStyle.id)

  // 5. 单项清除
  store.removePreset(s1, 'hook')
  assert.equal(store.getSnapshot(s1).hook, null)
  assert.equal(store.hasAnyPreset(s1), true)

  // 6. 全部清空 (一次性消费)
  store.clearPresets(s1)
  assert.deepEqual(store.getSnapshot(s1), { format: null, hook: null, style: null })
  assert.equal(store.hasAnyPreset(s1), false)

  // 7. 取消订阅
  unsubscribe()
  store.setPreset(s1, 'format', sampleFormat)
  assert.equal(notifyCount, 5) // no new notify since unsubscribed
})

test('CreativeDimensionModal metadata & catalog alignment: verify 3 dimensions', () => {
  assert.ok(CREATIVE_VIDEO_FORMATS.length >= 90, 'Formats must have >= 90 presets')
  assert.ok(CREATIVE_HOOKS.length >= 70, 'Hooks must have >= 70 presets')
  assert.ok(CREATIVE_VISUAL_STYLES.length >= 15, 'Styles must have >= 15 presets')

  // 验证每个 item 具备必须的展示与编译字段
  const checkItem = (item) => {
    assert.ok(item.id, 'item must have id')
    assert.ok(item.title, 'item must have title')
    assert.ok(item.categorySlug, 'item must have categorySlug')
    assert.ok(item.description || item.prompt, 'item must have description or prompt')
  }

  CREATIVE_VIDEO_FORMATS.slice(0, 10).forEach(checkItem)
  CREATIVE_HOOKS.slice(0, 10).forEach(checkItem)
  CREATIVE_VISUAL_STYLES.slice(0, 10).forEach(checkItem)
})

test('Submission Context Assembly: compiles presets into system prompt and clears state', () => {
  const store = getCreativePresetsStore()
  const sid = 'test-submission-session'

  const format = CREATIVE_VIDEO_FORMATS[0]
  const hook = CREATIVE_HOOKS[0]
  const style = CREATIVE_VISUAL_STYLES[0]

  store.setPreset(sid, 'format', format)
  store.setPreset(sid, 'hook', hook)
  store.setPreset(sid, 'style', style)

  // 模拟用户在输入框键入文案并触发发送拦截
  const rawDraft = '这是一款超轻量户外防晒冲锋衣'
  const currentPresets = store.getSnapshot(sid)

  const compiledPrompt = compileCreativePrompt({
    format: currentPresets.format,
    hook: currentPresets.hook,
    style: currentPresets.style,
    userQuery: rawDraft,
    language: 'zh-CN',
  })

  // 验证编译产物
  assert.ok(compiledPrompt.includes(format.titleZh || format.title))
  assert.ok(compiledPrompt.includes(hook.titleZh || hook.title))
  assert.ok(compiledPrompt.includes(style.titleZh || style.title))
  assert.ok(compiledPrompt.includes(rawDraft))
  assert.ok(compiledPrompt.includes('【营销视频创意指令 · 工业级分镜与视听规范】'))

  // 模拟发送成功后消费清空
  store.clearPresets(sid)
  assert.equal(store.hasAnyPreset(sid), false)
})
