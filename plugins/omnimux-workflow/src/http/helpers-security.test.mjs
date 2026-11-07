import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalWrite } from './helpers.ts';

test('workflow local writes reject same-site browser origins', () => {
  assert.throws(
    () => assertLocalWrite({ secFetchSite: 'same-site', origin: 'http://127.0.0.1:5173' }),
    /cross-origin/,
  );
});

test('workflow local writes reject a localhost origin whose port does not match the Host header', () => {
  assert.throws(
    () => assertLocalWrite({ origin: 'http://127.0.0.1:5173', host: '127.0.0.1:64245' }),
    /cross-origin/,
  );
});

test('workflow local writes keep same-origin and native no-origin calls', () => {
  assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'same-origin' }));
  assert.doesNotThrow(() => assertLocalWrite({}));
});
