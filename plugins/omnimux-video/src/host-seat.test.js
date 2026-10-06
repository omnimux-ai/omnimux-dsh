import test from 'node:test'
import assert from 'node:assert/strict'
import { readSeat } from './host-seat.js'

/**
 * A Host-like context: `get(name)` answers from `seats`, and reading any other
 * property throws the same way the real Host guards undeclared services.
 */
function guardedCtx(seats = {}, { getterThrows = false } = {}) {
  const known = new Set(['get', 'inject', 'logger', 'on', 'effect', 'tools', 'textComplete'])
  return new Proxy(
    {
      get(name) {
        if (getterThrows) throw new Error('seat read failed')
        return seats[name]
      },
    },
    {
      get(target, prop) {
        if (typeof prop === 'symbol') return Reflect.get(target, prop)
        if (prop in target || known.has(prop)) return Reflect.get(target, prop)
        throw new Error(`cannot get property "${String(prop)}" without inject`)
      },
    },
  )
}

test('host guard: undeclared service property read throws (the defect this module avoids)', () => {
  const ctx = guardedCtx()
  assert.throws(() => ctx.videoGenerate, /without inject/)
})

test('readSeat returns undefined instead of throwing when the Host guards the property', () => {
  const ctx = guardedCtx()
  assert.equal(readSeat(ctx, 'videoGenerate'), undefined)
})

test('readSeat returns the seat when the Host provides it', () => {
  const seam = { execute: async () => ({ mode: 'live' }) }
  const ctx = guardedCtx({ videoGenerate: seam })
  assert.equal(readSeat(ctx, 'videoGenerate'), seam)
})

test('readSeat treats a missing accessor as not provided', () => {
  assert.equal(readSeat({}, 'videoGenerate'), undefined)
})

test('readSeat treats a throwing accessor as not provided', () => {
  const ctx = guardedCtx({}, { getterThrows: true })
  assert.equal(readSeat(ctx, 'videoGenerate'), undefined)
})

test('readSeat tolerates a non-object context', () => {
  assert.equal(readSeat(undefined, 'videoGenerate'), undefined)
  assert.equal(readSeat(null, 'videoGenerate'), undefined)
})
