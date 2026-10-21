import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHistoryEntries,
  entryStatus,
  formatHistoryTime,
  pickEntryPrimaryItem,
  promptSnapshotOf,
} from './generation-history.js';

const item = (overrides) => Object.assign({
  id: 'm1',
  sessionId: 's1',
  timestamp: 1_760_000_000_000,
  type: 'image',
  status: 'completed',
  url: 'https://example.test/a.png',
  title: 'A',
  prompt: 'draft prompt',
}, overrides);

describe('generation history projection', () => {
  it('groups batch results by groupId and keeps the submitted prompt snapshot', () => {
    const entries = buildHistoryEntries([
      item({ id: 'g:0', groupId: 'g', timestamp: 300, request: { prompt: 'snapshot prompt' } }),
      item({ id: 'g:1', groupId: 'g', timestamp: 200, url: 'https://example.test/b.png', request: { prompt: 'snapshot prompt' } }),
      item({ id: 'solo', timestamp: 100, request: { prompt: 'older' } }),
    ]);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].groupId, 'g');
    assert.equal(entries[0].count, 2);
    assert.equal(entries[0].prompt, 'snapshot prompt');
    assert.equal(entries[0].primary.id, 'g:0');
    assert.equal(entries[0].hasDownload, true);
    assert.equal(entries[1].groupId, 'solo');
  });

  it('orders entries newest-first and falls back to the item prompt', () => {
    const entries = buildHistoryEntries([
      item({ id: 'old', timestamp: 100, prompt: 'old prompt', request: null }),
      item({ id: 'new', timestamp: 300, prompt: 'new prompt', request: null }),
    ]);
    assert.deepEqual(entries.map((entry) => entry.id), ['new', 'old']);
    assert.equal(entries[0].prompt, 'new prompt');
  });

  it('filters by session when one is provided', () => {
    const entries = buildHistoryEntries([
      item({ id: 'a', sessionId: 's1' }),
      item({ id: 'b', sessionId: 's2', timestamp: 2 }),
    ], 's1');
    assert.deepEqual(entries.map((entry) => entry.id), ['a']);
    assert.equal(buildHistoryEntries([item({ id: 'a', sessionId: 's1' })], null).length, 1);
  });

  it('prefers a completed result when a batch mixes statuses', () => {
    const entry = {
      items: [
        item({ id: 'failed', groupId: 'g', status: 'failed', url: undefined, timestamp: 300 }),
        item({ id: 'done', groupId: 'g', status: 'completed', timestamp: 200 }),
        item({ id: 'running', groupId: 'g', status: 'generating', url: undefined, timestamp: 100 }),
      ],
    };
    assert.equal(pickEntryPrimaryItem(entry).id, 'done');
    assert.equal(entryStatus(entry), 'generating');
  });

  it('reports failed and completed aggregate statuses', () => {
    assert.equal(entryStatus({ items: [item({ status: 'failed' })] }), 'failed');
    assert.equal(entryStatus({ items: [item({ status: 'completed' })] }), 'completed');
    assert.equal(entryStatus({ items: [] }), 'failed');
  });

  it('does not invent a prompt snapshot', () => {
    assert.equal(promptSnapshotOf({}), '');
    assert.equal(promptSnapshotOf({ prompt: 'fallback' }), 'fallback');
    assert.equal(promptSnapshotOf({ prompt: 'fallback', request: { prompt: 'submitted' } }), 'submitted');
    assert.equal(promptSnapshotOf({ request: { prompt: '   ' } }), '');
  });

  it('formats HH:MM and ignores invalid timestamps', () => {
    assert.match(formatHistoryTime(1_760_000_000_000), /^\d{2}:\d{2}$/);
    assert.equal(formatHistoryTime(0), '');
    assert.equal(formatHistoryTime(Number.NaN), '');
    assert.equal(formatHistoryTime(8.64e15 + 1), '');
  });

  it('trims whitespace-only fallback prompts and reports batch failure counts', () => {
    assert.equal(promptSnapshotOf({ prompt: '   ' }), '');
    const [entry] = buildHistoryEntries([
      item({ id: 'ok', groupId: 'mix', timestamp: 2 }),
      item({ id: 'bad', groupId: 'mix', timestamp: 1, status: 'failed', url: undefined }),
    ]);
    assert.equal(entry.failedCount, 1);
    assert.equal(entry.completedCount, 1);
    assert.equal(entry.count, 2);
  });

  it('ignores malformed input without throwing', () => {
    assert.deepEqual(buildHistoryEntries(null), []);
    assert.deepEqual(buildHistoryEntries([null, {}, { id: '' }]), []);
  });
});
