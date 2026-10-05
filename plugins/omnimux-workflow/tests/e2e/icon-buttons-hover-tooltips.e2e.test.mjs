import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const previewPath = join(here, '../../src/canvas/editor/components/MaterialNode/AudioPreview.tsx');
const dictZhPath = join(here, '../../src/canvas/i18n/dict.zh.ts');
const dictEnPath = join(here, '../../src/canvas/i18n/dict.en.ts');

const previewSrc = readFileSync(previewPath, 'utf8');
const dictZh = readFileSync(dictZhPath, 'utf8');
const dictEn = readFileSync(dictEnPath, 'utf8');

test('E2E: 纯图标按钮鼠标悬停提示与冗余重试移除契约 (Issue #3083)', () => {
  // 1. 核心播放按钮必须具备动态悬停提示（播放 / 暂停）
  assert.ok(
    previewSrc.includes("title={t(playing ? 'audio.pause' : 'audio.play')}"),
    '核心播放/暂停按钮必须具备对应的 title 悬停提示',
  );

  // 2. 波形重试按钮必须彻底移除，不可作为图标干扰用户
  assert.equal(
    previewSrc.includes("wf-audio__retry"),
    false,
    '波形重试按钮必须彻底移除，避免旋转图标混淆',
  );

  // 3. 替换素材按钮必须具备悬停提示
  assert.ok(
    previewSrc.includes("title={t('node.replace')}"),
    '素材替换按钮必须具备对应的 title 悬停提示',
  );

  // 4. 保存/下载按钮必须具备悬停提示
  assert.ok(
    previewSrc.includes("title={t('audio.save')}"),
    '保存/下载按钮必须具备对应的 title 悬停提示',
  );

  // 5. 国际化词条完整性：中文与英文字典均需定义相关词条
  for (const key of ['audio.play', 'audio.pause', 'audio.save', 'node.replace']) {
    assert.match(dictZh, new RegExp(`'${key}':`), `中文字典必须包含 ${key}`);
    assert.match(dictEn, new RegExp(`'${key}':`), `英文字典必须包含 ${key}`);
  }
});
