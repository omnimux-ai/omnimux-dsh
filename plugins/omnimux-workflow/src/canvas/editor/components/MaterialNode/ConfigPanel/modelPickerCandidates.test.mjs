import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPickerCandidates, isPickerCandidate } from './modelPickerCandidates.ts';

test('grouping preserves exactly the supplied image candidates without text or video defaults', () => {
  const rows = [{ id: 'gpt-image-2.5', label: '图片' }, { id: 'nano-banana-2', label: '香蕉' }];
  const groups = groupPickerCandidates(rows);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => r.id)).sort(), rows.map(r => r.id).sort());
  assert.equal(isPickerCandidate(rows, 'gpt-5.5'), false);
  assert.equal(isPickerCandidate(rows, 'gpt-image-2.5'), true);
});
test('empty candidates stay empty and reject saved ids', () => {
  assert.deepEqual(groupPickerCandidates([]), []);
  assert.equal(isPickerCandidate([], 'seedance-2-0-fast'), false);
  assert.equal(isPickerCandidate([{ id: '', label: '' }], ''), false);
});
test('audio and unknown brands stay reachable using actual family or id', () => {
  const rows = [{ id: 'speech-02-hd', label: '语音', family: 'minimax' }, { id: 'voice-new', label: '声音', family: 'new-vendor' }, { id: 'opaque-id', label: '未知品牌' }];
  const groups = groupPickerCandidates(rows);
  assert.deepEqual(groups.map(g => g.name), ['MiniMax', 'new-vendor', 'opaque-id']);
  assert.deepEqual(groups.flatMap(g => g.rows), rows);
  assert.equal(groups[0].iconModelId, 'speech-02-hd');
});
test('candidate replacement immediately invalidates the old selection without mutation', () => {
  const rows = Object.freeze([Object.freeze({ id: 'veo-3', label: '视频', family: 'google' })]);
  const groups = groupPickerCandidates(rows);
  assert.equal(isPickerCandidate(rows, 'gemini-3.8-flash'), false);
  assert.deepEqual(groups[0].rows, rows);
});
