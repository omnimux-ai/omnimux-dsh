import { Input, BufferSource, MP4, QTFF, WEBM } from 'mediabunny'
import { OmnimuxError } from './errors.js'

/** Bounded local demuxing, no network and no installed external executable. */
export async function inspectVideoBytes(bytes) {
  const input = new Input({ formats: [MP4, QTFF, WEBM], source: new BufferSource(bytes) })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new OmnimuxError('omnimux-invalid-request','文件没有有效视频轨道')
    const tracks = await input.getVideoTracks()
    if (tracks.length !== 1) throw new OmnimuxError('omnimux-invalid-request','参考视频需要单一视频轨道')
    const codec = await video.getCodec()
    const duration = await input.computeDuration()
    const width = await video.getDisplayWidth()
    const height = await video.getDisplayHeight()
    const stats = await video.computePacketStats(256)
    const audio = await input.getAudioTracks()
    return { codec, duration, width, height, frameRate: stats.averagePacketRate, packetCount: stats.packetCount,
      audioCodecs: await Promise.all(audio.map(track=>track.getCodec())) }
  } finally { input.dispose() }
}
