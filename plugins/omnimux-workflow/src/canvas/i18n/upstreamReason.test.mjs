/**
 * upstreamReason 单测：规格 A1/A2/A4 + 空输入 + 未知码回退。
 *
 * 断言的是「上游机器码 → 用户可读结论」这一层的全部契约：已登记码各有专属
 * 结论、未知码与空码回退通用句、结论绝不回显机器码、双语字典两侧都可取。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import zh from './dict.zh.ts';
import en from './dict.en.ts';
import { t, setLocale } from './index.ts';
import { resolveUpstreamReason, UPSTREAM_REASON_FALLBACK_KEY } from './upstreamReason.ts';

/** 上游真实会抛出的机器码（见 workflow/videoAnalyzeFailure.ts 与中枢 OmnimuxError）。 */
const MACHINE_CODES = [
  'omnimux-invalid-request',
  'video-understand-unsupported',
  'video-invalid-input',
  'unknown-model',
  'needs-provider',
  'needs-omnimux',
  'omnimux-unconfigured',
];

test('A1: omnimux-invalid-request → 「该渠道不支持此素材类型」', () => {
  assert.ok(resolveUpstreamReason('omnimux-invalid-request').includes('该渠道不支持此素材类型'));
});

test('A2: unknown-model → 「该模型未启用」', () => {
  assert.ok(resolveUpstreamReason('unknown-model').includes('该模型未启用'));
});

test('A4: 未知码回退通用句', () => {
  assert.equal(resolveUpstreamReason('some-future-code'), zh[UPSTREAM_REASON_FALLBACK_KEY]);
  assert.equal(resolveUpstreamReason('some-future-code'), resolveUpstreamReason(undefined));
});

test('空输入（undefined/null/空串/空白串）回退通用句', () => {
  for (const input of [undefined, null, '', '   ']) {
    assert.equal(resolveUpstreamReason(input), zh[UPSTREAM_REASON_FALLBACK_KEY]);
  }
});

test('每个已登记机器码都有专属结论，不落回通用句', () => {
  for (const code of MACHINE_CODES) {
    const copy = resolveUpstreamReason(code);
    assert.notEqual(copy, zh[UPSTREAM_REASON_FALLBACK_KEY], `${code} 未登记`);
    assert.ok(copy.length > 0);
  }
});

test('A6: 结论为纯中文句子，绝不回显英文机器码', () => {
  for (const code of [...MACHINE_CODES, 'unknown-code-xyz']) {
    const copy = resolveUpstreamReason(code);
    assert.ok(!copy.includes(code), `${code} 回显了机器码：${copy}`);
    assert.doesNotMatch(copy, /[A-Za-z]/, `${code} 的结论含拉丁字母：${copy}`);
    assert.match(copy, /。$/, `${code} 的结论未以句号收尾：${copy}`);
  }
});

test('A7: 结论在 zh/en 双语字典都可取，en 侧无中日韩字符', () => {
  const cjk = /[一-龥]/;
  for (const code of [...MACHINE_CODES, 'some-future-code']) {
    setLocale('zh');
    const zhCopy = resolveUpstreamReason(code, t);
    assert.equal(zhCopy, resolveUpstreamReason(code), '缺省应取中文结论');
    assert.ok(Object.values(zh).includes(zhCopy), `zh 字典缺该结论：${zhCopy}`);

    setLocale('en');
    const enCopy = resolveUpstreamReason(code, t);
    assert.ok(Object.values(en).includes(enCopy), `en 字典缺该结论：${enCopy}`);
    assert.ok(!cjk.test(enCopy), `en 侧含中文：${enCopy}`);
    assert.notEqual(enCopy, zhCopy);
  }
  setLocale('zh');
});

test('结论随调用方翻译器切换语言（同一机器码两条文案）', () => {
  assert.equal(resolveUpstreamReason('needs-omnimux', (key) => zh[key]), zh['error.upstreamHubNotReady']);
  assert.equal(resolveUpstreamReason('needs-omnimux', (key) => en[key]), en['error.upstreamHubNotReady']);
});
