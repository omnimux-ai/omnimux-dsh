import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLibraryFilesFromNodes } from './extractLibraryFiles.ts';

test('extractLibraryFilesFromNodes: 收录 realPath / mediaAssets.path / local-file URL', () => {
  const files = extractLibraryFilesFromNodes([
    { id: 'n1', data: { realPath: '/tmp/night.png', title: '夜景' } },
    { id: 'n2', data: { mediaAssets: [{ path: '/tmp/clip.mp4' }] } },
    {
      id: 'n3',
      data: { previewUrl: '/omnimux-workflow/api/local-file?path=%2Ftmp%2Fvoice.wav' },
    },
  ]);
  assert.deepEqual(files.map((file) => file.real_path), [
    '/tmp/night.png',
    '/tmp/clip.mp4',
    '/tmp/voice.wav',
  ]);
  assert.deepEqual(files.map((file) => file.original_name), ['night.png', 'clip.mp4', 'voice.wav']);
});

test('extractLibraryFilesFromNodes: blob / 远程预览不入库', () => {
  const files = extractLibraryFilesFromNodes([
    { id: 'n1', data: { previewUrl: 'blob:http://localhost/abc' } },
    { id: 'n2', data: { mediaUrl: 'https://cdn.example/out.png' } },
    { id: 'n3', data: { content: 'plain text' } },
  ]);
  assert.deepEqual(files, []);
});

test('extractLibraryFilesFromNodes: 显式文件名优先，节点标题不替代真实文件名', () => {
  const files = extractLibraryFilesFromNodes([
    { id: 'n1', data: { realPath: '/tmp/原始视频.mp4', title: '中文标题', label: '标签', name: '节点名' } },
    { id: 'n2', data: { realPath: 'C:\\media\\clip.mp4', label: 'Windows 视频' } },
    { id: 'n3', data: { realPath: '/tmp/stored.png', originalName: '  原始图片.png  ', title: '图片标题' } },
    { id: 'n4', data: { real_path: '/tmp/fallback.wav', originalName: '  ', name: '音频节点' } },
  ]);
  assert.deepEqual(files.map((file) => file.original_name), [
    '原始视频.mp4', 'clip.mp4', '原始图片.png', 'fallback.wav',
  ]);
});
