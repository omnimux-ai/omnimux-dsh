import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMediaViewerStore } from '../../src/client/media-viewer/media-viewer-store.js';
import { MEDIA_VIEWER_CSS } from '../../src/client/media-viewer/styles.js';

test('e2e: canvas image annotations, consecutive numbering, and dual-channel model context protocol', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  const doc = dom.window.document;
  globalThis.document = doc;
  globalThis.window = dom.window;

  const store = createMediaViewerStore();
  const mediaId = 'media_img_test_1';

  // 1. Initial State: not annotating, no annotations
  assert.equal(store.getSnapshot().isAnnotating, false);
  assert.deepEqual(store.getAnnotations(mediaId), []);

  // 2. Click "+ 添加评论": enter annotating mode
  store.setAnnotating(true);
  assert.equal(store.getSnapshot().isAnnotating, true);

  // 3. User clicks on image coordinate #1 (e.g. 51.2%, 27.4%)
  const draft1 = store.addDraftAnnotation(mediaId, { xPercent: 51.2, yPercent: 27.4 });
  assert.ok(draft1);
  assert.equal(draft1.index, 1);
  assert.equal(draft1.status, 'draft');
  assert.equal(draft1.xPercent, 51.2);
  assert.equal(draft1.yPercent, 27.4);

  // 4. User inputs text and commits annotation #1
  store.commitAnnotation(mediaId, draft1.id, '帮我换一个人');
  const annotations1 = store.getAnnotations(mediaId);
  assert.equal(annotations1.length, 1);
  assert.equal(annotations1[0].status, 'saved');
  assert.equal(annotations1[0].text, '帮我换一个人');
  assert.equal(annotations1[0].index, 1);

  // Mode remains annotating for consecutive tagging
  assert.equal(store.getSnapshot().isAnnotating, true);

  // 5. User clicks on image coordinate #2 (e.g. 68.5%, 29.1%)
  const draft2 = store.addDraftAnnotation(mediaId, { xPercent: 68.5, yPercent: 29.1 });
  assert.ok(draft2);
  assert.equal(draft2.index, 2);
  assert.equal(draft2.status, 'draft');

  // 6. User commits annotation #2
  store.commitAnnotation(mediaId, draft2.id, '穿吊带');
  const annotations2 = store.getAnnotations(mediaId);
  assert.equal(annotations2.length, 2);
  assert.equal(annotations2[1].status, 'saved');
  assert.equal(annotations2[1].text, '穿吊带');
  assert.equal(annotations2[1].index, 2);

  // 7. Test dual-channel model prompt generation
  const modelPrompt = store.formatAnnotationsPrompt(mediaId);
  assert.match(modelPrompt, /图片局部修改指示（共 2 处标注）/);
  assert.match(modelPrompt, /标记 ❶ \(编号 1\).*51\.2%.*27\.4%.*帮我换一个人/);
  assert.match(modelPrompt, /标记 ❶ \(编号 2\).*68\.5%.*29\.1%.*穿吊带/);

  // 8. Verify CSS styles for custom cursor, pin, popover, and composer attachment
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-mv-btn--comment/,
    'Top toolbar comment button must exist'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-mv-display\.is-annotating\s*\{[^}]*cursor:\s*url\(/,
    'Custom bubble pointer cursor must be applied when is-annotating'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-mv-annotation-pin\s*\{[^}]*border-radius:\s*50%\s*50%\s*50%\s*4px/,
    'Pin must have chat-bubble circular shape'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-mv-annotation-popover\s*\{[^}]*border-radius:\s*9999px/,
    'Input popover must have pill shape'
  );
  assert.match(
    MEDIA_VIEWER_CSS,
    /\.omx-mv-composer-attachment/,
    'Native composer attachment badge must be styled'
  );

  // 9. Verify deleting an annotation re-indexes remaining annotations
  store.removeAnnotation(mediaId, draft1.id);
  const remaining = store.getAnnotations(mediaId);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, draft2.id);
  assert.equal(remaining[0].index, 1, 'Remaining annotation must be reindexed to 1');

  // 10. Verify clear annotations
  store.clearAnnotations(mediaId);
  assert.equal(store.getAnnotations(mediaId).length, 0);
  assert.equal(store.formatAnnotationsPrompt(mediaId), '');
});
