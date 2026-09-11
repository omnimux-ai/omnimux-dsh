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

  // 6. 验证 Hero 阶段位置重定向至大标题正下方、heroWorkspaceRow 上方
  assert.ok(
    tabsContent.includes('heroWorkspaceRow'),
    'ComposerModeTabs 必须包含 heroWorkspaceRow 锚点探测'
  )
  assert.ok(
    tabsContent.includes('createPortal'),
    'ComposerModeTabs 必须使用 createPortal 实现大标题正下方精准定位'
  )
  assert.ok(
    stylesContent.includes('#omnimux-composer-mode-anchor'),
    'styles.js 必须包含 #omnimux-composer-mode-anchor 样式声明'
  )

  // 7. 验证视觉微调：Tab 按钮适当调大 (height: 32px, padding: 0 18px, font-size: 14px)
  assert.ok(stylesContent.includes('height: 32px;'), 'Tab 按钮高度必须调大为 32px')
  assert.ok(stylesContent.includes('padding: 0 18px;'), 'Tab 按钮水平 padding 必须调大为 18px')
  assert.ok(stylesContent.includes('font-size: 14px;'), 'Tab 按钮字号必须调大为 14px')

  // 8. 验证输入框重启与状态隔离恢复机制
  assert.ok(
    tabsContent.includes('switchMode'),
    'ComposerModeTabs 必须调用 store.switchMode 原子切换'
  )
  assert.ok(
    tabsContent.includes('setComposerDraft'),
    'ComposerModeTabs 必须包含 setComposerDraft 输入框重启设值能力'
  )
  assert.ok(
    tabsContent.includes('setAllPresets'),
    'ComposerModeTabs 必须使用 setAllPresets 恢复营销预设状态'
  )
})

test('ComposerModeStore: 独立缓存、状态隔离与 Tab 切换恢复 (Agent 1111 -> 营销 2222 -> 短剧 空 -> 切回恢复)', () => {
  const store = getComposerModeStore()
  const s1 = 'session-isolated-cache-test'

  // 初始：进入新会话，默认 Agent 模式，缓存为空
  assert.equal(store.getMode(s1), 'agent')
  assert.deepEqual(store.getModeCache(s1, 'agent'), { draft: '', presets: null })

  // 1. 在 Agent 输入 1111，随后点击切换到 营销
  const marketingCache = store.switchMode(s1, 'marketing', { draft: '1111', presets: null })
  // 切换后：模式为 marketing，返回的营销模式缓存为空
  assert.equal(store.getMode(s1), 'marketing')
  assert.equal(marketingCache.draft, '', '首次切换到营销模式，缓存内容应为空')
  assert.equal(marketingCache.presets, null)

  // 2. 在 营销 输入 2222 并选择广告格式预设，随后点击切换到 短剧
  const dramaCache = store.switchMode(s1, 'drama', {
    draft: '2222',
    presets: { format: 'ugc_hook', hook: null, style: null },
  })
  // 切换后：模式为 drama，返回的短剧模式缓存为空
  assert.equal(store.getMode(s1), 'drama')
  assert.equal(dramaCache.draft, '', '首次切换到短剧模式，缓存内容应为空')

  // 3. 点击切换回 Agent
  const agentRestored = store.switchMode(s1, 'agent', { draft: '' })
  assert.equal(store.getMode(s1), 'agent')
  assert.equal(agentRestored.draft, '1111', '切回 Agent 应恢复之前输入的 1111')

  // 4. 点击切换回 营销
  const marketingRestored = store.switchMode(s1, 'marketing', { draft: '1111' })
  assert.equal(store.getMode(s1), 'marketing')
  assert.equal(marketingRestored.draft, '2222', '切回营销应恢复之前输入的 2222')
  assert.deepEqual(
    marketingRestored.presets,
    { format: 'ugc_hook', hook: null, style: null },
    '切回营销应恢复之前选择的广告格式'
  )

  // 5. 多会话隔离验证
  const s2 = 'session-other'
  assert.equal(store.getMode(s2), 'agent')
  assert.equal(store.getModeCache(s2, 'agent').draft, '')

  // 清理
  store.reset(s1)
  store.reset(s2)
})
