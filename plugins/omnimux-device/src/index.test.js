import { test } from 'node:test'
import assert from 'node:assert/strict'
import plugin, { name, inject, apply } from './index.js'

test('omnimux-device exports valid Cordis plugin shape', () => {
  assert.equal(name, 'omnimux-device')
  assert.deepEqual(inject, [])
  assert.equal(typeof apply, 'function')
  assert.equal(plugin.name, 'omnimux-device')
})

test('apply succeeds without throwing on a Proxy context that forbids un-injected access', () => {
  // 模拟 Cordis Context Proxy：访问未 inject 的属性直接抛错
  const forbidden = new Set(['tools', 'timer', 'database'])
  const target = {
    provide: (_name, _impl) => {},
    get: (key) => (key === 'tools' ? undefined : undefined),
    inject: (_deps, _cb) => {},
  }

  const ctx = new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && forbidden.has(prop)) {
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      return Reflect.get(t, prop, receiver)
    }
  })

  // 严格断言：绝不能触发 "cannot get property tools without inject"
  assert.doesNotThrow(() => {
    apply(ctx)
  })
})

test('apply registers tools when tools service is available via ctx.get', () => {
  const registered = []
  const ctx = {
    provide: () => {},
    get: (key) => {
      if (key === 'tools') {
        return {
          register: (tool) => {
            registered.push(tool)
          }
        }
      }
      return undefined
    }
  }

  apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'device_list')
})
