/**
 * Unit tests for cfg/controlKind（2026-09-07 全模态收敛 / T01）。
 *
 * 仅锁定控件选型矩阵（不含 VideoParamWriteKey——视频写集白名单仍由
 * videoParams/controlKind.test.mjs 锁定）。纯函数，无 DOM。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CJK_LONG_THRESHOLD,
  estimateSegmentOverflow,
  estimateTextPx,
  resolveControlKind,
} from './controlKind.ts';

describe('cfg/controlKind - 控件选型矩阵', () => {
  it('长标签 4 项生成方式 → choice-tile（架构输入契约）', () => {
    const kind = resolveControlKind({
      cardinality: 4,
      labels: ['文生视频', '首帧生视频', '首尾帧生视频', '全能参考生视频'],
    });
    assert.equal(kind, 'choice-tile');
  });

  it('短标签 2 项清晰度 → segment（架构输入契约）', () => {
    const kind = resolveControlKind({ cardinality: 2, labels: ['480p', '720p'] });
    assert.equal(kind, 'segment');
  });

  it('两态布尔（基数 2）→ compact-toggle；非常规布尔基数 → inline-switch', () => {
    assert.equal(
      resolveControlKind({ cardinality: 2, labels: ['有声', '无声'], boolean: true }),
      'compact-toggle',
    );
    assert.equal(
      resolveControlKind({ cardinality: 3, labels: ['a', 'b', 'c'], boolean: true }),
      'inline-switch',
    );
  });

  it('几何语义 → aspect-grid；连续数值 → slider', () => {
    assert.equal(
      resolveControlKind({ cardinality: 7, labels: ['16:9'], geometric: true }),
      'aspect-grid',
    );
    assert.equal(
      resolveControlKind({ cardinality: 0, labels: [], continuous: true }),
      'slider',
    );
  });

  it('基数 ≥6 且短标签不溢出 → select', () => {
    const kind = resolveControlKind({
      cardinality: 6,
      labels: ['mp4', 'mov', 'webm', 'gif', 'mkv', 'avi'],
    });
    assert.equal(kind, 'select');
  });

  it('基数 ≥4 且单行溢出（即使无长汉字） → choice-tile', () => {
    const longAscii = 'aaaaaaaaaaaaaaaaaaaa'; // 20 × 7px = 140px/项
    const kind = resolveControlKind({
      cardinality: 4,
      labels: [longAscii, longAscii, longAscii, longAscii],
    });
    assert.equal(kind, 'choice-tile');
  });

  it('长标签阈值：>4 汉字才算长（4 字仍走 segment 判定）', () => {
    assert.equal(CJK_LONG_THRESHOLD, 4);
    const kind = resolveControlKind({
      cardinality: 4,
      labels: ['文生视频', '图生视频', '首尾帧生', '参考生成'],
    });
    assert.equal(kind, 'segment');
    const kindLong = resolveControlKind({
      cardinality: 2,
      labels: ['文生视频', '首帧生视频'],
    });
    assert.equal(kindLong, 'choice-tile');
  });

  it('estimateSegmentOverflow 边界：sum + 4 > container', () => {
    assert.equal(estimateSegmentOverflow(['480p', '720p'], 328), false);
    assert.equal(estimateSegmentOverflow(['480p', '720p'], 90), true);
  });

  it('estimateTextPx：CJK 12px、ASCII 7px', () => {
    assert.equal(estimateTextPx('有声'), 24);
    assert.equal(estimateTextPx('16:9'), 28);
    assert.equal(estimateTextPx(''), 0);
  });
});
