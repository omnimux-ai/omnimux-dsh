/**
 * srtParser 纯函数单测（Issue 744 T02/T05）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captionSlicesFromText,
  isSrtContent,
  parseSrtCues,
} from './srtParser.ts';

const SAMPLE = `1
00:00:01,200 --> 00:00:03,500
大家好，欢迎来到我的频道
`;

test('parseSrtCues：任务书样例精确解析', () => {
  assert.deepEqual(parseSrtCues(SAMPLE), [
    { text: '大家好，欢迎来到我的频道', startTimeMs: 1200, durationMs: 2300 },
  ]);
});

test('parseSrtCues：多 cue + 多行正文 + CRLF', () => {
  const raw = '1\r\n00:00:00,000 --> 00:00:01,000\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:02,500 --> 00:00:04,000\r\n下一句\r\n';
  assert.deepEqual(parseSrtCues(raw), [
    { text: '第一行\n第二行', startTimeMs: 0, durationMs: 1000 },
    { text: '下一句', startTimeMs: 2500, durationMs: 1500 },
  ]);
});

test('parseSrtCues：序号行可选、点号毫秒容错、小时位解析', () => {
  const raw = `00:00:01.5 --> 00:00:02.05
无序号
`;
  assert.deepEqual(parseSrtCues(raw), [
    { text: '无序号', startTimeMs: 1500, durationMs: 550 },
  ]);
  const long = `9
01:02:03,004 --> 01:02:05,004
一小时后
`;
  assert.deepEqual(parseSrtCues(long), [
    { text: '一小时后', startTimeMs: 3723004, durationMs: 2000 },
  ]);
});

test('parseSrtCues：垃圾输入与非法块全部丢弃', () => {
  assert.deepEqual(parseSrtCues(''), []);
  assert.deepEqual(parseSrtCues('   \n\n '), []);
  assert.deepEqual(parseSrtCues(undefined), []);
  assert.deepEqual(parseSrtCues(null), []);
  assert.deepEqual(parseSrtCues('随便一段普通文本\n没有时码'), []);
  // end <= start 丢弃
  assert.deepEqual(parseSrtCues('1\n00:00:03,000 --> 00:00:03,000\n零时长'), []);
  assert.deepEqual(parseSrtCues('1\n00:00:04,000 --> 00:00:02,000\n倒序'), []);
  // 时间行后无正文丢弃
  assert.deepEqual(parseSrtCues('1\n00:00:01,000 --> 00:00:02,000'), []);
  // 混合：坏块丢弃、好块保留
  const mixed = `坏块没有时码

2
00:00:05,000 --> 00:00:06,500
保留我
`;
  assert.deepEqual(parseSrtCues(mixed), [
    { text: '保留我', startTimeMs: 5000, durationMs: 1500 },
  ]);
});

test('isSrtContent：与 parseSrtCues 一致', () => {
  assert.equal(isSrtContent(SAMPLE), true);
  assert.equal(isSrtContent('普通文本'), false);
  assert.equal(isSrtContent(''), false);
});

test('captionSlicesFromText：SRT 按 cue 时间轴展开', () => {
  const raw = `1
00:00:01,200 --> 00:00:03,500
你好

2
00:00:04,000 --> 00:00:05,000
世界
`;
  assert.deepEqual(captionSlicesFromText({ content: raw }), [
    { text: '你好', startTimeMs: 1200, durationMs: 2300 },
    { text: '世界', startTimeMs: 4000, durationMs: 1000 },
  ]);
});

test('captionSlicesFromText：contentFormat=srt 优先，解析为空不回退普通切片', () => {
  assert.deepEqual(captionSlicesFromText({ content: '不是 srt', contentFormat: 'srt' }), []);
  assert.deepEqual(captionSlicesFromText({ content: SAMPLE, contentFormat: 'srt' }), [
    { text: '大家好，欢迎来到我的频道', startTimeMs: 1200, durationMs: 2300 },
  ]);
});

test('captionSlicesFromText：普通文本保持 3 秒整段切片与累加起点', () => {
  assert.deepEqual(captionSlicesFromText({ content: '一段口播稿' }), [
    { text: '一段口播稿', startTimeMs: 0, durationMs: 3000 },
  ]);
  assert.deepEqual(captionSlicesFromText({ content: '第二段', startTimeMs: 6000 }), [
    { text: '第二段', startTimeMs: 6000, durationMs: 3000 },
  ]);
  assert.deepEqual(
    captionSlicesFromText({ content: '自定义时长', sliceDurationMs: 1500 }),
    [{ text: '自定义时长', startTimeMs: 0, durationMs: 1500 }],
  );
  assert.deepEqual(captionSlicesFromText({ content: '   ' }), []);
});
