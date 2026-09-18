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

  // 3. 验证 ComposerPresetsChips 彻底收敛为 return null，输入框左上角不渲染多余选项胶囊
  const chipsPath = path.resolve(import.meta.dirname, '../presets/ComposerPresetsChips.jsx')
  const chipsContent = fs.readFileSync(chipsPath, 'utf-8')
  assert.ok(
    chipsContent.includes('return null'),
    'ComposerPresetsChips 必须返回 null 彻底移除输入框左上角多余选项元素'
  )

  // 4. 验证 AttachmentSubmitBridge 仅在 marketing 模式下编译预设
  const bridgePath = path.resolve(import.meta.dirname, '../composer-add/AttachmentSubmitBridge.jsx')
  const bridgeContent = fs.readFileSync(bridgePath, 'utf-8')
  assert.ok(
    bridgeContent.includes("if (currentMode === 'marketing')"),
    'AttachmentSubmitBridge 必须仅在 marketing 模式下拼装预设上下文'
  )

  // 5. 验证新建会话与对话全阶段彻底移除模式切换 Tab 胶囊栏 (Agent / 营销 / 短剧)
  const tabsPath = path.resolve(import.meta.dirname, './ComposerModeTabs.jsx')
  const tabsContent = fs.readFileSync(tabsPath, 'utf-8')
  assert.ok(
    tabsContent.includes('return null'),
    'ComposerModeTabs 必须始终返回 null 彻底从新建会话中移除'
  )
  assert.ok(
    tabsContent.includes('omnimux-composer-mode-anchor'),
    'ComposerModeTabs 必须清理残留 DOM 锚点'
  )

  const stylesPath = path.resolve(import.meta.dirname, './styles.js')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  const marketSkillPickerPath = path.resolve(
    import.meta.dirname,
    '../../../../omnimux-market/src/client/skill-picker.js'
  )
  const marketSkillPickerContent = fs.readFileSync(marketSkillPickerPath, 'utf-8')
  assert.ok(
    marketSkillPickerContent.includes('isMarketingMode'),
    'SkillPickerButton 必须包含营销模式响应式隐藏逻辑'
  )

  // 10. 验证会话对话过程中彻底隐藏模式 Tab (仅在未提交 Hero 阶段展示)
  assert.ok(
    stylesContent.includes("[data-phase='active'] .omnimux-composer-mode-wrap"),
    'styles.js 必须包含 active 对话阶段隐藏模式 Tab 的规则'
  )
  assert.ok(
    tabsContent.includes('return null') && !tabsContent.includes('return content'),
    'ComposerModeTabs 在非 Hero 阶段必须返回 null，不得退化渲染在输入框上方'
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
