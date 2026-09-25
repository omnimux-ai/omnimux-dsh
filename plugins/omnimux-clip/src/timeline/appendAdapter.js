/**
 * OmniMux Clip 视频剪辑时间轴自动追加适配器
 * @module omnimux-clip/timeline/appendAdapter
 * 实现：主视频轨自动检索、锁定轨道保护降级、0 间距无缝贴合计算、时间轴总时长与播放头自适应吸附
 */

import fs from 'node:fs';

/**
 * 校验剪辑工程是否处于编辑就绪态
 * @param {Object} projectState - 剪辑工程当前快照
 * @returns {{ isReady: boolean, reason?: string }}
 */
export function checkProjectEditorReady(projectState) {
  if (!projectState || !projectState.id) {
    return {
      isReady: false,
      reason: '未检测到活跃的剪辑工程，请先新建或打开项目并进入编辑器页面。'
    };
  }
  if (!projectState.schema || !Array.isArray(projectState.schema.tracks)) {
    return {
      isReady: false,
      reason: '剪辑工程时间轴轨道尚未初始化完成。'
    };
  }
  return { isReady: true };
}

/**
 * 计算将新视频以 0 间距追加至主视频轨末尾的原子操作包
 * @param {Object} options
 * @param {Object} options.currentSchema - 当前工程的 TimelineSchema
 * @param {string} options.videoFilePath - 本地无损 MP4 文件路径
 * @param {string} [options.title='新成片段'] - 片段显示名称
 * @param {number} [options.durationSec=10] - 视频时长
 * @returns {Object} 包含原子变更指令、新切片起始时间点、时间轴总时长与播放指针位置
 */
export function createAppendClipOperation({
  currentSchema,
  videoFilePath,
  title = '新成片段',
  durationSec = 10
}) {
  if (!videoFilePath || !fs.existsSync(videoFilePath)) {
    throw new Error(`无法找到待插入的成片文件: ${videoFilePath}`);
  }

  const tracks = currentSchema?.tracks || [];
  // 1. 优先定位主视频轨道 track_video_main（未锁定），若锁定则寻找其他未锁定的 video 轨
  let targetTrack = tracks.find((t) => t.id === 'track_video_main' && !t.isLocked);
  if (!targetTrack) {
    targetTrack = tracks.find((t) => t.type === 'video' && !t.isLocked);
  }

  if (!targetTrack) {
    throw new Error('未找到可用的未锁定视频轨道，请检查轨道是否被锁定。');
  }

  // 2. 精准计算轨道末尾时间点 (以 0 间距紧密贴合前序切片尾部，杜绝黑场缝隙)
  const existingClips = targetTrack.clips || [];
  let lastEndMs = 0;
  for (const clip of existingClips) {
    const end = (clip.startTimeMs || 0) + (clip.durationMs || 0);
    if (end > lastEndMs) lastEndMs = end;
  }

  const durationMs = Math.round(durationSec * 1000);
  const startTimeMs = lastEndMs; // 0 间距无缝贴合
  const mediaId = `media_veo_${Date.now()}`;
  const clipId = `clip_veo_${Date.now()}`;

  const operations = [
    {
      type: 'import_media',
      path: videoFilePath,
      name: `${title}.mp4`,
      mediaType: 'video',
      durationSec
    },
    {
      type: 'add_clip',
      trackId: targetTrack.id,
      clipId,
      mediaId,
      startTimeMs,
      durationMs,
      sourceStartMs: 0,
      sourceEndMs: durationMs
    }
  ];

  return {
    success: true,
    trackId: targetTrack.id,
    clipId,
    mediaId,
    startTimeMs,
    durationMs,
    newTotalDurationMs: startTimeMs + durationMs,
    operations,
    playheadSeekMs: startTimeMs // 播放头自动吸附至新切片起点
  };
}
