/**
 * scripts/lib/silent-catch-delta.test.mjs
 * 增量判定核心是纯函数：按 `rule|bodyKey` 计数做差集。
 * 依赖 git 的端到端用例在 scripts/guard-quality-loop.test.mjs（那里已有夹具仓库工具）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { compareHits } from './silent-catch-delta.mjs'
import { scanContent } from '../verify-silent-catch.mjs'

const FILE = 'plugins/demo/src/a.js'

function hitsOf(content) {
  return scanContent(FILE, content).map((hit) => ({ rule: hit.rule, bodyKey: hit.bodyKey, line: hit.line }))
}

test.describe('silent-catch-delta', () => {
  test('同一段代码前后一致 → 零新增', () => {
    const content = 'export function a() {\n  try { run() } catch {}\n}\n'
    assert.deepEqual(compareHits(hitsOf(content), hitsOf(content)), [])
  })

  test('新增一处空 catch → 恰好新增一条', () => {
    const before = 'export function a() {\n  try { run() } catch {}\n}\n'
    const after = 'export function a() {\n  try { run() } catch {}\n  try { run2() } catch {}\n}\n'
    const added = compareHits(hitsOf(before), hitsOf(after))
    assert.equal(added.length, 1)
    assert.equal(added[0].rule, 'SC1')
    assert.deepEqual(compareHits(hitsOf(after), hitsOf(before)), [], '回退不应产生“新增”')
  })

  test('行号漂移不影响判定（键是 catch 体摘要，不是行号）', () => {
    const before = 'export function a() {\n  try { run() } catch {}\n}\n'
    const after = '\n\n\nexport function a() {\n  try { run() } catch {}\n}\n'
    const added = compareHits(hitsOf(before), hitsOf(after))
    assert.deepEqual(added, [])
  })

  test('同形态两处空 catch：只剩一处可抵消，另一处算新增', () => {
    const one = 'export function a() {\n  try { x() } catch {}\n}\n'
    const two = 'export function a() {\n  try { x() } catch {}\n  try { y() } catch {}\n}\n'
    assert.equal(compareHits(hitsOf(one), hitsOf(two)).length, 1)
    assert.equal(compareHits(hitsOf(two), hitsOf(one)).length, 0)
  })

  test('SC3（有语句无痕迹）同样进入差集，交由调用方决定是否拦截', () => {
    const before = 'export function a() {\n  try { run() } catch (error) {}\n}\n'
    const after = 'export function a() {\n  try { run() } catch (error) { return null }\n}\n'
    const added = compareHits(hitsOf(before), hitsOf(after))
    assert.equal(added.length, 1)
    assert.equal(added[0].rule, 'SC3')
  })

  test('同一份内容里空 catch 与有痕迹 catch 不会互相抵消', () => {
    const content = 'export function a() {\n  try { x() } catch {}\n  try { y() } catch (error) { logger.warn(error) }\n}\n'
    const hits = hitsOf(content)
    assert.equal(hits.length, 1)
    assert.equal(hits[0].rule, 'SC1')
  })
})
