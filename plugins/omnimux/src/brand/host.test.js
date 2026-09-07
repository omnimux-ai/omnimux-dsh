import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { BOOT_WINDOW_KEY } from './defaults.js'

describe('host brand boot', () => {
  it('taps index HTML with the brand boot payload when webServer is present', () => {
    const taps = []
    const ctx = {
      inject(deps, callback) {
        if (deps.includes('connection') || deps.includes('commands')) return
        callback({
          webServer: {
            register() {},
            tapIndex(fn) {
              taps.push(fn)
              return () => {}
            },
          },
          effect(factory) {
            return factory()
          },
          get() {
            return undefined
          },
        })
      },
      effect() {},
      get() {
        return undefined
      },
      provide() {},
      tools: { register() {} },
    }
    apply(ctx, { productName: 'OmniMux' })
    assert.equal(taps.length, 1)
    const html = taps[0]('<html><body><div id="root"></div></body></html>')
    assert.match(html, new RegExp(`window\\.${BOOT_WINDOW_KEY}=`))
    assert.match(html, /"productName":"OmniMux"/)
  })
})
