/**
 * Issue #4110 — 注入消息必须能通过宿主 session-format v4 的 source 准入。
 *
 * 这是一条**端到端**用例：不比对字段值，而是把注入工厂产出的消息交给宿主自己发布的
 * v4 校验/编码路径，证明它们会被接纳；同时用同一条路径证明旧的 catch-all
 * `kind: 'plugin'` 会被拒绝（这就是用户看到的
 * `format v4 message requires a producer-owned source kind`）。
 *
 * 说明：rc.3 没有从包根导出 `assertV4MessageSources`（它是
 * `assertReleasedV4Relationships` 内部调用的模块内函数），因此这里走公开的
 * `assertV4RowAdmission` 与 `releasedV4SessionFormatCodec.encodeEvent` —— 两者与
 * `assertV4MessageSources` 共用同一段 `source()` 准入逻辑。
 *
 * 注意范围：公开的行准入只看 `kind === 'plugin'`；真正的「kind 缺失」判定在
 * `assertReleasedV4Relationships` 内部，需要一份完整 artifact 才能触达。本包的两个
 * 注入源永远写显式 kind，故本用例锁定「旧 catch-all 必被拒绝 + 新 kind 必被接纳」。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertV4RowAdmission,
  releasedV4SessionFormatCodec,
} from '@deepseek-ai/dsh-session-format-v3-to-v4'
import { WORKBENCH_SOURCE_KIND } from '../message-source.js'
import { createSessionModelMessage } from './context-injector.js'
import { createWorkbenchContextMessage } from '../workbench/context-injector.js'

const PRODUCTION_ERROR = /producer-owned source kind/

/** 把注入消息包装成宿主 v4 事件（user/message 的 data 就是消息本体）。 */
function asV4Event(message, seq = 1) {
  return { type: 'user/message', seq, time: 1_700_000_000_000 + seq, data: message }
}

/** 旧形状：rc.3 之前的 catch-all，仅作反例夹具。 */
function legacyPluginKindMessage(message) {
  return {
    ...message,
    source: { ...message.source, kind: 'plugin' },
  }
}

const factories = [
  ['session model pin', createSessionModelMessage, 'omnimux-session-model', 'omnimux'],
  ['workbench viewport', createWorkbenchContextMessage, WORKBENCH_SOURCE_KIND, 'omnimux-workbench'],
]

describe('injected context messages pass host session-format v4 admission (#4110)', () => {
  for (const [label, factory, expectedKind, expectedPlugin] of factories) {
    it(`${label}: source kind 是 producer-owned，且被 v4 行准入接纳`, () => {
      const message = factory('context text for harness')
      assert.equal(message.source.kind, expectedKind)
      assert.equal(message.source.plugin, expectedPlugin)
      // 其余字段原样保留（下游按 sections 折叠成 context 块）
      assert.equal(message.source.form, 'snapshot')
      assert.ok(Array.isArray(message.source.sections) && message.source.sections.length > 0)

      assert.doesNotThrow(() => assertV4RowAdmission(asV4Event(message)))
    })

    it(`${label}: 被 v4 编解码器真正编码（不是只断言字段）`, () => {
      const message = factory('context text for harness')
      const encoded = releasedV4SessionFormatCodec.encodeEvent(asV4Event(message))
      assert.equal(encoded.type, 'user/message')
      assert.equal(encoded.data.source.kind, expectedKind)
      assert.equal(encoded.data.source.plugin, expectedPlugin)
      assert.deepEqual(encoded.data.source.sections, message.source.sections)
    })

    it(`${label}: 旧 catch-all kind 'plugin' 会被宿主拒绝（复现用户报错）`, () => {
      const legacy = legacyPluginKindMessage(factory('context text for harness'))
      assert.throws(() => assertV4RowAdmission(asV4Event(legacy)), PRODUCTION_ERROR)
      assert.throws(
        () => releasedV4SessionFormatCodec.encodeEvent(asV4Event(legacy)),
        PRODUCTION_ERROR,
      )
    })
  }
})
