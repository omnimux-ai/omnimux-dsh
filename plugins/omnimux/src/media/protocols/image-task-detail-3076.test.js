import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pollOpenAiMediaTask } from './openai-media.js'
import { taskDetailUrl } from '../vendors/omnimux.js'

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const taskId = 'task_image_fixture'
const body = { code: 'success', data: { status: 'failed', error: null, task_id: taskId, url: `https://omnimux.ai/v1/images/${taskId}/content` } }
const reason = '无法生成这张图片，因为当前图像生成请求触发了速率限制。请稍后再试。'
const options = fetcher => ({ fetcher, baseUrl: 'https://api.omnimux.ai/v1', apiKey: 'fixture-key', taskId, capability: 'image', sleep: async () => {}, resolveFailureReason: true })

test('official image terminal failure reads generic task reason without any POST', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    assert.equal(init.method || 'GET', 'GET')
    calls.push(String(url))
    if (String(url).includes('/images/generations/')) return json(body)
    assert.equal(String(url), `https://api.omnimux.ai/v1/tasks/${taskId}`)
    return json({ task_id: taskId, status: 'FAILURE', fail_reason: reason })
  }
  await assert.rejects(pollOpenAiMediaTask(options(fetcher)), error => {
    assert.equal(error.code, 'omnimux-failed')
    assert.ok(error.message.includes(reason))
    return true
  })
  assert.deepEqual(calls, [`https://api.omnimux.ai/v1/images/generations/${taskId}`, `https://api.omnimux.ai/v1/tasks/${taskId}`])
})

test('generic image reason does not replace the terminal error when detail fails', async () => {
  for (const status of [401, 404, 500]) {
    const fetcher = async url => String(url).includes('/images/generations/') ? json(body) : json({ error: { message: 'detail unavailable' } }, status)
    await assert.rejects(pollOpenAiMediaTask(options(fetcher)), error => {
      assert.equal(error.code, 'omnimux-failed')
      assert.match(error.message, /上游未返回失败原因/)
      assert.doesNotMatch(error.message, /detail unavailable/)
      return true
    })
  }
})

test('image generic detail is official-origin and version-path scoped; video and custom stay unchanged', () => {
  for (const baseUrl of ['https://api.omnimux.ai/v1', 'https://omnimux.ai/v1/']) {
    assert.equal(taskDetailUrl(body, { capability: 'image', baseUrl, taskId }), new URL(baseUrl).origin + `/v1/tasks/${taskId}`)
  }
  assert.equal(taskDetailUrl({ data: { status: 'failed' } }, { capability: 'image', baseUrl: 'https://custom.example/v1', taskId }), undefined)
  assert.equal(taskDetailUrl({ url: 'https://custom.example/image/a/content' }, { capability: 'image', baseUrl: 'https://custom.example/v1', taskId }), 'https://custom.example/image/a')
  assert.equal(taskDetailUrl({ url: 'https://cdn.example/out.mp4' }, { capability: 'video', baseUrl: 'https://api.omnimux.ai/v1', taskId }), `https://api.omnimux.ai/v1/videos/${taskId}`)
  assert.equal(taskDetailUrl({ data: { status: 'failed' } }, { capability: 'image', baseUrl: 'https://api.omnimux.ai/custom', taskId }), undefined)
  assert.equal(taskDetailUrl({ data: { status: 'failed' } }, { capability: 'image', baseUrl: 'https://api.omnimux.ai/v1', taskId: '' }), undefined)
})
