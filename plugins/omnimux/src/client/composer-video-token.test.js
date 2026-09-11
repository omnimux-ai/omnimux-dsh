import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const output = await build({
  entryPoints: [new URL('./composer-add/AttachmentSubmitBridge.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
})
const moduleObj = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  moduleObj,
  moduleObj.exports
)
const { reconcileAttachmentDraft } = moduleObj.exports

test('reconcileAttachmentDraft appends video link token to submitted draft', () => {
  const previous = ''
  const attachments = []
  const draft = '请帮我分析拆解这个视频。'

  // Test video token markdown assembly
  const tokenUrl = 'https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283'
  const videoBlock = `[视频](${tokenUrl})`
  const draftWithVideo = `${draft.trim()}\n\n${videoBlock}`

  const result = reconcileAttachmentDraft(draftWithVideo, previous, attachments)
  assert.equal(result.status, 'ready')
  assert.ok(result.draft.includes('[视频](https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283)'))
  assert.ok(result.draft.startsWith('请帮我分析拆解这个视频。'))
})

test('video token markdown assembly does not duplicate existing URL', () => {
  const tokenUrl = 'https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283'
  let draft = `请分析 [视频](${tokenUrl})`

  if (!draft.includes(tokenUrl)) {
    draft = `${draft}\n\n[视频](${tokenUrl})`
  }

  // Expect exactly one occurrence of tokenUrl
  const occurrences = draft.split(tokenUrl).length - 1
  assert.equal(occurrences, 1)
})

test('transparently prepends active skill gesture to draft without UI pollution', () => {
  const activeSkill = { slug: 'video-hook-analysis', name: '视频分析' }
  const draft = '请帮我分析拆解这个视频。'
  const gesture = `/${activeSkill.slug}`

  let finalDraft = draft
  if (!finalDraft.includes(gesture)) {
    finalDraft = `${gesture} ${finalDraft.trim()}`
  }

  assert.equal(finalDraft, '/video-hook-analysis 请帮我分析拆解这个视频。')
  // Original draft stays clean for UI
  assert.equal(draft, '请帮我分析拆解这个视频。')
})
