/** 技能激活态全局订阅：爆款复刻卡片点亮技能药丸必须走到同一条通道。 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SKILL_CHANGED_EVENT,
  resolveActiveSkillFromEvent,
  subscribeActiveSkill,
} from './skill-picker-logic.js'

/** 最小宿主替身：只需要事件表与 CustomEvent 语义。 */
function fakeWindow() {
  const listeners = new Map()
  return {
    dispatched: [],
    dispatchEvent(event) {
      this.dispatched.push(event)
      for (const listener of listeners.get(event.type) || []) listener(event)
      return true
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    listenerCount(type) {
      return (listeners.get(type) || new Set()).size
    },
  }
}

const RECREATE_SKILL = {
  id: 'sk-omx-video-deconstruct',
  name: '复刻爆款视频',
  title: '复刻爆款视频',
  slug: 'video-deconstruct',
}

test('resolveActiveSkillFromEvent：只接受对象型技能载荷', () => {
  assert.equal(resolveActiveSkillFromEvent({ detail: { skill: RECREATE_SKILL } }), RECREATE_SKILL)
  assert.equal(resolveActiveSkillFromEvent({ detail: { skill: null } }), null)
  assert.equal(resolveActiveSkillFromEvent({ detail: { skill: 'video-deconstruct' } }), null)
  assert.equal(resolveActiveSkillFromEvent({ detail: {} }), null)
  assert.equal(resolveActiveSkillFromEvent(null), null)
  assert.equal(resolveActiveSkillFromEvent('omnimux:skill:changed'), null)
})

test('subscribeActiveSkill：外部激活技能时立刻把技能交给组件', () => {
  const win = fakeWindow()
  const seen = []
  subscribeActiveSkill((skill) => seen.push(skill), win)

  win.dispatchEvent({ type: SKILL_CHANGED_EVENT, detail: { skill: RECREATE_SKILL } })
  assert.deepEqual(seen, [RECREATE_SKILL], '复刻激活技能必须点亮底部药丸')
})

test('subscribeActiveSkill：技能被移除时送 null，药丸可以即时收起', () => {
  const win = fakeWindow()
  const seen = []
  subscribeActiveSkill((skill) => seen.push(skill), win)

  win.dispatchEvent({ type: SKILL_CHANGED_EVENT, detail: { skill: RECREATE_SKILL } })
  win.dispatchEvent({ type: SKILL_CHANGED_EVENT, detail: { skill: null } })
  assert.deepEqual(seen, [RECREATE_SKILL, null])
})

test('subscribeActiveSkill：脏载荷不会污染激活态', () => {
  const win = fakeWindow()
  const seen = []
  subscribeActiveSkill((skill) => seen.push(skill), win)

  win.dispatchEvent({ type: SKILL_CHANGED_EVENT, detail: { skill: 42 } })
  win.dispatchEvent({ type: SKILL_CHANGED_EVENT })
  assert.deepEqual(seen, [null, null])
})

test('subscribeActiveSkill：取消订阅后不再回调，缺失宿主时是安全的空操作', () => {
  const win = fakeWindow()
  const seen = []
  const unsubscribe = subscribeActiveSkill((skill) => seen.push(skill), win)
  assert.equal(win.listenerCount(SKILL_CHANGED_EVENT), 1)

  unsubscribe()
  assert.equal(win.listenerCount(SKILL_CHANGED_EVENT), 0)
  win.dispatchEvent({ type: SKILL_CHANGED_EVENT, detail: { skill: RECREATE_SKILL } })
  assert.deepEqual(seen, [])

  const noop = subscribeActiveSkill(() => {}, null)
  assert.equal(typeof noop, 'function')
  assert.doesNotThrow(() => noop())
})
