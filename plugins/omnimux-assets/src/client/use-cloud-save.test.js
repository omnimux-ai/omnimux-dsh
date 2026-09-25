import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const saveJs = readFileSync(join(here, 'use-cloud-save.js'), 'utf8')

/**
 * 保存控制器的接线契约。控制器是 React hook，本仓客户端没有渲染器，所以这一层锁的是
 * 「接线」——策略本身的行为由 cloud-save-flight.test.js 实际跑出来（见那份文件）。
 *
 * 这里覆盖三个必答项：重复点击不产生第二次请求、并发模型是「按 id 集合」而不是全局单飞、
 * 失败路径只有一个可见出口且绝不把行标成已保存。
 */
describe('useCloudSave wiring', () => {
  it('short-circuits a repeat click before it reaches the Host', () => {
    assert.match(saveJs, /createCloudSaveFlight\(\)/)
    assert.match(saveJs, /flight\.admit\(id\) !== 'accept'/)
  })

  it('keeps the saving set, not a single id, in flight', () => {
    assert.match(saveJs, /savingIds/)
    assert.doesNotMatch(saveJs, /setSavingId\(/)
    assert.doesNotMatch(saveJs, /\bsavingId\b(?!s)/)
  })

  it('reports every failure on the single sealed notice line and never marks the row saved', () => {
    assert.match(saveJs, /if \(!result\.ok\) \{[\s\S]*?setNotice\(t\('error\.saveFailed'\)\)/)
    assert.match(saveJs, /catch \(caught\) \{[\s\S]*?setNotice\(t\('error\.saveFailed'\)\)/)
    // 宿主 message / 错误码 / 异常文本只进控制台，绝不进通知条。
    assert.doesNotMatch(saveJs, /setNotice\(String\(result\.error\)\)/)
    assert.doesNotMatch(saveJs, /errText/)
    // 只有成功分支写 ok = true，settle 按它落库。
    assert.match(saveJs, /let ok = false/)
    assert.match(saveJs, /ok = true/)
    assert.match(saveJs, /flight\.settle\(id, ok\)/)
  })

  it('drops the stale savedRef mirror', () => {
    assert.doesNotMatch(saveJs, /savedRef/)
    assert.doesNotMatch(saveJs, /inFlightRef/)
  })
})
