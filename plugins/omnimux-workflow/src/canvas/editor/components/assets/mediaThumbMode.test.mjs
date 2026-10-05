/**
 * 缩略图媒体类型分派测试（Issue #3107）。
 *
 * 钉死两件事：
 *  1. 本地素材地址 `/api/local-file?path=<绝对路径>` 的真实扩展名藏在查询串里，
 *     必须被识别出来，否则视频素材会被送进 `<img>` 变成破图；
 *  2. 判定顺序为「地址扩展名优先、声明类型兜底」，因为素材节点的声明类型可能
 *     是宽泛容器类型（`material`），而远端产物地址常无扩展名、只能靠声明类型。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extensionCandidates,
  extensionOfPath,
  resolveThumbMode,
} from './mediaThumbMode.ts';

test('extensionOfPath 取末段扩展名', async (t) => {
  await t.test('普通路径', () => {
    assert.equal(extensionOfPath('/Users/x/Downloads/a.MP4'), 'mp4');
    assert.equal(extensionOfPath('C:\\media\\clip.mov'), 'mov');
    assert.equal(extensionOfPath('shot.webp'), 'webp');
  });

  await t.test('无扩展名 / 隐藏文件 / 结尾点号', () => {
    assert.equal(extensionOfPath('/api/local-file'), '');
    assert.equal(extensionOfPath('/a/b/.hidden'), '');
    assert.equal(extensionOfPath('trailing.'), '');
    assert.equal(extensionOfPath(''), '');
  });
});

test('extensionCandidates 穿透查询串里的真实路径', async (t) => {
  await t.test('local-file 地址解码 path 参数', () => {
    const url = '/omnimux-workflow/api/local-file?path=%2FUsers%2Fx%2FD%2Fa.mp4';
    assert.deepEqual(extensionCandidates(url), ['mp4']);
  });

  await t.test('path 参数未编码时同样可用', () => {
    assert.deepEqual(
      extensionCandidates('/api/local-file?path=/Users/x/D/photo.png'),
      ['png'],
    );
  });

  await t.test('忽略 hash 片段与无关参数', () => {
    assert.deepEqual(
      extensionCandidates('/api/local-file?token=abc&path=%2Ftmp%2Fb.webm#t=1'),
      ['webm'],
    );
  });

  await t.test('路径本身带扩展名时优先取路径', () => {
    assert.deepEqual(extensionCandidates('/media/a.jpg?path=/tmp/b.mp4'), ['jpg', 'mp4']);
  });
});

test('resolveThumbMode 分派', async (t) => {
  await t.test('导入的视频素材 → video（真实缺陷回归）', () => {
    assert.equal(
      resolveThumbMode(
        'material',
        '/omnimux-workflow/api/local-file?path=%2FUsers%2Fx%2FDownloads%2Fmusic-space-stars-slide-1.mp4',
      ),
      'video',
    );
  });

  await t.test('导入的图片素材 → image', () => {
    assert.equal(
      resolveThumbMode(
        'material',
        '/omnimux-workflow/api/local-file?path=%2FUsers%2Fx%2FDownloads%2FHTufQo8a4AA6tsR.jpeg',
      ),
      'image',
    );
  });

  await t.test('导入的音频素材 → none（回落类型图标）', () => {
    assert.equal(
      resolveThumbMode('audio', '/api/local-file?path=%2Ftmp%2Fvoice.mp3'),
      'none',
    );
  });

  await t.test('无扩展名的远端产物地址靠声明类型兜底', () => {
    assert.equal(resolveThumbMode('video', 'https://omnimux.ai/v1/videos/task_x/content'), 'video');
    assert.equal(resolveThumbMode('image', 'https://omnimux.ai/v1/images/task_x/content'), 'image');
  });

  await t.test('无扩展名且声明类型不可判定 → none', () => {
    assert.equal(resolveThumbMode('material', 'https://omnimux.ai/v1/files/task_x/content'), 'none');
    assert.equal(resolveThumbMode(undefined, 'https://omnimux.ai/v1/files/task_x/content'), 'none');
  });

  await t.test('空地址一律 none', () => {
    assert.equal(resolveThumbMode('video', ''), 'none');
    assert.equal(resolveThumbMode('video', '   '), 'none');
    assert.equal(resolveThumbMode('video', undefined), 'none');
    assert.equal(resolveThumbMode('video', null), 'none');
  });

  await t.test('地址扩展名优先于声明类型', () => {
    assert.equal(resolveThumbMode('image', '/api/local-file?path=%2Ftmp%2Fclip.mp4'), 'video');
    assert.equal(resolveThumbMode('video', '/api/local-file?path=%2Ftmp%2Fcover.png'), 'image');
  });

  await t.test('大写扩展名与 video_composition 容器类型', () => {
    assert.equal(resolveThumbMode('video_composition', '/api/local-file?path=%2Ftmp%2FA.MOV'), 'video');
  });
});
