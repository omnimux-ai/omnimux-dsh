/**
 * 对话气泡多图结果：右侧缩略图栏高度锁在主图内（Issue #2101）
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MEDIA_VIEWER_CSS } from './styles.js';

function galleryBlock(css) {
  const match = css.match(/\.omx-chat-media-tail--gallery\s*\{[^}]*\}/s);
  assert.ok(match, 'gallery container rule must exist');
  return match[0];
}

function railBlock(css) {
  const match = css.match(/\.omx-chat-media-tail__rail\s*\{[^}]*\}/s);
  assert.ok(match, 'thumbnail rail rule must exist');
  return match[0];
}

function mainBlock(css) {
  const match = css.match(/\.omx-chat-media-tail__main\s*\{[^}]*\}/s);
  assert.ok(match, 'main stage rule must exist');
  return match[0];
}

describe('对话多图结果缩略图栏高度锁在主图内 (Issue #2101)', () => {
  it('AC-1: 画廊高度由主图决定，不随缩略图张数撑开', () => {
    const gallery = galleryBlock(MEDIA_VIEWER_CSS);
    assert.match(gallery, /height:\s*auto\s*!important/);
    assert.match(gallery, /overflow:\s*hidden\s*!important/);
    assert.match(gallery, /position:\s*relative\s*!important/);
    assert.match(gallery, /align-items:\s*flex-start\s*!important/);
    assert.doesNotMatch(gallery, /align-items:\s*stretch/);
  });

  it('AC-2: 右侧栏贴齐主图上下边并内部滚动', () => {
    const rail = railBlock(MEDIA_VIEWER_CSS);
    assert.match(rail, /position:\s*absolute/);
    assert.match(rail, /top:\s*0/);
    assert.match(rail, /bottom:\s*0/);
    assert.match(rail, /overflow-y:\s*auto/);
    assert.doesNotMatch(rail, /height:\s*100%/);
  });

  it('AC-3: 主图按自身比例决定高度，不把栏内容算进父级', () => {
    const main = mainBlock(MEDIA_VIEWER_CSS);
    assert.match(main, /height:\s*auto/);
    assert.doesNotMatch(main, /height:\s*100%/);
  });
});
