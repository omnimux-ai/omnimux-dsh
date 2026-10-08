import assert from 'node:assert/strict'
import test from 'node:test'
import { checkParameterMember, evaluateDeclaredParameters } from '../src/index.js'
import * as packaged from '../../../plugins/omnimux/lib/generation-core.js'
const checkSourceMember = checkParameterMember

test('canonical request rejects unknown fields while legacy preserves absent disabled defaults', () => {
  assert.deepEqual(evaluateDeclaredParameters({ unknown: 0 }, {}), {
    ok: false, field: 'unknown', source: 'request', result: { status: 'nonmember', reason: 'unknown_field' },
  })
  assert.deepEqual(evaluateDeclaredParameters({}, { watermark: { supported: false, defaultValue: false } }, undefined, { mode: 'legacyGuard' }), { ok: true, values: { watermark: false } })
  assert.equal(checkParameterMember({ supported: false }, false).status, 'nonmember')
})

test('structure cannot be washed by an option or an unknown semantic constraint', () => {
  for (const definition of [
    { options: [5], range: { step: 0 } }, { options: [5], range: { min: '4' } },
    { options: [5], range: { min: 10, max: 1 } }, { options: [5, 5] },
    { options: [5], multipleOf: 2 }, { defaultValue: undefined },
  ]) assert.deepEqual(checkParameterMember(definition, 5), { status: 'indeterminate', diagnostic: 'malformed_definition' })
  assert.equal(checkParameterMember({ options: [5], description: 'metadata' }, 5).status, 'member')
})

test('every own definition and range constraint is checked before an option witness', () => {
  for (const checkParameterMember of [packaged.checkParameterMember, checkSourceMember]) for (const key of ['multipleOf', Symbol('multipleOf')]) {
    for (const definition of [
      Object.defineProperty({ options: [5] }, key, { value: 2 }),
      { options: [5], range: Object.defineProperty({ min: 0 }, key, { value: 2 }) },
    ]) assert.deepEqual(checkParameterMember(definition, 5), { status: 'indeterminate', diagnostic: 'malformed_definition' })
  }
  for (const key of ['multipleOf', Symbol('multipleOf')]) {
    const definition = Object.defineProperty({ supported: false, defaultValue: false }, key, { value: 2 })
    for (const evaluate of [evaluateDeclaredParameters, packaged.evaluateDeclaredParameters]) {
      assert.deepEqual(evaluate({}, { disabled: definition }, undefined, { mode: 'legacyGuard' }), {
        ok: false, field: 'disabled', source: 'default',
        result: { status: 'indeterminate', diagnostic: 'malformed_definition' },
      })
    }
  }
  const definition = Object.defineProperties({ options: [5] }, {
    type: { value: 'integer' }, description: { value: 'metadata' },
    range: { value: Object.defineProperty({}, 'min', { value: 0 }) },
  })
  assert.deepEqual(checkParameterMember(definition, 5), { status: 'member' })
})

test('declared special names preserve own values and ordinary output prototype', () => {
  for (const evaluate of [evaluateDeclaredParameters, packaged.evaluateDeclaredParameters]) {
    for (const value of [5, null, 'typed']) for (const source of ['request', 'default']) {
      const request = JSON.parse(source === 'request' ? JSON.stringify({ ['__proto__']: value }) : '{}')
      const definitions = JSON.parse(JSON.stringify({ ['__proto__']: {
        ...(value === 'typed' ? { type: 'string' } : { options: [5, null] }),
        ...(source === 'default' ? { defaultValue: value } : {}),
      }, constructor: { defaultValue: 'constructor' }, toString: { defaultValue: false } }))
      const before = JSON.stringify({ request, definitions })
      const result = evaluate(request, definitions)
      assert.equal(result.ok, true)
      assert.equal(Object.getPrototypeOf(result.values), Object.prototype)
      assert.deepEqual(Object.keys(result.values), ['__proto__', 'constructor', 'toString'])
      assert.deepEqual(Object.getOwnPropertyDescriptor(result.values, '__proto__'), {
        value, enumerable: true, writable: true, configurable: true,
      })
      assert.deepEqual(JSON.parse(JSON.stringify(result.values)), JSON.parse(JSON.stringify({
        ['__proto__']: value, constructor: 'constructor', toString: false,
      })))
      assert.equal(JSON.stringify({ request, definitions }), before)
    }
  }
})

