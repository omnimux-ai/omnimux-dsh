/**
 * Unit tests for controlKind (2026-09-07 配置面板 UI 收敛 / T01)。
 *
 * 锁定控件选型矩阵与写入白名单防御断言（纯函数，无 DOM）。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CJK_LONG_THRESHOLD,
  estimateSegmentOverflow,
  estimateTextPx,
  resolveControlKind,
} from './controlKind.ts';
import { assertVideoParamWriteKey } from './types.ts';

describe('controlKind - 控件选型矩阵', () => {
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
    // 4 个 4 字短标签不溢出 → segment
    const kind = resolveControlKind({
      cardinality: 4,
      labels: ['文生视频', '图生视频', '首尾帧生', '参考生成'],
    });
    assert.equal(kind, 'segment');
    // 任一标签 5 字 → choice-tile
    const kindLong = resolveControlKind({
      cardinality: 2,
      labels: ['文生视频', '首帧生视频'],
    });
    assert.equal(kindLong, 'choice-tile');
  });

  it('estimateSegmentOverflow 边界：sum + 4 > container', () => {
    // 两项 480p/720p：4×7+16=44/项 → 88+4=92 < 328 不溢出
    assert.equal(estimateSegmentOverflow(['480p', '720p'], 328), false);
    // 容器极窄时溢出
    assert.equal(estimateSegmentOverflow(['480p', '720p'], 90), true);
  });

  it('estimateTextPx：CJK 12px、ASCII 7px', () => {
    assert.equal(estimateTextPx('有声'), 24);
    assert.equal(estimateTextPx('16:9'), 28);
    assert.equal(estimateTextPx(''), 0);
  });
});

describe('assertVideoParamWriteKey - 写入白名单防御', () => {
  it('白名单 key 不抛错', () => {
    for (const key of ['operation', 'aspectRatio', 'resolution', 'duration', 'sound', 'seed']) {
      assert.doesNotThrow(() => assertVideoParamWriteKey(key));
    }
  });

  it('generationMode 被明确禁止', () => {
    assert.throws(() => assertVideoParamWriteKey('generationMode'), /generationMode/);
  });

  it('未知 key 抛错', () => {
    assert.throws(() => assertVideoParamWriteKey('bogusField'), /bogusField/);
  });
});
