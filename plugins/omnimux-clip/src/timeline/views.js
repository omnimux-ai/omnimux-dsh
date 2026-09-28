import { ClipDomainError } from '../errors.js'
import { msToSec, optionalSecToMs } from './time.js'

const VIEWS = new Set(['summary', 'tracks', 'clips', 'full'])

/**
 * Project a TimelineSchema for `clip_get`. Agent-facing times are seconds.
 *
 * @param {object} envelope  projectStore.load() result
 * @param {{
 *   view?: string,
 *   trackId?: string,
 *   clipId?: string,
 *   fromSec?: number,
 *   toSec?: number,
 * }} query
 */
export function projectView(envelope, query = {}) {
  const view = query.view || 'summary'
  if (!VIEWS.has(view)) {
    throw ClipDomainError.invalidJson(`view must be one of ${[...VIEWS].join('|')}`)
  }
  const schema = envelope.schema
  const fromMs = optionalSecToMs(query.fromSec, 'fromSec')
  const toMs = optionalSecToMs(query.toSec, 'toSec')
  const tracks = filterTracks(schema.tracks || [], {
    trackId: query.trackId,
    clipId: query.clipId,
    fromMs,
    toMs,
  })

  const durationMs = schema.canvasConfig?.durationMs || 0
  const clipCount = (schema.tracks || []).reduce((sum, track) => sum + (track.clips?.length || 0), 0)
  const base = {
    projectId: schema.projectId || envelope.id || 'clip-project',
    view,
    durationSec: msToSec(durationMs),
    fps: schema.canvasConfig?.fps || 30,
    aspectRatio: schema.canvasConfig?.aspectRatio || '16:9',
    width: schema.canvasConfig?.width ?? 1920,
    height: schema.canvasConfig?.height ?? 1080,
    playheadSec: msToSec(envelope.playheadMs || 0),
    isPlaying: Boolean(envelope.isPlaying),
    trackCount: (schema.tracks || []).length,
    clipCount,
  }

  if (view === 'summary') return base

  if (view === 'tracks') {
    return {
      ...base,
      tracks: tracks.map((track) => ({
        id: track.id,
        name: track.name,
        type: track.type,
        order: track.order,
        isMuted: Boolean(track.isMuted),
        isLocked: Boolean(track.isLocked),
        isVisible: track.isVisible !== false,
        clipCount: (track.clips || []).length,
      })),
    }
  }

  const clips = flattenClips(tracks)
  if (view === 'clips') {
    return { ...base, clips }
  }

  return {
    ...base,
    canvasConfig: schema.canvasConfig,
    media: schema.media || [],
    tracks: tracks.map((track) => ({
      ...track,
      clips: (track.clips || []).map(clipToSec),
    })),
    clips,
  }
}

function filterTracks(tracks, { trackId, clipId, fromMs, toMs }) {
  return tracks
    .filter((track) => !trackId || track.id === trackId)
    .map((track) => ({
      ...track,
      clips: (track.clips || []).filter((clip) => {
        if (clipId && clip.id !== clipId) return false
        if (fromMs == null && toMs == null) return true
        const start = clip.startTimeMs || 0
        const end = start + (clip.durationMs || 0)
        const from = fromMs ?? 0
        const to = toMs ?? Number.POSITIVE_INFINITY
        return end > from && start < to
      }),
    }))
    .filter((track) => !clipId || (track.clips || []).some((clip) => clip.id === clipId))
}

function flattenClips(tracks) {
  const clips = []
  for (const track of tracks) {
    for (const clip of track.clips || []) {
      clips.push({ trackId: track.id, trackType: track.type, ...clipToSec(clip) })
    }
  }
  return clips
}

function clipToSec(clip) {
  return {
    id: clip.id,
    trackId: clip.trackId,
    name: clip.name,
    mediaType: clip.mediaType,
    startSec: msToSec(clip.startTimeMs),
    durationSec: msToSec(clip.durationMs),
    sourceUrl: clip.sourceUrl,
    sourceInSec: msToSec(clip.sourceInMs),
    sourceOutSec: msToSec(clip.sourceOutMs),
    speed: clip.speed ?? 1,
    volume: clip.volume ?? 1,
    textStyle: clip.textStyle,
    transition: clip.transition,
  }
}
