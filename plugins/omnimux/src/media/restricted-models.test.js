/**
 * 回归锁：在售存疑的 pixverse-v6 / vidu-q3 / qwen-image-3-0 /
 * grok-imagine-video 不得进入执行候选或通过 SubmitGuard。
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

const RESTRICTED_MODEL_IDS = Object.freeze([
  'pixverse-v6',
  'vidu-q3',
  'qwen-image-3-0',
  'grok-imagine-video',
])
const CAPABILITIES = Object.freeze({
  video: { operation: 'text_to_video', seam: 'videoGenerate', envKey: 'OMNIMUX_VIDEO_MODEL' },
  image: { operation: 'text_to_image', seam: 'imageGenerate', envKey: 'OMNIMUX_IMAGE_MODEL' },
})
const index = getContractIndex()

describe('restricted models stay outside the product id universe', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    it('keeps the restricted id unnormalized and unaliased', () => {
      assert.equal(toProductId(id), id, id)
      assert.deepEqual(gatewayCandidates(id), [id], id)
      assert.equal(Object.hasOwn(PRODUCT_ID_ALIASES, id), false, id)
    })
  }
})

describe('restricted models have no channel pool', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    it('reports no channel group or executable candidate', () => {
      assert.deepEqual(getModelChannelGroups(id), [], id)
      const plan = resolveChannelPlan(id, { group: 'any' })
      assert.ok(plan.candidates.every((candidate) => !candidate.includes('@')), id)
      assert.deepEqual(plan.candidates, [], id)
      assert.deepEqual(plan.unresolvedGroups, ['any'], id)
      assert.deepEqual(resolveChannelPlan(id).candidates, [], id)
    })
  }
})

describe('SubmitGuard rejects restricted models per capability', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    for (const [capability, { operation, seam }] of Object.entries(CAPABILITIES)) {
      it('rejects the restricted id at capability admission', () => {
        const result = guardSubmit(
          { prompt: 'a blue ceramic cup', model: id, operation },
          { index, seam, capability, outputType: capability },
        )
        assert.equal(result.ok, false, `${id}/${capability}`)
        assert.equal(result.code, GUARD_CODES.UNKNOWN_MODEL, `${id}/${capability}`)
      })
    }
  }
})

describe('restricted models never reach the network end to end', () => {
  for (const id of RESTRICTED_MODEL_IDS) {
    for (const [capability, { operation, envKey }] of Object.entries(CAPABILITIES)) {
      it('rejects the restricted environment model without any gateway call', async (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'omnimux-restricted-'))
        t.after(() => rmSync(dir, { recursive: true, force: true }))
        const dest = join(dir, 'out.bin')
        let fetchCalls = 0
        const env = capability === 'video'
          ? { OMNIMUX_API_KEY: 'sk-fake', OMNIMUX_VIDEO_MODEL: id }
          : { OMNIMUX_API_KEY: 'sk-fake', OMNIMUX_IMAGE_MODEL: id }
        await assert.rejects(
          () => executeOmnimuxMedia(capability, {
            prompt: 'a blue ceramic cup',
            operation,
            dest,
            wait: false,
            env,
            fetcher: async () => {
              fetchCalls += 1
              throw new Error('a restricted model must never reach the network')
            },
          }),
          (error) => {
            assert.ok(error instanceof OmnimuxError)
            assert.equal(error.code, 'omnimux-invalid-request', `${id}/${envKey}`)
            assert.equal(error.details?.guardCode, GUARD_CODES.UNKNOWN_MODEL, id)
            return true
          },
        )
        assert.equal(fetchCalls, 0, `${id}/${envKey}`)
        assert.equal(existsSync(dest), false, id)
      })
    }
  }
})
