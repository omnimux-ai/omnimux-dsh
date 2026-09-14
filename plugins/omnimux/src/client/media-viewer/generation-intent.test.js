import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { testNetworkAttempts } from '../../../scripts/test-network-guard.mjs'
import { isExplicitGenerationRequest } from './generation-intent.js'

afterEach(() => assert.deepEqual(testNetworkAttempts(), [], 'intent checks must remain offline'))

for (const text of [undefined, null, 0, {}, '', '   ', '你好', '这张图片很好看', '视频是什么格式', '如何生成图片', '能不能生成视频', '解释这张图片', 'how to generate an image', '停止生成图片', '取消生成视频', 'stop generating images', 'cancel video generation', '不要再生成图片', '别修改照片', '生成一段提示词', '写一段提示词', '优化这段提示词']) {
  test(`does not admit conversation, cancellation or prompt-only input: ${JSON.stringify(text)}`, () => {
    assert.equal(isExplicitGenerationRequest(text), false)
    assert.equal(isExplicitGenerationRequest(text, { hasReference: true }), false)
  })
}

for (const text of ['生成一张图片', '制作一个视频', '画一只猫', '生图', '生成海报', '  CREATE an IMAGE of a cat  ', 'render a video', '根据这段提示词生成图片', 'Generate an image using this prompt: a blue mountain', 'Create a video from the following prompt: blue mountain', '生成一张图片，提示词是蓝色山峰']) {
  test(`admits explicit media creation: ${text}`, () => {
    assert.equal(isExplicitGenerationRequest(text), true)
  })
}

for (const text of ['把背景换成蓝色', '移除右边的人', 'edit the background', '生成新的场景']) {
  test(`reference-dependent edit or scene creation needs an actual reference: ${text}`, () => {
    assert.equal(isExplicitGenerationRequest(text), false)
    assert.equal(isExplicitGenerationRequest(text, { hasReference: true }), true)
  })
}

for (const text of ['修改这张图片', 'edit this image', '把照片调亮', 'Edit this image using the following prompt: blue mountains', '修改这张图片使用以下提示词：蓝色山峰']) {
  test(`explicit named-media editing is admitted: ${text}`, () => {
    assert.equal(isExplicitGenerationRequest(text), true)
  })
}

for (const text of ['帮我写一段用于生成图片的提示词', 'write a prompt to generate an image', 'create a prompt to generate an image', 'edit the prompt to generate an image']) {
  test(`prompt drafting is not a request to generate media: ${text}`, () => {
    assert.equal(isExplicitGenerationRequest(text), false)
    assert.equal(isExplicitGenerationRequest(text, { hasReference: true }), false)
  })
}
