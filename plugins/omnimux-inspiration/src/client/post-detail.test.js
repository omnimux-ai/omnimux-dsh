import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analysisInputFingerprint, sourceFingerprint } from '../analysis-input.js'
import { analysisDirections, analysisTargetKey, getBodyTranslation, getPostBody, getPostMedia, getTargetAnalysis } from './post-detail.js'

test('post reading never substitutes a generated script for missing original text', () => {
  assert.equal(getPostBody({ title: '标题', deconstruction: { narrative: '生成故事' } }), '')
  assert.equal(getPostBody({ content: '原文\n第二行' }), '原文\n第二行')
})

test('visible typed media retain persisted indexes and per-type labels', () => {
  const row = { media_items: [{ type: 'video', url: 'https://a.example/1.mp4' }, { type: 'image', url: 'javascript:bad' }, { type: 'image', url: 'https://a.example/2.jpg' }, { type: 'video', url: 'https://a.example/3.mp4' }] }
  assert.deepEqual(getPostMedia(row).map(({ id, index, label }) => ({ id, index, label })), [
    { id: 'media:0', index: 0, label: '视频 1' }, { id: 'media:2', index: 2, label: '图片 1' }, { id: 'media:3', index: 3, label: '视频 2' },
  ])
  assert.deepEqual(getPostMedia({ type: 'video', local_paths: { video: '/tmp/orphan.mp4' } }), [])
  assert.deepEqual(getPostMedia({ type: 'image', media_urls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] }).map(media => media.type), ['image', 'image'])
})

test('analysis identity isolates scopes, rejects changed content and labels old video results', () => {
  const item = { content: '正文', media_items: [{ type: 'video', url: 'https://a.example/1.mp4' }], deconstruction: { markdown: '历史分析' } }
  assert.equal(getTargetAnalysis(item, { scope: 'post' }), null)
  assert.equal(getTargetAnalysis(item, { scope: 'media', media_index: 0 }).source, 'legacy_unknown')
  const target = { scope: 'body' }, entry = { status: 'done', directions: ['content'], input_fingerprint: analysisInputFingerprint(item, { ...target, directions: ['content'] }), result: { markdown: '结果' } }
  item.analysis_results = { body: entry }
  assert.equal(getTargetAnalysis(item, target), entry)
  assert.equal(getTargetAnalysis({ ...item, content: '改过的正文' }, target).status, 'stale')
  assert.equal(getTargetAnalysis({ ...item, content: '改过的正文' }, target).result, null)
  assert.equal(analysisTargetKey({ scope: 'media', media_index: 0 }), 'media:0')
})

test('body translation cache belongs to the original text only', () => {
  const item = { content: '原文', body_translation: { text: '译文', source_fingerprint: sourceFingerprint('原文') }, script_translation: { text: '分析译文' } }
  assert.equal(getBodyTranslation(item).text, '译文')
  assert.equal(getBodyTranslation({ ...item, content: '新原文' }), null)
  assert.equal(getBodyTranslation({ script_translation: item.script_translation }), null)
  assert.deepEqual(analysisDirections('image'), ['content', 'expression', 'creative'])
})
