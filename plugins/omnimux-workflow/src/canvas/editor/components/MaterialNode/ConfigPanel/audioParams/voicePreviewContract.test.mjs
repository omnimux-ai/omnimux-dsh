/**
 * Issue #3058 官方音色试听 DTO 消费契约（新增测试，不改动既有锁定断言）。
 *
 * 背景：旧版两份逐行重复的 `getVoiceSampleCandidates`/`VOLCENGINE_SAMPLE_CDN_BASE`
 * （VoicePickerDialog.tsx + voicePickerModel.ts）按名字本地拼 URL；本 Issue 起运行时候选
 * 唯一来源是 hub 下发的 `meta.preview` DTO（主理人已锁 schema）：
 *   { purpose:'official-voice-preview', state:'verified-file'|'unverified',
 *     primary_url:string|null, candidates:string[], checked_at:string|null,
 *     evidence_ref:string|null }
 *
 * 本文件锁定：
 *  - model 新增 preview DTO 消费纯函数（primary 置顶、按序去重、不重发同一 URL）；
 *  - 播放资格 = purpose + state==='verified-file' + 非空 primary；
 *  - voiceTagLine 改为仅首个客观场景分类（白名单 §3.3 canvas.voice.meta）；
 *  - dialog 不再本地拼 URL / 维护 CDN registry，失败文案为核定双语句。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OFFICIAL_VOICE_PREVIEW_PURPOSE,
  OFFICIAL_VOICE_PREVIEW_VERIFIED,
  isOfficialVoicePreviewPlayable,
  voicePreviewCandidates,
  voiceTagLine,
} from './voicePickerModel.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(join(here, 'VoicePickerDialog.tsx'), 'utf8');
const modelSrc = readFileSync(join(here, 'voicePickerModel.ts'), 'utf8');

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

const preview = (over) => ({
  purpose: 'official-voice-preview',
  state: 'verified-file',
  primary_url: 'https://cdn.example.com/primary.mp3',
  candidates: [],
  checked_at: '2026-10-03T00:00:00.000Z',
  evidence_ref: 'audit-20261003',
  ...over,
});

describe('voicePreviewCandidates - preview DTO 按序消费', () => {
  it('primary 置顶、按序去重、不重发同一 URL', () => {
    const option = voice({ voice_type: 'zh_male_x', display_name: 'X' });
    option.meta.preview = preview({
      primary_url: 'https://cdn.example.com/primary.mp3',
      candidates: [
        'https://cdn.example.com/primary.mp3',
        'https://cdn.example.com/alt1.mp3',
        'https://cdn.example.com/alt1.mp3',
        'https://cdn.example.com/alt2.mp3',
      ],
    });
    assert.deepEqual(voicePreviewCandidates(option), [
      'https://cdn.example.com/primary.mp3',
      'https://cdn.example.com/alt1.mp3',
      'https://cdn.example.com/alt2.mp3',
    ]);
  });

  it('candidates 缺失 primary 时置顶补齐；无 primary 时按序原样', () => {
    const option = voice({ voice_type: 'zh_male_x', display_name: 'X' });
    option.meta.preview = preview({
      primary_url: 'https://cdn.example.com/primary.mp3',
      candidates: ['https://cdn.example.com/alt.mp3'],
    });
    assert.equal(voicePreviewCandidates(option)[0], 'https://cdn.example.com/primary.mp3');
    option.meta.preview = preview({
      primary_url: null,
      candidates: ['https://cdn.example.com/alt.mp3'],
    });
    assert.deepEqual(voicePreviewCandidates(option), ['https://cdn.example.com/alt.mp3']);
  });

  it('无 preview / legacy 无 meta 安全降级为空列表', () => {
    const option = voice({ voice_type: 'zh_male_x', display_name: 'X' });
    assert.deepEqual(voicePreviewCandidates(option), []);
    assert.deepEqual(voicePreviewCandidates({ value: 'x', label: 'x' }), []);
    assert.deepEqual(voicePreviewCandidates(undefined), []);
  });
});

describe('isOfficialVoicePreviewPlayable - 播放资格三件套', () => {
  it('purpose + verified-file + 非空 primary 齐备才视为可播', () => {
    const option = voice({ voice_type: 'zh_male_x', display_name: 'X' });
    assert.equal(isOfficialVoicePreviewPlayable(option), false);
    option.meta.preview = preview();
    assert.equal(isOfficialVoicePreviewPlayable(option), true);
    option.meta.preview = preview({ state: 'unverified' });
    assert.equal(isOfficialVoicePreviewPlayable(option), false);
    option.meta.preview = preview({ primary_url: null });
    assert.equal(isOfficialVoicePreviewPlayable(option), false);
    option.meta.preview = preview({ purpose: 'other-purpose' });
    assert.equal(isOfficialVoicePreviewPlayable(option), false);
    option.meta.preview = preview({ state: 'unverified', primary_url: null });
    assert.equal(isOfficialVoicePreviewPlayable(option), false);
    assert.equal(isOfficialVoicePreviewPlayable({ value: 'x', label: 'x' }), false);
  });

  it('常量为核定契约字面值', () => {
    assert.equal(OFFICIAL_VOICE_PREVIEW_PURPOSE, 'official-voice-preview');
    assert.equal(OFFICIAL_VOICE_PREVIEW_VERIFIED, 'verified-file');
  });
});

describe('voiceTagLine - 白名单 §3.3 canvas.voice.meta', () => {
  it('仅首个客观场景分类，营销 tags 不进入次级行', () => {
    const option = voice({
      voice_type: 'zh_female_gujie_uranus_bigtts',
      display_name: '顾姐 2.0',
      category: '角色扮演',
      tags: ['抖音同款', '剪映同款'],
    });
    assert.equal(voiceTagLine(option), '角色扮演');
    const tagged = voice({ voice_type: 'x1', display_name: 'x', category: '', tags: ['豆包同款'] });
    assert.equal(voiceTagLine(tagged), '');
    assert.equal(voiceTagLine({ value: 'x', label: 'x' }), '');
  });
});

describe('源码契约 - 候选规则收敛到 DTO', () => {
  it('dialog/model 不再本地拼 URL：删除 VOLCENGINE_SAMPLE_CDN_BASE 与候选猜测函数', () => {
    for (const [name, src] of [['dialog', dialogSrc], ['model', modelSrc]]) {
      assert.doesNotMatch(src, /VOLCENGINE_SAMPLE_CDN_BASE/, `${name} 仍持有 CDN 常量`);
      assert.doesNotMatch(src, /getVoiceSampleCandidates/, `${name} 仍持有本地候选猜测`);
      assert.doesNotMatch(src, /getVoiceSampleUrl/, `${name} 仍持有本地 URL 拼接`);
      assert.doesNotMatch(src, /bytednsdoc/, `${name} 仍持有 CDN 域名`);
    }
  });

  it('dialog 经 voicePreviewCandidates 消费 DTO，播放键按 verified 门控', () => {
    assert.match(dialogSrc, /voicePreviewCandidates/);
    assert.match(dialogSrc, /isOfficialVoicePreviewPlayable/);
    // 请求令牌 + 每候选一次结算
    assert.match(dialogSrc, /requestToken|tokenRef/);
  });

  it('失败文案为核定双语句，旧文案清零', () => {
    assert.match(dialogSrc, /试听暂不可用，请稍后重试。/);
    assert.doesNotMatch(dialogSrc, /该音色暂无官方试听音频/);
  });

  it('NotAllowedError 不换 URL（自动播放拒绝不伪装为文件不存在）', () => {
    assert.match(dialogSrc, /NotAllowedError/);
  });
});
