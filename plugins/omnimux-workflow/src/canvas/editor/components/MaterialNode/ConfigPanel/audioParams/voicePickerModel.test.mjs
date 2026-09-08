/**
 * Unit tests for voicePickerModel + 朗读正文字数闸门（Issue #735 / T03/T04）。
 *
 * 真值断言（非源码正则）：
 * - 拼音首字母贪婪切分（jsxm / ggjs 可命中）；
 * - 搜索：中文名 / 拼音全拼 / 首字母 / voice_type / 场景 / 标签；legacy 无 meta 降级；
 * - 四维筛选动态聚合去重 + AND 关系；
 * - 热门排序：hot_order 1–10 置顶升序 → 热门标签 → 目录原序；
 * - resolveAudioPromptGate：Array.from Unicode 计数与 10000 闸门。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_VOICE_FILTERS,
  VOICE_HOT_TAGS,
  collectVoiceFacets,
  extractPinyinInitials,
  filterAndSortVoices,
  resolveVoiceLabel,
  voiceMatchesQuery,
  voiceTagLine,
} from './voicePickerModel.ts';
import {
  AUDIO_PROMPT_MAX_CHARS,
  resolveAudioPromptGate,
} from './audioParamAdapter.ts';

/** 构造带 meta 的音色选项（对齐 VoiceOptionMeta snake_case 契约） */
const voice = (over) => ({
  value: over.voice_type,
  label: over.display_name,
  meta: {
    voice_type: over.voice_type,
    name: over.name ?? over.display_name,
    display_name: over.display_name,
    category: over.category ?? '通用场景',
    language: over.language ?? '中文',
    accent: over.accent ?? '普通话',
    gender: over.gender ?? 'male',
    tags: over.tags ?? [],
    resource_id: over.resource_id ?? 'seed-tts-2.0',
    is_hot: over.is_hot ?? false,
    hot_order: over.hot_order ?? 0,
  },
});

const FIXTURES = [
  voice({ voice_type: 'zh_male_guanggaojieshuo_uranus_bigtts', display_name: '广告解说 2.0', tags: ['剪映同款'], is_hot: true, hot_order: 1 }),
  voice({ voice_type: 'zh_female_gujie_uranus_bigtts', display_name: '顾姐 2.0', category: '角色扮演', tags: ['抖音同款', '剪映同款'], gender: 'female', is_hot: true, hot_order: 2 }),
  voice({ voice_type: 'zh_male_jieshuoxiaoming_moon_bigtts', display_name: '解说小明', is_hot: true, hot_order: 3, resource_id: 'seed-tts-1.0' }),
  voice({ voice_type: 'ICL_uranus_en_female_charlie_tob', display_name: 'Charlie 2.0', category: '外语音色', language: '美式英语', accent: '美式', gender: 'female', is_hot: true, hot_order: 6 }),
  voice({ voice_type: 'zh_female_wanqudashu_moon_bigtts', display_name: '顽皮大叔', tags: ['豆包同款'], gender: 'female' }),
  voice({ voice_type: 'zh_male_lengkugege_moon_bigtts', display_name: '冷酷哥哥', category: '角色扮演' }),
  voice({ voice_type: 'en_male_adam_mars_bigtts', display_name: 'Adam', category: '外语音色', language: '美式英语', accent: '美式' }),
];

describe('voicePickerModel - 拼音首字母切分', () => {
  it('对 voice_type 贪婪声母切分，首字母查询可命中', () => {
    const initials = extractPinyinInitials('zh_male_jieshuoxiaoming_moon_bigtts');
    assert.ok(initials.includes('jsxm'), `期望含 jsxm，实际 ${initials}`);
  });

  it('鼻音韵尾折叠变体使跨音节首字母连续命中（ggjs）', () => {
    assert.equal(voiceMatchesQuery(FIXTURES[0], 'ggjs'), true);
    assert.equal(voiceMatchesQuery(FIXTURES[0], 'guanggaojieshuo'), true);
  });

  it('多字母声母 zh/ch/sh 取首字母，元音与非字母跳过', () => {
    assert.equal(extractPinyinInitials('zh'), 'z');
    assert.equal(extractPinyinInitials('shuo'), 's');
    assert.equal(extractPinyinInitials('a_e-i'), '');
  });
});

