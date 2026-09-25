import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCloudSaveFlight } from './cloud-save-flight.js'

/**
 * 保存飞行的行为契约：按 asset id 单飞（C1）、不同 id 互不阻塞（C2）、
 * 已保存短路（C4）、失败可重试（C9），以及 savedIds ∩ savingIds = ∅ 的不变量（C5）。
 *
 * 这一组是行为断言而不是源码断言——策略被提成纯模块（见 cloud-save-flight.js），
 * 正是为了能在这里真的把并发交错跑一遍。
 */
describe('createCloudSaveFlight', () => {
  it('admits one save per asset id and drops the repeat', () => {
    const flight = createCloudSaveFlight()
    assert.equal(flight.admit('a'), 'accept')
    assert.equal(flight.admit('a'), 'in-flight')
    assert.equal(flight.savingIds.size, 1)
  })

  it('lets a second card start while the first is in flight', () => {
    const flight = createCloudSaveFlight()
    assert.equal(flight.admit('a'), 'accept')
    assert.equal(flight.admit('b'), 'accept')
    assert.equal(flight.savingIds.size, 2)
  })

  it('reports a saved row instead of saving it twice', () => {
    const flight = createCloudSaveFlight()
    assert.equal(flight.admit('a'), 'accept')
    flight.settle('a', true)
    assert.equal(flight.admit('a'), 'saved')
    assert.equal(flight.savingIds.size, 0)
  })

  it('lets a failed save be retried', () => {
    const flight = createCloudSaveFlight()
    assert.equal(flight.admit('a'), 'accept')
    flight.settle('a', false)
    assert.equal(flight.savedIds.has('a'), false)
    assert.equal(flight.admit('a'), 'accept')
  })

  it('refuses a row with no id', () => {
    const flight = createCloudSaveFlight()
    assert.equal(flight.admit(''), 'invalid')
    assert.equal(flight.savingIds.size, 0)
  })

  it('never holds one id in both sets', () => {
    const flight = createCloudSaveFlight()
    for (const id of ['a', 'b', 'c']) assert.equal(flight.admit(id), 'accept')
    // 交错结算：一个成功、一个失败、一个仍在途，随后成功的那个再被点一次。
    flight.settle('a', true)
    flight.settle('b', false)
    assert.equal(flight.admit('a'), 'saved')
    assert.equal(flight.admit('b'), 'accept')
    assert.equal([...flight.savingIds].every((id) => !flight.savedIds.has(id)), true)
    assert.deepEqual([...flight.savedIds], ['a'])
    assert.deepEqual([...flight.savingIds].sort(), ['b', 'c'])

    flight.reset()
    assert.equal(flight.savedIds.size, 0)
    assert.equal(flight.savingIds.size, 0)
    assert.equal(flight.admit('a'), 'accept')
  })
})
