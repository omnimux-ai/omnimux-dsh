/**
 * scripts/guard-ui11-composer-width.test.mjs
 * Test UI11 680px composer width anti-tamper gate in guard-ui-design.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './guard-ui-design.mjs'

describe('PreToolUse UI11 Composer Width Guard', () => {
  it('UI11: 拦截试图将输入框写为 780px、952px 或 100% 的篡改操作', () => {
    const targetStyles = 'plugins/omnimux/src/client/session-guide/styles.js'
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      tool_input: {
        file_path: targetStyles,
        old_string: 'max-width:min(680px, calc(100% - 24px))!important;',
        new_string: 'max-width:min(780px, calc(100% - 24px))!important;',
      },
    })
    const result = handle(payload)
    const out = result.hookSpecificOutput

    assert.equal(out.permissionDecision, 'deny')
    assert.ok(out.permissionReason.includes('UI11'), '应包含 UI11 规则码')
    assert.ok(out.permissionReason.includes('680px'), '应提示 680px 紧凑黄金宽度')
  })

  it('UI11: 拦截试图修改 useComposerDocking 中 DOCK_MAX_WIDTH 为非 680 的操作', () => {
    const targetDocking = 'plugins/omnimux/src/client/session-guide/useComposerDocking.js'
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      tool_input: {
        file_path: targetDocking,
        old_string: 'export const DOCK_MAX_WIDTH = 680',
        new_string: 'export const DOCK_MAX_WIDTH = 952',
      },
    })
    const result = handle(payload)
    const out = result.hookSpecificOutput

    assert.equal(out.permissionDecision, 'deny')
    assert.ok(out.permissionReason.includes('UI11'), '应包含 UI11 规则码')
  })

  it('UI11: 合规的 680px 声明放行', () => {
    const targetStyles = 'plugins/omnimux/src/client/session-guide/styles.js'
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      tool_input: {
        file_path: targetStyles,
        old_string: '/* 旧注释 */',
        new_string: '/* 新注释：保持 680px 紧凑宽度 */',
      },
    })
    const result = handle(payload)
    assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
  })
})
