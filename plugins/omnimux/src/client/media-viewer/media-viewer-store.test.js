import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaViewerStore, formatTimelineDate } from './media-viewer-store.js';

test('formatTimelineDate formats timestamp to YYYY年M月D日 HH:mm', () => {
  // 2026-09-13 20:29:00 local time
  const d = new Date(2026, 8, 13, 20, 29, 0);
  const str = formatTimelineDate(d.getTime());
  assert.equal(str, '2026年9月13日 20:29');
});

test('media-viewer-store: addMedia and activeId tracking', () => {
  const store = createMediaViewerStore();
  assert.equal(store.getSnapshot().mediaList.length, 0);
  assert.equal(store.getSnapshot().activeId, null);

  const item1 = store.addMedia({ url: 'http://example.com/1.jpg', title: '图1' });
  assert.equal(store.getSnapshot().mediaList.length, 1);
  assert.equal(store.getSnapshot().activeId, item1.id);

  const item2 = store.addMedia({ url: 'http://example.com/2.jpg', title: '图2' });
  assert.equal(store.getSnapshot().mediaList.length, 2);
  // activeId stays item1 unless changed
  assert.equal(store.getSnapshot().activeId, item1.id);

  store.setActiveId(item2.id);
  assert.equal(store.getSnapshot().activeId, item2.id);
});

test('media-viewer-store: view modes and zoom cycling', () => {
  const store = createMediaViewerStore();
  assert.equal(store.getSnapshot().subViewMode, 'single');
  assert.equal(store.getSnapshot().layoutMode, '3col');

  store.setSubViewMode('grid');
  assert.equal(store.getSnapshot().subViewMode, 'grid');

  store.setLayoutMode('2col');
  assert.equal(store.getSnapshot().layoutMode, '2col');

  assert.equal(store.getSnapshot().zoom, 100);
  store.cycleZoom(); // 100 -> 150
  assert.equal(store.getSnapshot().zoom, 150);
  store.cycleZoom(); // 150 -> 50
  assert.equal(store.getSnapshot().zoom, 50);
  store.cycleZoom(); // 50 -> 70
  assert.equal(store.getSnapshot().zoom, 70);
});

test('media-viewer-store: timeline grouping supports multi-card generation in single timestamp group', () => {
  const store = createMediaViewerStore();
  const ts1 = new Date(2026, 8, 13, 20, 24, 0).getTime();
  const ts2 = new Date(2026, 8, 13, 20, 29, 0).getTime();

  // Single generation at 20:24
  store.addMedia({ id: 'm1', timestamp: ts1, url: 'http://example.com/m1.jpg', groupId: 'batch1' });

  // Multi-generation at 20:29 (two items in same batch/groupId)
  store.addMedia({ id: 'm2_a', timestamp: ts2, url: 'http://example.com/m2_a.jpg', groupId: 'batch2' });
  store.addMedia({ id: 'm2_b', timestamp: ts2, url: 'http://example.com/m2_b.jpg', groupId: 'batch2' });

  const groups = store.getTimelineGroups();
  assert.equal(groups.length, 2);

  // Group 1: 20:24, 1 item
  assert.equal(groups[0].timeKey, '2026年9月13日 20:24');
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].id, 'm1');

  // Group 2: 20:29, 2 items
  assert.equal(groups[1].timeKey, '2026年9月13日 20:29');
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[1].items[0].id, 'm2_a');
  assert.equal(groups[1].items[1].id, 'm2_b');
});

test('media-viewer-store: generating state subscription', () => {
  const store = createMediaViewerStore();
  let callCount = 0;
  const unsub = store.subscribe((s) => {
    callCount++;
  });

  store.setGenerating(true, { taskId: 'task_123' });
  assert.equal(store.getSnapshot().isGenerating, true);
  assert.equal(store.getSnapshot().generatingTask?.taskId, 'task_123');
  assert.equal(callCount, 1);

  store.setGenerating(false);
  assert.equal(store.getSnapshot().isGenerating, false);
  assert.equal(callCount, 2);

  unsub();
  store.setGenerating(true);
  assert.equal(callCount, 2);
});

test('media-viewer-store: annotations lifecycle, consecutive indexing, and prompt formatting', () => {
  const store = createMediaViewerStore();
  const mediaId = 'img_test_1';

  // 1. Initial state
  assert.equal(store.getSnapshot().isAnnotating, false);
  assert.deepEqual(store.getAnnotations(mediaId), []);

  store.setAnnotating(true);
  assert.equal(store.getSnapshot().isAnnotating, true);

  // 2. Add draft annotation #1
  const draft1 = store.addDraftAnnotation(mediaId, { xPercent: 51.2, yPercent: 27.4 });
  assert.ok(draft1);
  assert.equal(draft1.index, 1);
  assert.equal(draft1.status, 'draft');

  // 3. Commit annotation #1
  store.commitAnnotation(mediaId, draft1.id, '帮我换一个人');
  const listAfter1 = store.getAnnotations(mediaId);
  assert.equal(listAfter1.length, 1);
  assert.equal(listAfter1[0].text, '帮我换一个人');
  assert.equal(listAfter1[0].status, 'saved');
  assert.equal(listAfter1[0].index, 1);

  // 4. Consecutive add draft annotation #2
  const draft2 = store.addDraftAnnotation(mediaId, { xPercent: 68.5, yPercent: 29.1 });
  assert.ok(draft2);
  assert.equal(draft2.index, 2);
  assert.equal(draft2.status, 'draft');

  // 5. Commit annotation #2
  store.commitAnnotation(mediaId, draft2.id, '穿吊带');
  const listAfter2 = store.getAnnotations(mediaId);
  assert.equal(listAfter2.length, 2);
  assert.equal(listAfter2[1].text, '穿吊带');
  assert.equal(listAfter2[1].status, 'saved');
  assert.equal(listAfter2[1].index, 2);

  // 6. Test structured model prompt formatting
  const prompt = store.formatAnnotationsPrompt(mediaId);
  assert.match(prompt, /图片局部修改指示（共 2 处标注）/);
  assert.match(prompt, /编号 1.*51\.2%.*27\.4%.*帮我换一个人/);
  assert.match(prompt, /编号 2.*68\.5%.*29\.1%.*穿吊带/);

  // 7. Remove annotation #1 and check reindexing
  store.removeAnnotation(mediaId, draft1.id);
  const remaining = store.getAnnotations(mediaId);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, draft2.id);
  assert.equal(remaining[0].index, 1); // reindexed to 1

  // 8. Clear annotations
  store.clearAnnotations(mediaId);
  assert.equal(store.getAnnotations(mediaId).length, 0);
  assert.equal(store.formatAnnotationsPrompt(mediaId), '');
});
