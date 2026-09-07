import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { normalizeVolcengineVoices } from './normalize.js';

const source = JSON.parse(readFileSync(new URL('../../../../../docs/assets/volcengine-voices.json', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('./volcengine-voice-index.json', import.meta.url), 'utf8'));
const byId = new Map(index.map((voice) => [voice.voice_type, voice]));

test('generated index exactly projects all 509 unique official voice IDs without modifying the source', () => {
  const original = structuredClone(source);
  assert.equal(source.length, 509);
  assert.equal(index.length, 509);
  assert.equal(byId.size, 509);
  assert.deepEqual(new Set(byId.keys()), new Set(source.map((voice) => voice.voice_type)));
  assert.deepEqual(index, normalizeVolcengineVoices(source));
  assert.deepEqual(source, original);
  for (const voice of index) {
    for (const key of ['voice_type', 'name', 'display_name', 'category', 'language', 'accent', 'resource_id']) {
      assert.equal(typeof voice[key], 'string', key);
      assert.ok(voice[key].length > 0, key);
    }
    assert.ok(['male', 'female', 'unknown'].includes(voice.gender));
    assert.ok(['seed-tts-1.0', 'seed-tts-2.0'].includes(voice.resource_id));
    assert.equal(typeof voice.is_hot, 'boolean');
    assert.ok(Number.isInteger(voice.hot_order) && voice.hot_order > 0);
    assert.ok(voice.tags.every((tag) => ['抖音同款', '剪映同款', '豆包同款', '猫箱同款'].includes(tag)));
  }
});

test('normalization script check mode verifies the committed bytes without writing', () => {
  const script = new URL('../../../../../scripts/tools/normalize-volcengine-voices.mjs', import.meta.url);
  assert.match(execFileSync(process.execPath, [script.pathname, '--check'], { encoding: 'utf8' }), /Verified 509/);
});

test('the ten core voices have stable ID-based order, including the bilingual Skye label', () => {
  assert.deepEqual(index.slice(0, 10).map((voice) => voice.name), [
    '广告解说', '顾姐', '解说小明', '知性女声', '清爽男大', 'Charlie', '悬疑解说',
    '爽快思思/Skye', '渊博小叔', '亲切女声',
  ]);
  assert.deepEqual(index.map((voice) => voice.hot_order), Array.from({ length: 509 }, (_, i) => i + 1));
  assert.ok(index.slice(0, 10).every((voice) => voice.is_hot));
  const weight = (voice) => voice.tags.reduce((sum, tag) => sum + ({ 抖音同款: 4, 剪映同款: 2, 豆包同款: 1 }[tag] ?? 0), 0);
  for (let i = 11; i < index.length; i++) assert.ok(weight(index[i - 1]) >= weight(index[i]));
});

test('gender parsing handles ICL prefixes, male/female token boundaries and unknown IDs', () => {
  assert.equal(byId.get('ICL_uranus_en_female_charlie_tob').gender, 'female');
  assert.equal(byId.get('zh_male_guanggaojieshuo_uranus_bigtts').gender, 'male');
  assert.equal(byId.get('imitation_uranus_bigtts').gender, 'unknown');
});

test('languages, accents and scenes remain searchable without raw protocol tags', () => {
  for (const [name, language, accent] of [
    ['豫州子轩', '中文', '河南口音'], ['呆萌川妹', '中文', '四川口音'],
    ['京腔侃爷/Harmony', '中文,美式英语', '北京口音,美式'], ['粤语小溏', '中文', '粤语'],
    ['Charlie', '美式英语', '美式'], ['Alastor', '英式英语', '英式'], ['Ethan', '澳洲英语', '澳洲'],
    ['林潇', '中文', '普通话'],
  ]) {
    const voice = index.find((row) => row.name === name);
    assert.equal(voice?.language, language, name);
    assert.equal(voice?.accent, accent, name);
  }
  const row = normalizeVolcengineVoices([{ ...source[0], category: '通用场景, 视频配音,外语音色,美式英语',
    language: '中文, 美式英语', tags: ['是', '否', '抖音同款', '抖音同款', '双向流调用会直接报错'] }])[0];
  assert.equal(row.category, '通用场景,视频配音,外语音色');
  assert.equal(row.language, '中文,美式英语');
  assert.equal(row.accent, '普通话,美式');
  assert.deepEqual(row.tags, ['抖音同款']);
  assert.equal(row.is_hot, true);
});

test('malformed source, duplicate IDs and unsupported resource IDs fail closed', () => {
  for (const invalid of [null, {}, [], [null], [{ ...source[0], voice_type: '' }],
    [{ ...source[0], voice_type: '../voice' }], [{ ...source[0], tags: ['抖音同款', 3] }],
    [{ ...source[0], display_name: ' ' }], [{ ...source[0], resource_id: 'unknown' }], [source[0], source[0]]]) {
    assert.throws(() => normalizeVolcengineVoices(invalid));
  }
});
