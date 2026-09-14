import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getContractIndex,
  loadAdapterProfiles,
} from '../index.js'
import { guardSubmit, mapOpenAiImageSize } from './index.js'

const canonical = 'gpt-image-2.5'
const index = getContractIndex()
const profiles = loadAdapterProfiles()

test('gpt-image-2.5 mapOpenAiImageSize supports 4K alongside 1K and 2K', () => {
  // 1:1 4K ➜ 2048x2048, quality: hd
  assert.deepEqual(mapOpenAiImageSize('1:1', '4K'), { size: '2048x2048', quality: 'hd' })
  // 16:9 4K ➜ 3840x2160, quality: hd
  assert.deepEqual(mapOpenAiImageSize('16:9', '4K'), { size: '3840x2160', quality: 'hd' })
  // 9:16 4K ➜ 2160x3840, quality: hd
  assert.deepEqual(mapOpenAiImageSize('9:16', '4K'), { size: '2160x3840', quality: 'hd' })
  // auto 4K ➜ 3840x2160, quality: hd
  assert.deepEqual(mapOpenAiImageSize('auto', '4K'), { size: '3840x2160', quality: 'hd' })
})

test('gpt-image-2.5 routes 1K and standard 2K to unified gpt-image-2.5 endpoint', () => {
  const t1 = guardSubmit(
    {
      model: canonical,
      operation: 'text_to_image',
      prompt: 'a tranquil lake at dawn',
      aspectRatio: '16:9',
      resolution: '1K',
    },
    { index, seam: 'imageGenerate', outputType: 'image', requireListed: false },
  )
  assert.equal(t1.ok, true, t1.message)
  assert.equal(t1.modelId, 'gpt-image-2.5')
  assert.equal(t1.vendorPayload.size, '1792x1024')
  assert.equal(t1.vendorPayload.quality, 'standard')
  assert.equal('model' in t1.vendorPayload, false, 'model is owned by protocol, not injected in vendorPayload')
  assert.equal('aspect_ratio' in t1.vendorPayload, false, 'aspect_ratio must not leak to vendorPayload')

  const t2 = guardSubmit(
    {
      model: canonical,
      operation: 'text_to_image',
      prompt: 'a tranquil lake at dawn',
      aspectRatio: '1:1',
      resolution: '2K',
      quality: 'standard',
    },
    { index, seam: 'imageGenerate', outputType: 'image', requireListed: false },
  )
  assert.equal(t2.ok, true, t2.message)
  assert.equal(t2.modelId, 'gpt-image-2.5')
  assert.equal(t2.vendorPayload.size, '1024x1024')
  assert.equal(t2.vendorPayload.quality, 'standard')
  assert.equal('aspect_ratio' in t2.vendorPayload, false)
})

test('gpt-image-2.5 natively supports 4K on the unified gpt-image-2.5 endpoint', () => {
  const ratios = [
    { ratio: '16:9', expectedSize: '3840x2160' },
    { ratio: '9:16', expectedSize: '2160x3840' },
    { ratio: '1:1', expectedSize: '2048x2048' },
    { ratio: 'auto', expectedSize: '3840x2160' },
  ]

  for (const { ratio, expectedSize } of ratios) {
    const plan = guardSubmit(
      {
        model: canonical,
        operation: 'text_to_image',
        prompt: 'a crystal clear mountain stream in 4k',
        aspectRatio: ratio,
        resolution: '4K',
      },
      { index, seam: 'imageGenerate', outputType: 'image', requireListed: false },
    )
    assert.equal(plan.ok, true, `Failed for ratio ${ratio}: ${plan.message}`)
    assert.equal(plan.modelId, 'gpt-image-2.5', 'Unified single endpoint; no longer rewritten to HD SKU')
    assert.equal(plan.vendorPayload.size, expectedSize)
    assert.equal(plan.vendorPayload.quality, 'hd')
    assert.equal('model' in plan.vendorPayload, false)
    assert.equal('aspect_ratio' in plan.vendorPayload, false, 'aspect_ratio must not leak to vendor')
  }
})

// 2026-09-14 #1751（评审次要-2）：上游 2026-09-10 变更日志明写「旧 ID 不是兼容别名，也不支持
// gpt-image-2-5 拼写」，与同时撤销的 gpt-image-2-hd / gpt-image2-hd 同源同口径 —— 该拼写不再是
// 别名，guardSubmit 必须按未知型号拒绝，而不是静默改写成统一 gpt-image-2.5。
test('gpt-image-2-5 is not an upstream-recognised spelling: guardSubmit rejects it as unknown', () => {
  for (const resolution of ['1K', '4K']) {
    const plan = guardSubmit(
      {
        model: 'gpt-image-2-5',
        operation: 'text_to_image',
        prompt: `test revoked spelling ${resolution}`,
        resolution,
      },
      { index, seam: 'imageGenerate', outputType: 'image', requireListed: false },
    )
    assert.equal(plan.ok, false, `${resolution}: the revoked spelling must not resolve`)
    assert.equal(plan.code, 'unknown_model', resolution)
    assert.equal(plan.modelId, undefined, resolution)
  }
  // 撤销的落地形态：统一 gpt-image-2.5 端点上不再声明任何别名。
  assert.equal(index.get('gpt-image-2.5')?.aliases, undefined)
  assert.equal(index.get('gpt-image-2-5'), undefined)
})
