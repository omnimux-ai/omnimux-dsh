import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLinkReference, detectOffset, hasLinkReference, linkClipboardText, validLinkUrl, type LinkInputState } from './linkReference.ts';

const state = (overrides: Partial<LinkInputState> = {}): LinkInputState => ({
  draft: 'abcdefghij', draftRev: 7, phase: 'plain', occurrences: [], ...overrides,
});
const occurrence = (offset: number, length: number, source = 'native-file', ref = 'file.md') => ({ offset, length, source, ref });

describe('link reference URL validation', () => {
  it('accepts complete HTTP(S) URLs, trims outer whitespace and preserves the supplied address', () => {
    for (const url of ['https://example.com', 'HTTP://EXAMPLE.COM:80/a?x=1#part', 'https://例子.测试/视频', 'https://example.com/a%20b']) {
      assert.equal(validLinkUrl(` \n${url}\t`), url);
    }
  });
  it('rejects empty, bare IDs, incomplete, non-HTTP, credentialed and multiple URLs', () => {
    for (const value of ['', '  ', '123456789', 'example.com/video', '//example.com', 'https://', 'https://?x=1', 'ftp://example.com', 'javascript:alert(1)', 'file:///tmp/video', 'https://user@example.com', 'https://user:pass@example.com', 'https://example.com/a b', '<https://example.com>', 'https://example.com\nhttps://other.com', 'https://example.com,https://other.com']) {
      assert.equal(validLinkUrl(value), null, value);
    }
  });
});

describe('native reference detect coordinates', () => {
  it('uses UTF-16 draft units for text without references', () => {
    const input = state({ draft: '文😀字' });
    assert.equal(detectOffset(input, 0), 0);
    assert.equal(detectOffset(input, input.draft.length), 4);
  });
  it('collapses each existing native reference to one detect unit without changing the snapshot', () => {
    const input = state({ occurrences: [occurrence(1, 3), occurrence(6, 2)] });
    const before = structuredClone(input);
    assert.equal(detectOffset(input, 1), 1);
    assert.equal(detectOffset(input, 4), 2);
    assert.equal(detectOffset(input, 6), 4);
    assert.equal(detectOffset(input, 8), 5);
    assert.equal(detectOffset(input, input.draft.length), 7);
    assert.deepEqual(input, before);
  });
  it('rejects positions inside a reference and invalid offset or revision units', () => {
    const input = state({ occurrences: [occurrence(1, 3)] });
    for (const offset of [-1, 11, 1.5, NaN, Infinity, 2, 3]) assert.equal(detectOffset(input, offset), null);
    assert.equal(detectOffset(state({ draftRev: 1.5 }), 10), null);
    assert.equal(detectOffset(state({ draftRev: NaN }), 10), null);
  });
  it('rejects overlapping, unsorted, fractional, negative and out-of-draft occurrence ranges', () => {
    for (const occurrences of [
      [occurrence(1, 4), occurrence(3, 2)], [occurrence(6, 2), occurrence(1, 2)],
      [occurrence(-1, 2)], [occurrence(1.5, 2)], [occurrence(1, 2.5)],
      [occurrence(1, -1)], [occurrence(9, 2)],
    ]) assert.equal(detectOffset(state({ occurrences }), 10), null);
  });
  it('counts empty clipboard references as atomic units at the document end', () => {
    assert.equal(detectOffset(state({ draft: '', occurrences: [occurrence(0, 0)] }), 0), 1);
    assert.equal(detectOffset(state({ draft: 'ab', occurrences: [occurrence(2, 0), occurrence(2, 0)] }), 2), 4);
    const input = state({ draft: 'abREFcd', occurrences: [occurrence(2, 3), occurrence(5, 0), occurrence(7, 0)] });
    const before = structuredClone(input);
    assert.equal(detectOffset(input, 7), 7);
    assert.deepEqual(input, before);
  });
  it('supports adjacent references and an empty draft', () => {
    assert.equal(detectOffset(state({ occurrences: [occurrence(0, 3), occurrence(3, 7)] }), 10), 2);
    assert.equal(detectOffset(state({ draft: '' }), 0), 0);
  });
});

describe('link identity and reference payload', () => {
  it('deduplicates normalized exact URL identity for the same source only', () => {
    const input = state({ occurrences: [occurrence(0, 1, 'omnimux-video-link', 'HTTPS://EXAMPLE.COM:443')] });
    assert.equal(hasLinkReference(input, 'video', 'https://example.com/'), true);
    assert.equal(hasLinkReference(input, 'product', 'https://example.com/'), false);
    for (const url of ['http://example.com/', 'https://example.com/video', 'https://example.com/?x=1', 'https://example.com/#part']) {
      assert.equal(hasLinkReference(input, 'video', url), false);
    }
  });
  it('does not merge path case, queries or fragments and ignores invalid or legacy refs', () => {
    const input = state({ occurrences: [
      occurrence(0, 1, 'omnimux-video-link', 'https://example.com/Video?a=1#first'),
      occurrence(1, 1, 'omnimux-video-link', 'not a URL'),
      occurrence(2, 1, 'link', 'https://example.com/legacy'),
    ] });
    assert.equal(hasLinkReference(input, 'video', 'https://example.com/Video?a=1#first'), true);
    for (const url of ['https://example.com/video?a=1#first', 'https://example.com/Video?a=2#first', 'https://example.com/Video?a=1#second', 'https://example.com/legacy']) {
      assert.equal(hasLinkReference(input, 'video', url), false);
    }
  });
  it('preserves the full URL and purpose in independent video/product reference payloads', () => {
    const url = 'https://example.com/path?id=2593#details';
    for (const [kind, purpose, source] of [['video', '参考视频', 'omnimux-video-link'], ['product', '商品页面', 'omnimux-product-link']] as const) {
      assert.deepEqual(createLinkReference(kind, url), { source, ref: url, label: `${purpose} · example.com`, clipboardText: `${purpose}：${url}` });
      assert.equal(linkClipboardText(kind, url), `${purpose}：${url}`);
    }
  });
});
