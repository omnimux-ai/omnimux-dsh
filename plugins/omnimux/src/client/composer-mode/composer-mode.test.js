import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getComposerModeStore,
  COMPOSER_MODES,
  MODE_AGENT,
  MODE_MARKETING,
  MODE_DRAMA,
  DEFAULT_COMPOSER_MODE,
} from './composer-mode-store.js'

test('ComposerModeStore: 基础模式定义与默认值', () => {
  assert.equal(DEFAULT_COMPOSER_MODE, 'agent')
  assert.equal(MODE_AGENT, 'agent')
  assert.equal(MODE_MARKETING, 'marketing')
  assert.equal(MODE_DRAMA, 'drama')

  const modeIds = COMPOSER_MODES.map((m) => m.id)
  assert.deepEqual(modeIds, ['agent', 'marketing', 'drama'])
})

test('ComposerModeStore: 会话隔离、状态切换与 useSyncExternalStore 快照稳定性', () => {
  const store = getComposerModeStore()
  const s1 = 'session-test-1'
  const s2 = 'session-test-2'

  // 1. 默认快照为 'agent'
  assert.equal(store.getSnapshot(s1), 'agent')
  assert.equal(store.getMode(s1), 'agent')
  assert.equal(store.getSnapshot(s2), 'agent')

  let s1Notified = 0
  const unsubscribe1 = store.subscribe(s1, () => {
    s1Notified++
  })

  // 2. 切换 s1 为 'marketing'
  store.setMode(s1, 'marketing')
  assert.equal(s1Notified, 1)
  assert.equal(store.getMode(s1), 'marketing')
  assert.equal(store.getSnapshot(s1), 'marketing')

  // 3. s2 严格保持隔离，不受 s1 影响
  assert.equal(store.getMode(s2), 'agent')
  assert.equal(store.getSnapshot(s2), 'agent')

  // 4. 再次设置相同 mode 不触发重复通知
  store.setMode(s1, 'marketing')
  assert.equal(s1Notified, 1)

  // 5. 设置为占位模式 'drama'
  store.setMode(s1, 'drama')
  assert.equal(s1Notified, 2)
  assert.equal(store.getMode(s1), 'drama')

  // 6. 设置非法模式回退至默认 'agent' (模式由 'drama' 变为 'agent'，触发第 3 次通知)
  store.setMode(s1, 'invalid_mode')
  assert.equal(s1Notified, 3)
  assert.equal(store.getMode(s1), 'agent')

  // 7. 取消订阅验证
  unsubscribe1()
  store.setMode(s1, 'marketing')
  assert.equal(s1Notified, 3, '取消订阅后不应再收到通知')

  // 8. 重置清理
  store.reset(s1)
  assert.equal(store.getMode(s1), 'agent')
})

test('ComposerMode Contract: 插槽与组件联动架构校验', () => {
  const indexPath = path.resolve(import.meta.dirname, '../index.js')
  const indexContent = fs.readFileSync(indexPath, 'utf-8')

  // 1. 验证 ComposerModeTabs 注册到 conversation.input.dock，且 order 为 115
  assert.ok(
    indexContent.includes("id: 'omnimux-composer-mode-tabs'"),
    'index.js 必须注册 omnimux-composer-mode-tabs'
  )
  assert.ok(
    indexContent.includes('order: 115'),
    'omnimux-composer-mode-tabs 的 order 必须为 115 (紧邻输入框上方)'
  )
  assert.ok(
    indexContent.includes("ctx.slots.inject('conversation.input.dock'"),
    '必须通过官方标准插槽 conversation.input.dock 注入'
  )

  // 2. 验证 ComposerPresetsTriggers 在非 marketing 模式下 return null
  const triggersPath = path.resolve(import.meta.dirname, '../presets/ComposerPresetsTriggers.jsx')
  const triggersContent = fs.readFileSync(triggersPath, 'utf-8')
  assert.ok(
    triggersContent.includes("if (activeMode !== 'marketing')"),
    'ComposerPresetsTriggers 必须在非 marketing 模式下静默隐藏'
  )

  // 3. 验证 ComposerPresetsChips 在非 marketing 模式下 return null
  const chipsPath = path.resolve(import.meta.dirname, '../presets/ComposerPresetsChips.jsx')
  const chipsContent = fs.readFileSync(chipsPath, 'utf-8')
  assert.ok(
    chipsContent.includes("if (activeMode !== 'marketing')"),
    'ComposerPresetsChips 必须在非 marketing 模式下静默隐藏'
  )

  // 4. 验证 AttachmentSubmitBridge 仅在 marketing 模式下编译预设
  const bridgePath = path.resolve(import.meta.dirname, '../composer-add/AttachmentSubmitBridge.jsx')
  const bridgeContent = fs.readFileSync(bridgePath, 'utf-8')
  assert.ok(
    bridgeContent.includes("if (currentMode === 'marketing')"),
    'AttachmentSubmitBridge 必须仅在 marketing 模式下拼装预设上下文'
  )

  // 5. 验证全屏规则：当处于分屏紧凑状态 (short/icon 密度) 或 panelOpen 为 true 时隐藏
  const tabsPath = path.resolve(import.meta.dirname, './ComposerModeTabs.jsx')
  const tabsContent = fs.readFileSync(tabsPath, 'utf-8')
  assert.ok(
    tabsContent.includes('if (isPanelOpen)'),
    'ComposerModeTabs 必须在分屏/侧边栏打开 (isPanelOpen) 时返回 null'
  )

  const stylesPath = path.resolve(import.meta.dirname, './styles.js')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
  assert.ok(
    stylesContent.includes("html[data-omnimux-composer-density='short'] .omnimux-composer-mode-wrap"),
    'styles.js 必须包含非全屏模式下的 CSS 隐藏规则'
  )
})
