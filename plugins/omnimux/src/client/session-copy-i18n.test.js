import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SESSION_COPY_OVERRIDES,
  patchSessionCopyLocaleDicts,
  installSessionCopyI18n,
} from './session-copy-i18n.js'

test('SESSION_COPY_OVERRIDES defines 新对话 overrides for sidebar and workspace', () => {
  assert.equal(SESSION_COPY_OVERRIDES.sidebar.zh['session.new'], '新对话')
  assert.equal(SESSION_COPY_OVERRIDES.sidebar.zh['session.new.label'], '新对话')
  assert.equal(SESSION_COPY_OVERRIDES.workspace.zh['session.new'], '新对话')
  assert.equal(SESSION_COPY_OVERRIDES.workspace.zh['actions.newSession.aria'], '在“{name}”中新建对话')
})

test('patchSessionCopyLocaleDicts updates dictionaries and calls publish', () => {
  const sidebarZh = { 'session.new': '新会话', 'session.new.label': '新建会话' }
  const workspaceZh = { 'session.new': '新会话', 'actions.newSession.aria': '在“{name}”中新建会话' }

  const dicts = new Map()
  const sidebarMap = new Map([['zh', sidebarZh]])
  const workspaceMap = new Map([['zh', workspaceZh]])
  dicts.set('sidebar', sidebarMap)
  dicts.set('workspace', workspaceMap)

  let published = false
  const fakeLocale = {
    dicts,
    snapshot: { active: 'zh' },
    publish(active, force) {
      published = true
    },
  }

  const changed = patchSessionCopyLocaleDicts(fakeLocale)
  assert.equal(changed, true)
  assert.equal(sidebarZh['session.new'], '新对话')
  assert.equal(sidebarZh['session.new.label'], '新对话')
  assert.equal(workspaceZh['session.new'], '新对话')
  assert.equal(workspaceZh['actions.newSession.aria'], '在“{name}”中新建对话')
  assert.equal(published, true)

  // Subsequent call when already up-to-date returns false
  const changedAgain = patchSessionCopyLocaleDicts(fakeLocale)
  assert.equal(changedAgain, false)
})

test('installSessionCopyI18n intercepts locale.register and merges overrides', () => {
  const dicts = new Map()
  let published = false
  let registerCalled = false

  const fakeLocale = {
    dicts,
    snapshot: { active: 'zh' },
    register(ns, pairs) {
      registerCalled = true
      const m = new Map()
      for (const [k, v] of Object.entries(pairs)) {
        m.set(k, v)
      }
      dicts.set(ns, m)
    },
    publish() {
      published = true
    },
  }

  const effects = []
  const fakeCtx = {
    locale: fakeLocale,
    effect(fn) {
      effects.push(fn())
    },
  }

  const dispose = installSessionCopyI18n(fakeCtx)

  // When official sidebar registers:
  const rawSidebarZh = { 'session.new': '新会话', 'session.new.label': '新建会话' }
  fakeLocale.register('sidebar', { zh: rawSidebarZh })

  assert.equal(registerCalled, true)
  assert.equal(rawSidebarZh['session.new'], '新对话')
  assert.equal(rawSidebarZh['session.new.label'], '新对话')

  // When official workspace registers:
  const rawWorkspaceZh = { 'session.new': '新会话', 'actions.newSession.aria': '在“{name}”中新建会话' }
  fakeLocale.register('workspace', { zh: rawWorkspaceZh })

  assert.equal(rawWorkspaceZh['session.new'], '新对话')
  assert.equal(rawWorkspaceZh['actions.newSession.aria'], '在“{name}”中新建对话')

  dispose()
  effects.forEach((fn) => typeof fn === 'function' && fn())
})
