import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkProjectEditorReady, createAppendClipOperation } from './appendAdapter.js';

test('appendAdapter 测试套件', async (t) => {

  await t.test('checkProjectEditorReady 状态门禁检查', () => {
    assert.equal(checkProjectEditorReady(null).isReady, false);
    assert.equal(checkProjectEditorReady({ id: '' }).isReady, false);
    assert.equal(checkProjectEditorReady({ id: 'p1', schema: null }).isReady, false);
    assert.equal(checkProjectEditorReady({ id: 'p1', schema: { tracks: [] } }).isReady, true);
  });

  await t.test('createAppendClipOperation 0 间距末尾追加计算', () => {
    // 构造临时测试文件
    const tmpVideo = path.resolve('.workbuddy/demo/media/google_vids_korean_skincare.mp4');
    if (!fs.existsSync(tmpVideo)) {
      // 保底临时文件用于纯逻辑断言
      fs.mkdirSync(path.dirname(tmpVideo), { recursive: true });
      fs.writeFileSync(tmpVideo, 'test-video-dummy');
    }

    const schema = {
      tracks: [
        {
          id: 'track_video_main',
          type: 'video',
          isLocked: false,
          clips: [
            { id: 'c1', startTimeMs: 0, durationMs: 5000 },
            { id: 'c2', startTimeMs: 5000, durationMs: 3000 }
          ]
        }
      ]
    };

    const res = createAppendClipOperation({
      currentSchema: schema,
      videoFilePath: tmpVideo,
      title: '防晒广告切片',
      durationSec: 10
    });

    assert.equal(res.success, true);
    assert.equal(res.trackId, 'track_video_main');
    assert.equal(res.startTimeMs, 8000, '必须紧贴前序片段 5000+3000=8000ms 末尾');
    assert.equal(res.durationMs, 10000);
    assert.equal(res.newTotalDurationMs, 18000);
    assert.equal(res.playheadSeekMs, 8000, '播放指针必须吸附至新切片起点');
    assert.equal(res.operations.length, 2);
  });

  await t.test('createAppendClipOperation 轨道锁定降级保护', () => {
    const tmpVideo = path.resolve('.workbuddy/demo/media/google_vids_korean_skincare.mp4');
    const lockedSchema = {
      tracks: [
        { id: 'track_video_main', type: 'video', isLocked: true, clips: [] },
        { id: 'track_video_v2', type: 'video', isLocked: false, clips: [] }
      ]
    };

    const res = createAppendClipOperation({
      currentSchema: lockedSchema,
      videoFilePath: tmpVideo,
      title: '辅轨切片',
      durationSec: 5
    });

    assert.equal(res.success, true);
    assert.equal(res.trackId, 'track_video_v2', '主轨被锁定后自动寻找可用辅轨');
    assert.equal(res.startTimeMs, 0);
  });

});
