import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  wrapSkillInputTriggerSource,
  enhanceSkillCandidates,
  scoreSkillCandidate,
  resolveSkillDisplayName,
  resolveSkillDescription,
} from '../../src/client/composer-commands-i18n.js'

test('e2e: composer slash-skill bilingual adaptive search, selection, and plain-text fill', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"><div class="composer-root"><textarea id="composer-input"></textarea></div></div></body></html>')
  const doc = dom.window.document
  globalThis.document = doc
  globalThis.window = dom.window

  const fakeLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const inputEl = doc.getElementById('composer-input')

  // 1. Initial State: raw available skills on host session
  const mockSkills = [
    {
      name: 'ip-character-consistency-studio',
      description: '根据角色设定和参考图，制作可持续复用的 AI IP 角色形象包。适合漫画、绘本持续出图',
      modelInvocable: true,
    },
    {
      name: 'frontend-developer',
      description: 'Expert frontend developer for modern web technologies',
      modelInvocable: true,
    },
    {
      name: 'code-review-expert',
      description: 'Expert code reviewer focusing on correctness and performance',
      modelInvocable: true,
    },
  ]

  const mockTriggerSource = {
    trigger: '/',
    name: 'skill',
    order: 2,
    async candidates(session, req) {
      const q = (req?.query || '').trim().toLowerCase()
      if (!q) return mockSkills
      return mockSkills.filter((s) => s.name.startsWith(q))
    },
    onPick({ candidate }) {
      return { text: `/${candidate.name} ` }
    },
  }

  // 2. Wrap source with omnimux skill i18n enhancement
  const enhancedSource = wrapSkillInputTriggerSource(mockTriggerSource, fakeLocale)

  // 3. User Journey A: User enters "/" -> opens full localized candidate list
  const fullCandidates = await enhancedSource.candidates(
    { sessionId: 'test-session-1' },
    { query: '', position: 'leading', drilled: false, signal: new AbortController().signal },
  )
  assert.equal(fullCandidates.length, 3)
  const fullNames = fullCandidates.map((c) => c.name)
  assert.ok(fullNames.includes('角色一致性形象包'))
  assert.ok(fullNames.includes('前端开发专家'))
  assert.ok(fullNames.includes('代码审查专家'))

  // 4. User Journey B: User types Chinese "/角色"
  const zhCandidates = await enhancedSource.candidates(
    { sessionId: 'test-session-1' },
    { query: '角色', position: 'leading', drilled: false, signal: new AbortController().signal },
  )
  assert.equal(zhCandidates.length, 1)
  const target = zhCandidates[0]
  assert.equal(target.name, '角色一致性形象包')
  assert.equal(target.rawName, 'ip-character-consistency-studio')
  assert.match(target.description, /ip-character-consistency-studio/)

  // 5. User Journey C: User hits Enter or clicks to pick the candidate
  const outcome = enhancedSource.onPick({
    candidate: target,
    session: { sessionId: 'test-session-1' },
    position: 'leading',
    via: 'enter',
    action: 'pick',
    span: { start: 0, end: 3 },
  })

  // 选中后输入框清空斜杠，技能名称交给技能按钮旁的标签
  assert.equal(outcome.text, '')
  assert.equal(globalThis.window.__omnimuxActiveSkill?.slug, 'ip-character-consistency-studio')
  assert.equal(globalThis.window.__omnimuxActiveSkill?.name, '角色一致性形象包')

  // 6. User Journey D: User types pinyin "/jiaose" without switching IME
  const pinyinCandidates = await enhancedSource.candidates(
    { sessionId: 'test-session-1' },
    { query: 'jiaose', position: 'leading', drilled: false, signal: new AbortController().signal },
  )
  assert.equal(pinyinCandidates.length, 1)
  assert.equal(pinyinCandidates[0].name, '角色一致性形象包')

  // 7. User Journey E: User types English slug "/ip"
  const enSlugCandidates = await enhancedSource.candidates(
    { sessionId: 'test-session-1' },
    { query: 'ip', position: 'leading', drilled: false, signal: new AbortController().signal },
  )
  assert.equal(enSlugCandidates.length, 1)
  assert.equal(enSlugCandidates[0].name, '角色一致性形象包')
  assert.equal(enSlugCandidates[0].rawName, 'ip-character-consistency-studio')
})
