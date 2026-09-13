import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SKILL_CHANGED_EVENT,
  dispatchSkillChanged,
  publishActiveSkill,
  readActiveSkill,
  resolveSkillFromEvent,
  subscribeSkillChanged,
} from './skill-event.ts'

/** 最小宿主替身：只需要 CustomEvent 与事件表。 */
function fakeWindow() {
  const listeners = new Map()
  const dispatched = []
  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }
  return {
    CustomEvent: FakeCustomEvent,
    dispatched,
    __omnimuxActiveSkill: null,
    dispatchEvent(event) {
      dispatched.push(event)
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

const SKILL = { id: 'sk-omx-video-deconstruct', slug: 'video-deconstruct', name: '复刻爆款视频' }

test('publishActiveSkill：写入持久值并广播技能变更', () => {
  const win = fakeWindow()
  const published = publishActiveSkill(SKILL, win)

  assert.equal(published, SKILL)
  assert.equal(readActiveSkill(win), SKILL)
  assert.equal(win.dispatched.length, 1)
  assert.equal(win.dispatched[0].type, SKILL_CHANGED_EVENT)
  assert.equal(win.dispatched[0].detail.skill, SKILL)
})

test('publishActiveSkill：传 null 表示移除技能，订阅方收到 null', () => {
  const win = fakeWindow()
  const seen = []
  subscribeSkillChanged((skill) => seen.push(skill), win)

  publishActiveSkill(SKILL, win)
  publishActiveSkill(null, win)

  assert.deepEqual(seen, [SKILL, null])
  assert.equal(readActiveSkill(win), null)
})

test('publishActiveSkill：取分类时 category 优先，其次取 categories 首项', () => {
  const win = fakeWindow()
  publishActiveSkill({ ...SKILL, category: '创作视频' }, win)
  assert.equal(win.dispatched.at(-1).detail.category, '创作视频')

  publishActiveSkill({ ...SKILL, categories: ['搜索爆款视频'] }, win)
  assert.equal(win.dispatched.at(-1).detail.category, '搜索爆款视频')

  publishActiveSkill(SKILL, win)
  assert.equal(win.dispatched.at(-1).detail.category, '')
})

test('subscribeSkillChanged：返回的取消函数能摘掉监听', () => {
  const win = fakeWindow()
  const seen = []
  const unsubscribe = subscribeSkillChanged((skill) => seen.push(skill), win)
  assert.equal(win.listenerCount(SKILL_CHANGED_EVENT), 1)

  unsubscribe()
  assert.equal(win.listenerCount(SKILL_CHANGED_EVENT), 0)

  dispatchSkillChanged(SKILL, win)
  assert.deepEqual(seen, [], '取消订阅后不得再收到事件')
})

test('无宿主环境时读写与订阅都是安全的空操作', () => {
  assert.equal(readActiveSkill(null), null)
  assert.equal(publishActiveSkill(SKILL, null), null)
  assert.doesNotThrow(() => dispatchSkillChanged(SKILL, null))
  assert.equal(typeof subscribeSkillChanged(() => {}, null), 'function')
})

test('resolveSkillFromEvent：不认识的载荷一律回落 null', () => {
  assert.equal(resolveSkillFromEvent({ detail: { skill: SKILL } }), SKILL)
  assert.equal(resolveSkillFromEvent({ detail: { skill: null } }), null)
  assert.equal(resolveSkillFromEvent({ detail: { skill: 'video-deconstruct' } }), null)
  assert.equal(resolveSkillFromEvent({ detail: {} }), null)
  assert.equal(resolveSkillFromEvent({}), null)
  assert.equal(resolveSkillFromEvent(null), null)
})

test('dispatchSkillChanged：广播失败不影响已写入的激活态', () => {
  const win = fakeWindow()
  win.dispatchEvent = () => { throw new Error('host exploded') }
  assert.doesNotThrow(() => publishActiveSkill(SKILL, win))
  assert.equal(readActiveSkill(win), SKILL)
})
