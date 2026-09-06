import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNodeInputSource } from './nodeInputSource.ts';

const source = (data) => readNodeInputSource({ id: 'source', type: 'material', data }, 'workspace');

test('current text does not inherit generating instructions or historical outputs', () => {
  assert.equal(source({ materialType: 'text', prompt: 'old instruction' }).availability, 'waiting');
  assert.equal(source({ materialType: 'text', content: 'old', generatedContent: '' }).availability, 'waiting');
  assert.deepEqual(source({ materialType: 'text', content: 'old', generatedContent: '1dog',
    versions: [{ content: 'history' }], prompt: 'instruction' }).output, { text: '1dog' });
  assert.deepEqual(source({ materialType: 'text', content: 'restored B' }).output, { text: 'restored B' });
});

test('retained completed output survives regeneration, missing output waits and failure stays visible', () => {
  assert.equal(source({ materialType: 'text', executionStatus: 'running', generatedContent: 'A' }).availability, 'ready');
  assert.equal(source({ materialType: 'text', executionStatus: 'running' }).availability, 'waiting');
  assert.equal(source({ materialType: 'text', executionStatus: 'error' }).availability, 'unavailable');
  assert.equal(source({ materialType: 'text', content: '  \n ' }).availability, 'waiting');
});

test('type, thumbnail, asset id or blob preview alone cannot supply executable media', () => {
  for (const extra of [{}, { thumbnail: 'https://example.test/thumb.png' }, { assetId: 'asset' }, { mediaUrl: 'blob:preview' }]) {
    assert.equal(source({ materialType: 'image', ...extra }).availability, 'waiting');
  }
  assert.equal(source({ materialType: 'image', mediaUrl: 'https://example.test/a.png', isMissing: true }).availability, 'unavailable');
});

test('project and legacy local identities resolve through existing serving paths; metadata stays unknown', () => {
  const project = source({ materialType: 'video', relativePath: 'assets/a.mp4', assetId: 'a' });
  assert.equal(project.availability, 'ready');
  assert.equal(project.outputId, 'a');
  assert.equal(project.output.mediaAssets[0].url, '/omnimux-workflow/api/workspaces/workspace/file?rel=assets%2Fa.mp4');
  assert.equal(project.output.mediaAssets[0].sizeBytes, undefined);
  assert.equal(source({ materialType: 'image', realPath: '/tmp/a.png' }).output.mediaAssets[0].path, '/tmp/a.png');
});

test('displayed current media wins over stale aliases and only that result is referenced', () => {
  const result = source({ materialType: 'image', mediaUrl: 'https://example.test/old.png', content: 'filename',
    mediaAssets: [{ type: 'image', url: 'https://example.test/current.png', assetId: 'current' },
      { type: 'image', url: 'https://example.test/other.png' }] });
  assert.equal(result.outputId, 'current');
  assert.equal(result.output.mediaAssets.length, 1);
  assert.equal(result.output.text, undefined);
});
