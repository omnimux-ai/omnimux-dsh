import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCover, projectCover, coverUrl } from './coverSummary.ts';
const node = (id, kind, data = {}) => ({ id, type: 'material', data: { materialType: kind, ...data } });
test('empty prompts do not become media; text and table content become document', () => {
  assert.equal(summarizeCover([node('a', 'image', { prompt: 'cat' })]).kind, 'empty');
  assert.equal(summarizeCover([node('a', 'text', { content: 'hello' })]).kind, 'document');
  assert.equal(summarizeCover([{ id: 'a', type: 'table', data: { rows: [{}] } }]).kind, 'document');
});
test('stable first valid media skips placeholders and ignores geometry and active page', () => {
  const a = node('a', 'audio', { mediaUrl: 'https://example.test/a.wav' });
  const b = node('b', 'image', { mediaUrl: 'https://example.test/b.png' });
  assert.equal(summarizeCover([node('empty', 'image'), a, b]).nodeId, 'a');
  assert.equal(summarizeCover([b, a], ['a', 'b']).nodeId, 'a');
  assert.equal(projectCover([{ kind: 'empty' }, summarizeCover([a])]).kind, 'audio');
  assert.equal(summarizeCover([b], ['a', 'b']).nodeId, 'b');
});
test('typed media assets do not cross-fallback and video body is not image poster', () => {
  assert.equal(summarizeCover([node('a', 'image', { mediaAssets: [{ type: 'video', url: 'https://example.test/v.mp4' }] })]).kind, 'empty');
  const video = summarizeCover([node('a', 'video', { mediaUrl: 'https://example.test/v.mp4', thumbnailUrl: 'https://example.test/p.jpg' })]);
  assert.equal(video.thumbnailUrl, 'https://example.test/p.jpg');
  assert.equal(video.mediaUrl, 'https://example.test/v.mp4');
  assert.equal(summarizeCover([node('a', 'video', { mediaUrl: 'https://example.test/v.mp4' })]).thumbnailUrl, undefined);
});
test('local offline media stays typed unavailable; transient URLs never persist', () => {
  for (const url of ['blob:x', 'file:///tmp/private.png', 'javascript:alert(1)', '/tmp/private.png', 'data:image/png;base64,abc']) assert.equal(coverUrl(url), undefined);
  assert.deepEqual(summarizeCover([node('a', 'image', { realPath: '/private/a.png' })]), { kind: 'image', nodeId: 'a', unavailable: true });
  assert.equal(projectCover([{ kind: 'empty', unavailable: true }]).unavailable, true);
});
