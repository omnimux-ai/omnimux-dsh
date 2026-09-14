/**
 * 回归锁（防回归锁，不是功能测试）：网关在售存疑的 4 个模型 id 不可被调用。
 *
 * 对象：pixverse-v6 / vidu-q3 / qwen-image-3-0 / grok-imagine-video
 * 来源：网关在售存疑清单（Issue #1678；审查报告 tmp/contract-round2/REMOVAL_AUDIT.md）。
 *
 * 这 4 个 id 在契约索引中完全不存在（无 spec 行、无 alias、无 disposition、无渠道分组），
 * 因此全部被 Hub SubmitGuard 在 admitModel 处 fail-closed 拒绝（unknown_model）。
 * 本文件把这条边界钉成可执行断言：一旦有人把它们登记成 spec 行 / alias，或让
 * route 层认下它们，测试必须变红——这是防回归锁，不是功能测试。
 * 全部断言离线，不触网、不发真实模型请求。
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { getContractIndex } from '../catalog/contract/index.js'
import { GUARD_CODES, guardSubmit } from '../catalog/contract/submit-guard/index.js'
import {
  PRODUCT_ID_ALIASES,
  gatewayCandidates,
  getModelChannelGroups,
  resolveChannelPlan,
  toProductId,
} from '../catalog/serving/id-universe.js'
import { OmnimuxError } from './errors.js'
import { executeOmnimuxMedia } from './execute.js'

/** Models whose gateway on-sale status is disputed (#1678) and must stay uncallable. */
const RESTRICTED_MODEL_IDS = Object.freeze([
  'pixverse-v6',
  'vidu-q3',
  'qwen-image-3-0',
  'grok-imagine-video',
])

/** Capability → the submit path a caller would use for it. */
const CAPABILITIES = Object.freeze({
  video: { operation: 'text_to_video', seam: 'videoGenerate', envKey: 'OMNIMUX_VIDEO_MODEL' },
  image: { operation: 'text_to_image', seam: 'imageGenerate', envKey: 'OMNIMUX_IMAGE_MODEL' },
})

const index = getContractIndex()

describe('restricted models stay outside the product id universe', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    it(`keeps ${id} unnormalized and unaliased`, () => {
      assert.equal(toProductId(id), id)
      assert.deepEqual(gatewayCandidates(id), [id])
      assert.equal(Object.hasOwn(PRODUCT_ID_ALIASES, id), false)
    })
  }
})

describe('restricted models have no channel pool', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    it(`reports no channel group for ${id}`, () => {
      assert.deepEqual(getModelChannelGroups(id), [])
      const plan = resolveChannelPlan(id, { group: 'any' })
      assert.ok(
        plan.candidates.every((candidate) => !candidate.includes('@')),
        `${id} must not gain a routable ${id}@group candidate`,
      )
      assert.deepEqual(plan.candidates, [id])
    })
  }
})

describe('SubmitGuard rejects restricted models per capability', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    for (const [capability, { operation, seam }] of Object.entries(CAPABILITIES)) {
      it(`rejects ${id} as ${capability} at admission`, () => {
        const result = guardSubmit(
          { prompt: 'a blue ceramic cup', model: id, operation },
          { index, seam, capability, outputType: capability },
        )
        assert.equal(result.ok, false)
        assert.equal(result.code, GUARD_CODES.UNKNOWN_MODEL)
      })
    }
  }
})

describe('restricted models never reach the network end to end', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    for (const [capability, { operation, envKey }] of Object.entries(CAPABILITIES)) {
      it(`rejects ${id} injected as ${envKey} without any gateway call`, async (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'omnimux-restricted-'))
        t.after(() => rmSync(dir, { recursive: true, force: true }))
        const dest = join(dir, 'out.bin')
        let fetchCalls = 0

        await assert.rejects(
          () => executeOmnimuxMedia(capability, {
            prompt: 'a blue ceramic cup',
            operation,
            dest,
            wait: false,
            env: { OMNIMUX_API_KEY: 'sk-fake', [envKey]: id },
            fetcher: async () => {
              fetchCalls += 1
              throw new Error('a restricted model must never reach the network')
            },
          }),
          (error) => {
            assert.ok(error instanceof OmnimuxError)
            assert.equal(error.code, 'omnimux-invalid-request')
            assert.equal(error.details?.guardCode, GUARD_CODES.UNKNOWN_MODEL)
            return true
          },
        )

        assert.equal(fetchCalls, 0)
        assert.equal(existsSync(dest), false)
      })
    }
  }
})
