import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectGenerationTextSources, resolveGenerationPrompt } from '../src/shared/graph/generationPrompt.ts';

// #1760: shared source selection; browser interactions are covered separately.
test('text sources deduplicate sourceNodeId in connection order, not text or edge identity', () => {
  const sources = [
    { sourceNodeId: 'b', edgeId: 'b1', type: 'text', textContent: '同文' },
    { sourceNodeId: 'a', edgeId: 'a1', type: 'text', textContent: '同文' },
    { sourceNodeId: 'b', edgeId: 'b2', type: 'text', textContent: '重复边不应再拼接' },
  ];
  const before = structuredClone(sources);
  const selected = selectGenerationTextSources(sources);
  assert.deepEqual(selected.map((source) => source.sourceNodeId), ['b', 'a']);
  assert.deepEqual(sources, before);
  assert.equal(resolveGenerationPrompt({ prompt: '缩短到30秒' }, selected.map((source) => source.textContent)),
    '来源 1：\n同文\n\n来源 2：\n同文\n\n补充要求：\n缩短到30秒');
});

test('table and text-without-url sources participate, media URLs do not become prose', () => {
  const sources = [
    { sourceNodeId: 'table', type: 'table', textContent: '列名\n值', url: 'https://fixture.test/table.csv' },
    { sourceNodeId: 'fallback', type: 'document', textContent: '正文' },
    { sourceNodeId: 'image', type: 'image', textContent: '图片说明不是上游正文', url: 'https://fixture.test/a.png' },
    { sourceNodeId: 'video', type: 'video', url: 'https://fixture.test/a.mp4' },
    { sourceNodeId: 'empty', type: 'document', textContent: '' },
  ];
  const selected = selectGenerationTextSources(sources);
  assert.deepEqual(selected.map((source) => source.sourceNodeId), ['table', 'fallback']);
  assert.equal(resolveGenerationPrompt({}, selected.map((source) => source.textContent)),
    '来源 1：\n列名\n值\n\n来源 2：\n正文');
});

test('waiting and blank text/table sources are omitted and cannot be replaced by a stale later duplicate', () => {
  const waiting = { sourceNodeId: 'waiting', type: 'text', availability: 'waiting' };
  const blank = { sourceNodeId: 'table', type: 'table', textContent: '  ', availability: 'unavailable' };
  assert.deepEqual(selectGenerationTextSources([
    waiting, blank, { sourceNodeId: 'waiting', type: 'text', textContent: 'stale duplicate' },
  ]), []);
});

test('a non-text entry does not suppress a later eligible source with the same node identity', () => {
  const text = { sourceNodeId: 'source', type: 'text', textContent: '1dog' };
  assert.deepEqual(selectGenerationTextSources([
    { sourceNodeId: 'source', type: 'image', url: 'https://fixture.test/a.png' }, text,
  ]), [text]);
});

test('source edits, reordering and disconnection are recomputed without a cached selection', () => {
  const a = { sourceNodeId: 'a', type: 'text', textContent: '甲' };
  const b = { sourceNodeId: 'b', type: 'table', textContent: '乙' };
  const prompt = (sources) => resolveGenerationPrompt({}, selectGenerationTextSources(sources).map((source) => source.textContent));
  assert.equal(prompt([a, b]), '来源 1：\n甲\n\n来源 2：\n乙');
  assert.equal(prompt([b, a]), '来源 1：\n乙\n\n来源 2：\n甲');
  a.textContent = '新甲';
  assert.equal(prompt([a]), '新甲');
  assert.equal(prompt([]), '');
});
