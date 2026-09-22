import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { resolveComposerSessionId } from './session.js'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('会话标识派生（快捷方式与附件托盘共用）', () => {
  it('按 session.sessionId → 透传 sessionId → session.id → 宿主当前会话 的顺序取值', () => {
    assert.equal(resolveComposerSessionId({ sessionId: 'from-session' }, 'from-prop', 'from-host'), 'from-session')
    assert.equal(resolveComposerSessionId({ id: 'from-id' }, 'from-prop', 'from-host'), 'from-prop')
    assert.equal(resolveComposerSessionId({ id: 'from-id' }, '', 'from-host'), 'from-id')
    assert.equal(resolveComposerSessionId({}, undefined, 'from-host'), 'from-host')
  })

  it('全部缺失时才回落 default，绝不返回空串', () => {
    assert.equal(resolveComposerSessionId(null, undefined, undefined), 'default')
    assert.equal(resolveComposerSessionId({}, '', ''), 'default')
    assert.equal(resolveComposerSessionId(undefined, null, ''), 'default')
    assert.equal(resolveComposerSessionId('不是对象', '', ''), 'default')
    assert.equal(resolveComposerSessionId({ sessionId: '  ' }, undefined, undefined), 'default')
  })

  it('只接受字符串：非字符串一律跳过，绝不强转（{} 不能变成 [object Object]）', () => {
    assert.equal(resolveComposerSessionId({ sessionId: {} }, undefined, undefined), 'default')
    assert.equal(resolveComposerSessionId({ sessionId: 123 }, undefined, undefined), 'default')
    assert.equal(resolveComposerSessionId(null, 123, 456), 'default')
    assert.equal(resolveComposerSessionId(null, [], {}), 'default')
    // 非法值之后仍是同一条链：跳过它，继续往下找。
    assert.equal(resolveComposerSessionId({ sessionId: {} }, '', 'from-host'), 'from-host')
    assert.equal(resolveComposerSessionId({ id: 42 }, 'from-prop', 'from-host'), 'from-prop')
  })

  it('只导出派生函数，不留没人用的 default', async () => {
    const mod = await import('./session.js')
    assert.deepEqual(Object.keys(mod).sort(), ['resolveComposerSessionId'])
  })
})

describe('两侧会话标识同源', () => {
  /** 快捷方式（输入框下方）与附件托盘（输入框内侧）必须走同一条派生链。 */
  const SOURCES = [
    { name: 'ComposerQuickShortcuts.jsx', path: resolve(HERE, 'ComposerQuickShortcuts.jsx') },
    { name: 'AttachmentTray.tsx', path: resolve(HERE, '..', 'attachments', 'AttachmentTray.tsx') },
  ]

  it('两侧都调用共享的派生函数，不再各写一份链', async () => {
    for (const source of SOURCES) {
      const text = await readFile(source.path, 'utf8')
      assert.ok(
        text.includes('resolveComposerSessionId'),
        `${source.name} 必须调用共享的会话标识派生函数`,
      )
    }
  })

  it('两侧都不再自造单点默认值（这正是卡槽永不出现的成因）', async () => {
    for (const source of SOURCES) {
      const text = await readFile(source.path, 'utf8')
      assert.ok(
        !/sessionId\s*=\s*'default'/.test(text),
        `${source.name} 不得把 'default' 直接当会话标识（必须经派生链）`,
      )
    }
  })
})
