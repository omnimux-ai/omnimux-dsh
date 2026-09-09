import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getContractIndex,
  loadAdapterProfiles,
  verifyNoConcretePixels,
  verifyParameterDispatchClosure,
} from '../index.js'
import { guardSubmit, mapOpenAiImageSize } from './index.js'
import { mapOmnimuxInput } from '../../../media/vendors/omnimux.js'

const canonical = 'gpt-image-2'
const index = getContractIndex()
const profiles = loadAdapterProfiles()

test('mapOpenAiImageSize matrix verification', () => {
  // 1:1 + 1K ➜ 1024x1024
  assert.deepEqual(mapOpenAiImageSize('1:1', '1K'), { size: '1024x1024' })
  // 1:1 + 2K ➜ 1024x1024, quality: hd
  assert.deepEqual(mapOpenAiImageSize('1:1', '2K'), { size: '1024x1024', quality: 'hd' })

  // 16:9 + 1K/2K ➜ 1792x1024
  assert.deepEqual(mapOpenAiImageSize('16:9', '1K'), { size: '1792x1024' })
  assert.deepEqual(mapOpenAiImageSize('16:9', '2K'), { size: '1792x1024' })

  // 9:16 + 1K/2K ➜ 1024x1792 (critical!)
  assert.deepEqual(mapOpenAiImageSize('9:16', '1K'), { size: '1024x1792' })
  assert.deepEqual(mapOpenAiImageSize('9:16', '2K'), { size: '1024x1792' })

  // 横屏聚类 (4:3, 21:9) ➜ 1792x1024
  assert.deepEqual(mapOpenAiImageSize('4:3', '1K'), { size: '1792x1024' })
  assert.deepEqual(mapOpenAiImageSize('21:9', '2K'), { size: '1792x1024' })

  // 竖屏聚类 (3:4, 2:3) ➜ 1024x1792
  assert.deepEqual(mapOpenAiImageSize('3:4', '1K'), { size: '1024x1792' })
  assert.deepEqual(mapOpenAiImageSize('2:3', '2K'), { size: '1024x1792' })

  // auto ➜ 1792x1024
  assert.deepEqual(mapOpenAiImageSize('auto', '2K'), { size: '1792x1024' })
})

test('gpt-image-2 guardSubmit maps size & quality across aspect ratios and resolutions', () => {
  const testCases = [
    {
      aspectRatio: '9:16',
      resolution: '1K',
      expectedSize: '1024x1792',
      expectedQuality: 'standard',
    },
    {
      aspectRatio: '9:16',
      resolution: '2K',
      expectedSize: '1024x1792',
      expectedQuality: 'standard',
    },
    {
      aspectRatio: '16:9',
      resolution: '1K',
      expectedSize: '1792x1024',
      expectedQuality: 'standard',
    },
    {
      aspectRatio: '16:9',
      resolution: '2K',
      expectedSize: '1792x1024',
      expectedQuality: 'standard',
    },
    {
      aspectRatio: '1:1',
      resolution: '1K',
      expectedSize: '1024x1024',
      expectedQuality: 'standard',
    },
    {
      aspectRatio: '1:1',
      resolution: '2K',
      expectedSize: '1024x1024',
      expectedQuality: 'hd',
    },
    {
      aspectRatio: 'auto',
      resolution: '2K',
      expectedSize: '1792x1024',
      expectedQuality: 'standard',
    },
  ]

  for (const tc of testCases) {
    const plan = guardSubmit(
      {
        model: canonical,
        operation: 'text_to_image',
        prompt: 'a futuristic city skyline',
        aspectRatio: tc.aspectRatio,
        resolution: tc.resolution,
      },
      { index, seam: 'imageGenerate', outputType: 'image' },
    )

    assert.equal(plan.ok, true, `Failed for ${tc.aspectRatio} + ${tc.resolution}: ${plan.message}`)
    assert.equal(plan.vendorPayload.size, tc.expectedSize)
    assert.equal(plan.vendorPayload.quality, tc.expectedQuality)
    // 严禁向 vendor 注入 aspect_ratio
    assert.equal('aspect_ratio' in plan.vendorPayload, false, 'aspect_ratio must NOT be injected into vendorPayload')
    assert.equal(plan.vendorPayload.prompt, 'a futuristic city skyline')
  }
})

test('gpt-image-2 respects user-specified quality override', () => {
  const plan = guardSubmit(
    {
      model: canonical,
      operation: 'text_to_image',
      prompt: 'a cozy mountain cabin',
      aspectRatio: '1:1',
      resolution: '2K',
      quality: 'standard',
    },
    { index, seam: 'imageGenerate', outputType: 'image' },
  )

  assert.equal(plan.ok, true, plan.message)
  assert.equal(plan.vendorPayload.size, '1024x1024')
  assert.equal(plan.vendorPayload.quality, 'standard')
  assert.equal('aspect_ratio' in plan.vendorPayload, false)
})

test('mapOmnimuxInput retains size and quality from guardPlan.vendorPayload', () => {
  const input = mapOmnimuxInput('image', {
    prompt: 'test prompt',
    guardPlan: {
      vendorPayload: {
        prompt: 'test prompt',
        size: '1024x1792',
        quality: 'hd',
      },
    },
  })

  assert.equal(input.size, '1024x1792')
  assert.equal(input.quality, 'hd')
  assert.equal(input.prompt, 'test prompt')
})

test('CI lint: verifyNoConcretePixels catches physical pixel hardcoding', () => {
  const fakeIndex = {
    all: () => [
      {
        id: 'fake-model',
        sourceFile: 'fake.yaml',
        parameters: {
          resolution: {
            options: [{ value: '1024x1024', label: '1K' }],
            defaultValue: '1024x1024',
          },
        },
      },
    ],
  }

  const issues = verifyNoConcretePixels(fakeIndex)
  assert.ok(issues.length >= 1)
  assert.ok(issues.some((i) => i.code === 'parameter_concrete_pixels_forbidden'))
})

test('CI lint: verifyParameterDispatchClosure catches unregistered parameters in live models', () => {
  const fakeIndex = {
    all: () => [
      {
        id: 'fake-live-model',
        sourceFile: 'fake.yaml',
        execution: { status: 'live', profileId: 'imageGenerate' },
        parameters: {
          unregisteredParam: {
            options: [{ value: 'foo', label: 'Foo' }],
          },
        },
      },
    ],
  }

  const issues = verifyParameterDispatchClosure(fakeIndex, profiles)
  assert.ok(issues.length >= 1)
  assert.ok(issues.some((i) => i.code === 'parameter_dispatch_closure_missing'))
})
