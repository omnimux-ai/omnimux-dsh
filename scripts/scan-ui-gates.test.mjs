/**
 * scripts/scan-ui-gates.test.mjs
 * Test Suite for Static UI Gate Scanner (scripts/scan-ui-gates.mjs)
 * Contract: docs/system_design.md (T04), design.md (L1)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCANNER_PATH = join(__dirname, 'scan-ui-gates.mjs')

describe('Static UI Gate Scanner (scan-ui-gates.mjs)', () => {
  it('当前仓库全量客户端代码扫描通过（Exit Code 0，0 严重违规）', () => {
    const res = spawnSync('node', [SCANNER_PATH], {
      encoding: 'utf8',
      cwd: join(__dirname, '..'),
    })
    assert.equal(res.status, 0, `扫描器应该正常通过，输出: ${res.stdout}\n错误: ${res.stderr}`)
    assert.ok(res.stdout.includes('0 违规拦截'), '应输出 0 违规拦截')
  })
})