describe('voicePickerModel - 即时模糊搜索', () => {
  it('中文名 / 拼音全拼 / 首字母 / 官方代码 / 场景 / 标签 均可命中', () => {
    const xiaoming = FIXTURES[2];
    assert.equal(voiceMatchesQuery(xiaoming, '解说小明'), true);
    assert.equal(voiceMatchesQuery(xiaoming, 'jieshuoxiaoming'), true);
    assert.equal(voiceMatchesQuery(xiaoming, 'jsxm'), true);
    assert.equal(voiceMatchesQuery(xiaoming, 'zh_male'), true);
    assert.equal(voiceMatchesQuery(xiaoming, '通用场景'), true);
    assert.equal(voiceMatchesQuery(FIXTURES[0], '剪映同款'), true);
    assert.equal(voiceMatchesQuery(FIXTURES[1], '角色扮演'), true);
  });

  it('空查询恒真；无关查询不命中', () => {
    assert.equal(voiceMatchesQuery(FIXTURES[0], ''), true);
    assert.equal(voiceMatchesQuery(FIXTURES[0], '   '), true);
    assert.equal(voiceMatchesQuery(FIXTURES[0], '不存在音色xyz'), false);
  });

  it('legacy 选项（无 meta）按 label/value 降级匹配且不抛错', () => {
    const legacy = { value: 'Friendly_Person', label: 'Friendly Person' };
    assert.equal(voiceMatchesQuery(legacy, 'friendly'), true);
    assert.equal(voiceMatchesQuery(legacy, 'friendly_person'), true);
    assert.equal(voiceMatchesQuery(legacy, '解说'), false);
  });
});

describe('voicePickerModel - 四维筛选聚合与 AND 过滤', () => {
  it('语言/口音/场景去重聚合，性别固定 男声→女声 且剔除 unknown', () => {
    const facets = collectVoiceFacets([
      ...FIXTURES,
      voice({ voice_type: 'zh_male_dup_moon_bigtts', display_name: '重复语言', language: '中文', accent: '普通话' }),
      voice({ voice_type: 'multi_x', display_name: '多值', category: '通用场景,角色扮演', gender: 'unknown' }),
    ]);
    assert.deepEqual(facets.languages, ['中文', '美式英语']);
    assert.deepEqual(facets.accents, ['普通话', '美式']);
    assert.deepEqual(facets.genders, ['male', 'female']);
    assert.ok(facets.categories.includes('通用场景'));
    assert.ok(facets.categories.includes('角色扮演'));
    // 去重：'中文' 只出现一次
    assert.equal(facets.languages.filter((l) => l === '中文').length, 1);
  });

  it('四维筛选为逻辑 AND', () => {
    const result = filterAndSortVoices(FIXTURES, {
      ...EMPTY_VOICE_FILTERS,
      language: '中文',
      gender: 'female',
      category: '角色扮演',
    });
    assert.deepEqual(result.map((o) => o.value), ['zh_female_gujie_uranus_bigtts']);
  });

  it('筛选与搜索叠加生效', () => {
    const result = filterAndSortVoices(FIXTURES, {
      ...EMPTY_VOICE_FILTERS,
      query: 'jsxm',
      gender: 'male',
    });
    assert.deepEqual(result.map((o) => o.value), ['zh_male_jieshuoxiaoming_moon_bigtts']);
  });
});

