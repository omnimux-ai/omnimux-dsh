import assert from 'node:assert/strict'
import { test } from 'node:test'
import { executeOmnimuxText } from './execute.js'

const video = `data:video/mp4;base64,${Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).toString('base64')}`
const audio = `data:audio/wav;base64,${Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]).toString('base64')}`
const pdf = `data:application/pdf;base64,${Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]).toString('base64')}`
const ref = (type, pathOrUrl) => ({ type, role: 'reference', pathOrUrl })

test('Gemini 3.8 Flash end-to-end multimodal dispatch: video, audio, and PDF document', async () => {
  const sent = []
  const fetcher = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) })
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'multimodal analysis completed' } }],
      }),
    }
  }
  const env = { OMNIMUX_BASE_URL: 'https://fixture.invalid/v1', OMNIMUX_API_KEY: 'test-token' }

  // 1. 视频输入测试
  const videoRes = await executeOmnimuxText({
    prompt: '分析视频镜头',
    operation: 'vision_chat',
    references: [ref('video', video)],
    env,
    fetcher,
  })
  assert.equal(videoRes.text, 'multimodal analysis completed')
  assert.equal(sent[0].body.model, 'gemini-3.8-flash')
  assert.equal(sent[0].body.messages[0].content[1].image_url.url, video)

  // 2. 音频输入测试
  const audioRes = await executeOmnimuxText({
    prompt: '总结音频发言要点',
    operation: 'vision_chat',
    references: [ref('audio', audio)],
    env,
    fetcher,
  })
  assert.equal(audioRes.text, 'multimodal analysis completed')
  assert.equal(sent[1].body.model, 'gemini-3.8-flash')
  assert.equal(sent[1].body.messages[0].content[1].image_url.url, audio)

  // 3. PDF 文档输入测试
  const pdfRes = await executeOmnimuxText({
    prompt: '提取文档核心条款',
    operation: 'vision_chat',
    references: [ref('document', pdf)],
    env,
    fetcher,
  })
  assert.equal(pdfRes.text, 'multimodal analysis completed')
  assert.equal(sent[2].body.model, 'gemini-3.8-flash')
  assert.equal(sent[2].body.messages[0].content[1].image_url.url, pdf)

  assert.equal(sent.length, 3)
})

test('Gemini 3.8 Flash defenses: invalid document format is safely rejected', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ choices: [] }) })
  const env = { OMNIMUX_BASE_URL: 'https://fixture.invalid/v1', OMNIMUX_API_KEY: 'test-token' }

  // 非法 PDF 数据（魔数不匹配）
  const fakePdf = 'data:application/pdf;base64,SUQzBAAA'
  await assert.rejects(
    () => executeOmnimuxText({
      prompt: 'test',
      operation: 'vision_chat',
      references: [ref('document', fakePdf)],
      env,
      fetcher,
    }),
    { code: 'omnimux-invalid-request' },
  )
})