test('shortest decimal near-grid residuals, strict bounds and precision budgets', () => {
  const grid = (value, min, step, status, max) => {
    const definition = { range: { min, step, ...(max === undefined ? {} : { max }) } }
    const before = structuredClone(definition)
    assert.equal(checkParameterMember(definition, value).status, status, `${value}/${min}/${step}`)
    assert.deepEqual(definition, before)
  }
  grid(.3, .1, .1, 'member')
  grid(.1 + .2, .1, .1, 'member')
  grid(.31, .1, .1, 'nonmember')
  grid(.1 + .2, .1, .1, 'nonmember', .3)
  grid(2 ** 48 + .25, 0, 1, 'indeterminate')
  grid(8.5, -(2 ** 52), 64, 'nonmember')
  grid(Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, 'indeterminate')
  grid(2 ** 55, 2 ** 55 - 8, 8, 'nonmember')
  grid(Number.MIN_VALUE, 0, Number.MIN_VALUE, 'member')
  grid(-0, 0, .1, 'member')
  grid(1000000000000000100, 1000000000000000100, 1, 'member')
  grid(2 ** 47 - 1, 0, 1, 'member')
  grid(2 ** 47, 0, 1, 'indeterminate')
  grid(1, 0, 2 ** 49, 'member')
  grid(2, 0, 2 ** 49, 'nonmember')
  assert.equal(checkParameterMember({ range: { step: 1 } }, 5).status, 'indeterminate')
  assert.equal(checkParameterMember({ options: [Number.MAX_VALUE], range: { min: 0, step: Number.MIN_VALUE } }, Number.MAX_VALUE).status, 'member')
})

test('independent bounded integer/tick oracle covers signs, scales and nonmembers', () => {
  let members = 0, nonmembers = 0
  // Integer ticks divided by fixed scales are independent of native string parsing.
  for (const scale of [1, 10, 100, 10000000]) for (const origin of [-1000, -10, 0, 10, 1000]) {
    for (const stride of [1, 2, 5, 64]) for (let n = 0; n <= 32; n += 1) {
      const min = origin / scale, step = stride / scale
      for (const offset of [0, .25, .5]) {
        const value = (origin + (n + offset) * stride) / scale
        const expected = offset === 0 ? 'member' : 'nonmember'
        assert.equal(checkParameterMember({ range: { min, step } }, value).status, expected, `${origin}/${stride}/${scale}/${n}/${offset}`)
        if (expected === 'member') members += 1; else nonmembers += 1
      }
    }
  }
  assert.equal(members, 2640); assert.equal(nonmembers, 5280)
  console.log(`independent tick oracle: caseCount=${members + nonmembers}, member=${members}, nonmember=${nonmembers}; signs=-/0/+, scales=1/10/100/1e7`)
})

test('options OR range still obeys type, flags, primitive and codepoint constraints', () => {
  const def = { options: [-1, 5], range: { min: 4, max: 30, step: 2 } }
  for (const value of [-1, 5, 6]) assert.equal(checkParameterMember(def, value).status, 'member')
  assert.equal(checkParameterMember(def, 7).status, 'nonmember')
  assert.equal(checkParameterMember({ ...def, type: 'integer', options: [5.5] }, 5.5).status, 'nonmember')
  assert.equal(checkParameterMember({ range: { min: 4, step: 2 }, allowAuto: true }, -1).status, 'member')
  assert.equal(checkParameterMember({ options: ['auto'], range: { min: 4, step: 2 } }, 'auto').status, 'member')
  assert.equal(checkParameterMember({ options: [null] }, null).status, 'member')
  assert.equal(checkParameterMember({}, null).status, 'nonmember')
  assert.equal(checkParameterMember({ options: [] }, 5).status, 'nonmember')
  assert.equal(checkParameterMember({ range: {} }, 5).status, 'member')
  for (const value of [[], {}, NaN, Infinity, '5']) assert.equal(checkParameterMember({ range: {} }, value).status, 'nonmember')
  assert.equal(checkParameterMember({ type: 'integer' }, Number.MAX_SAFE_INTEGER + 1).status, 'nonmember')
  assert.equal(checkParameterMember({ type: 'custom' }, 5).status, 'nonmember')
  assert.equal(checkParameterMember({ supported: true }, 0).status, 'nonmember')
  assert.equal(checkParameterMember({ supported: true }, false).status, 'member')
  assert.equal(checkParameterMember({ minLength: 1, maxLength: 2 }, '👩😀').status, 'member')
  assert.equal(checkParameterMember({ maxLength: 1 }, '👩😀').status, 'nonmember')
  assert.equal(checkParameterMember({ minLength: 1 }, 5).status, 'nonmember')
  assert.equal(checkParameterMember({ minLength: 0 }, '').status, 'indeterminate')
  assert.equal(checkParameterMember({ options: ['HD'], caseInsensitive: true }, 'hd').status, 'member')
  assert.equal(checkParameterMember({ options: ['HD'] }, 'hd').status, 'nonmember')
  assert.equal(checkParameterMember({ optionsFrom: 'future' }, 'x').status, 'indeterminate')
  assert.equal(checkParameterMember({ optionsFrom: 'future', range: { min: 0 } }, 1).status, 'member')
  assert.equal(checkParameterMember({ optionsFrom: 'future', options: ['known'] }, 'known').status, 'member')
})