describe('voicePickerModel - 热门排序', () => {
  it('hot_order 1–10 核心爆款置顶升序 → 热门标签音色 → 其余按目录原序', () => {
    const sorted = filterAndSortVoices(FIXTURES, EMPTY_VOICE_FILTERS);
    const order = sorted.map((o) => o.value);
    assert.deepEqual(order.slice(0, 4), [
      'zh_male_guanggaojieshuo_uranus_bigtts',
      'zh_female_gujie_uranus_bigtts',
      'zh_male_jieshuoxiaoming_moon_bigtts',
      'ICL_uranus_en_female_charlie_tob',
    ]);
    // 豆包同款（热门标签）领先于无标签常规音色
    assert.ok(order.indexOf('zh_female_wanqudashu_moon_bigtts') < order.indexOf('zh_male_lengkugege_moon_bigtts'));
    // 常规音色保持目录原序
    assert.ok(order.indexOf('zh_male_lengkugege_moon_bigtts') < order.indexOf('en_male_adam_mars_bigtts'));
  });

  it('筛选后仍保持热门优先', () => {
    const sorted = filterAndSortVoices(FIXTURES, { ...EMPTY_VOICE_FILTERS, language: '美式英语' });
    assert.deepEqual(sorted.map((o) => o.value), ['ICL_uranus_en_female_charlie_tob', 'en_male_adam_mars_bigtts']);
  });

  it('hot_order 超出 1–10 仅按热门标签分层', () => {
    const outOfRange = voice({ voice_type: 'zh_male_out_moon_bigtts', display_name: '榜外', is_hot: true, hot_order: 99 });
    const tagged = voice({ voice_type: 'zh_male_tag_moon_bigtts', display_name: '标签', tags: ['抖音同款'] });
    const plain = voice({ voice_type: 'zh_male_plain_moon_bigtts', display_name: '普通' });
    const sorted = filterAndSortVoices([plain, outOfRange, tagged], EMPTY_VOICE_FILTERS);
    assert.deepEqual(sorted.map((o) => o.value), [
      'zh_male_tag_moon_bigtts',
      'zh_male_plain_moon_bigtts',
      'zh_male_out_moon_bigtts',
    ]);
    assert.ok(VOICE_HOT_TAGS.includes('抖音同款'));
  });
});

describe('voicePickerModel - 展示派生', () => {
  it('resolveVoiceLabel 优先 display_name，legacy 降级 label/value', () => {
    assert.equal(resolveVoiceLabel(FIXTURES[0]), '广告解说 2.0');
    assert.equal(resolveVoiceLabel({ value: 'Friendly_Person', label: 'Friendly Person' }), 'Friendly Person');
    assert.equal(resolveVoiceLabel(undefined), '');
  });

  it('voiceTagLine 拼接标签与首个场景分类', () => {
    assert.equal(voiceTagLine(FIXTURES[1]), '抖音同款 · 剪映同款 · 角色扮演');
    assert.equal(voiceTagLine({ value: 'x', label: 'x' }), '');
  });
});

describe('resolveAudioPromptGate - 朗读正文字数闸门（T03）', () => {
  it('Array.from 按 Unicode code point 计数（emoji 代理对计 1）', () => {
    const gate = resolveAudioPromptGate(`你好😀${'a'.repeat(10)}`);
    assert.equal(gate.count, 13);
    assert.equal(gate.exceeded, false);
    assert.equal(gate.max, 10000);
    assert.equal(AUDIO_PROMPT_MAX_CHARS, 10000);
  });

  it('超过 10000 字符进入阻断态；边界 10000 放行', () => {
    assert.equal(resolveAudioPromptGate('字'.repeat(10000)).exceeded, false);
    assert.equal(resolveAudioPromptGate('字'.repeat(10001)).exceeded, true);
    // 代理对超限同样准确
    assert.equal(resolveAudioPromptGate('😀'.repeat(10001)).exceeded, true);
  });

  it('空 / undefined 输入安全', () => {
    assert.deepEqual(resolveAudioPromptGate(undefined), { count: 0, max: 10000, exceeded: false });
    assert.deepEqual(resolveAudioPromptGate(null), { count: 0, max: 10000, exceeded: false });
  });
});