test('declared evaluation retains values, whole-field override and default diagnostic source', () => {
  const defs = { n: { type: 'integer', defaultValue: 5 }, sound: { supported: true, defaultValue: true }, text: { type: 'string', defaultValue: 'default' } }
  const request = { n: 0, sound: false, text: '' }; const before = structuredClone(request)
  assert.deepEqual(evaluateDeclaredParameters(request, defs), { ok: true, values: request })
  assert.deepEqual(request, before)
  assert.deepEqual(evaluateDeclaredParameters({ text: null }, defs, undefined, { mode: 'legacyGuard' }), { ok: true, values: { n: 5, sound: true, text: 'default' } })
  assert.equal(evaluateDeclaredParameters({ text: null }, defs).ok, false)
  assert.deepEqual(evaluateDeclaredParameters({}, { n: { type: 'integer' } }, { n: { defaultValue: 9 } }), { ok: true, values: {} })
  for (const definition of [{ defaultValue: undefined }, { optionsFrom: 'future', defaultValue: 'x' }, { range: { min: 0, step: 2 }, defaultValue: 3 }]) {
    const result = evaluateDeclaredParameters({}, { n: definition })
    assert.equal(result.ok, false); assert.equal(result.field, 'n'); assert.equal(result.source, 'default')
  }
  assert.equal(evaluateDeclaredParameters({ n: undefined }, defs).values.n, 5)
  for (const bad of [null, [], 'canonical', 1, { mode: 'unknown' }, { mode: 'canonical', extra: true }]) {
    assert.throws(() => checkParameterMember({}, 1, bad), TypeError)
    assert.throws(() => evaluateDeclaredParameters({}, {}, undefined, bad), TypeError)
  }
  assert.equal(checkParameterMember({}, 1, {}).status, 'member')
})

test('policy rejects every own extra key, including nonenumerable and symbol keys', () => {
  for (const policy of [Object.defineProperty({}, 'extra', { value: 1 }), { [Symbol('extra')]: true }]) {
    assert.throws(() => checkParameterMember({}, 1, policy), TypeError)
    assert.throws(() => evaluateDeclaredParameters({}, {}, undefined, policy), TypeError)
  }
})

test('legacy explanation differs from canonical without changing compound membership', () => {
  for (const check of [checkParameterMember, packaged.checkParameterMember]) {
    const definition = { type: 'integer', options: [1, 2] }
    assert.deepEqual(check(definition, 1.5), { status: 'nonmember', reason: 'integer' })
    assert.deepEqual(check(definition, 1.5, { mode: 'legacyGuard' }), { status: 'nonmember', reason: 'domain' })
    for (const policy of [{ mode: 'canonical' }, { mode: 'legacyGuard' }]) {
      assert.deepEqual(check({ type: 'integer', options: [1.5] }, 1.5, policy), { status: 'nonmember', reason: 'integer' })
      assert.deepEqual(check({ ...definition, range: { min: 0, max: 2 } }, 1.5, policy), { status: 'nonmember', reason: 'integer' })
      assert.deepEqual(check({ optionsFrom: 'future', options: ['known'] }, 'x', policy), { status: 'indeterminate', diagnostic: 'unresolved_options' })
      assert.deepEqual(check({ options: [5], range: { min: 0 }, allowAuto: true }, -1, policy), { status: 'member' })
    }
  }
})

test('negative zero shares the zero option identity and cannot duplicate a domain value', () => {
  assert.equal(checkParameterMember({ options: [0] }, -0).status, 'member')
  assert.equal(checkParameterMember({ options: [0, -0] }, 0).status, 'indeterminate')
})
