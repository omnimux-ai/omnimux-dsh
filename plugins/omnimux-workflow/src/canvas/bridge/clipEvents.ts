/**
 * Canvas-side copy of the omnimux-clip JSON event contract.
 *
 * MUST NOT import omnimux-clip source (spec §2 / §4). Event names and
 * payload shapes are duplicated here so the island stays decoupled.
 */

export const OMNIMUX_CLIP_OPEN = 'omnimux-clip-open';
export const OMNIMUX_CLIP_SAVE = 'omnimux-clip-save';
export const OMNIMUX_CLIP_CLOSE = 'omnimux-clip-close';
export const OMNIMUX_CLIP_PROGRESS = 'omnimux-clip-progress';

export type ClipMediaType = 'video' | 'image' | 'audio' | 'text';
export type TrackType = 'video' | 'audio' | 'text';
export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface CanvasConfig {
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  backgroundColor: string;
}

export interface TextStyleConfig {
  presetId?: string;
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  textAlign: 'left' | 'center' | 'right';
}

export interface TransitionConfig {
  type: 'none' | 'cut' | 'crossfade' | 'fadeblack';
  durationMs: number;
}

export interface ClipModel {
  id: string;
  trackId: string;
  name: string;
  mediaType: ClipMediaType;
  startTimeMs: number;
  durationMs: number;
  sourceUrl: string;
  sourceInMs: number;
  sourceOutMs: number;
  speed: number;
  volume: number;
  textStyle?: TextStyleConfig;
  transition?: TransitionConfig;
}

export interface TrackModel {
  id: string;
  name: string;
  type: TrackType;
  order: number;
  isMuted: boolean;
  isLocked: boolean;
  isVisible: boolean;
  clips: ClipModel[];
}

export interface TimelineSchema {
  version: '1.0';
  projectId: string;
  canvasConfig: CanvasConfig;
  tracks: TrackModel[];
  media: Array<{
    id: string;
    name: string;
    type: ClipMediaType;
    durationMs?: number;
    path: string;
  }>;
}

export interface OpenClipEditorPayload {
  source: 'canvas' | 'sidebar' | 'agent';
  nodeId?: string;
  workspaceId?: string;
  nodeTitle?: string;
  draftSchema?: TimelineSchema;
  projectId?: string;
  upstreamInputs?: {
    videos: Array<{ path: string; name: string; durationMs?: number; url?: string }>;
    audios: Array<{ path: string; name: string; durationMs?: number; url?: string }>;
    images: Array<{ path: string; name: string; displayDurationMs?: number; url?: string }>;
    captions?: Array<{ text: string; startTimeMs: number; durationMs: number }>;
  };
  canvasConfig?: Partial<CanvasConfig>;
}

export interface SaveClipEditorPayload {
  nodeId?: string;
  schema?: TimelineSchema;
  projectId?: string;
  createDownstreamNode?: boolean;
  output?: {
    videoPath: string;
    thumbnailPath?: string;
    durationMs?: number;
    width?: number;
    height?: number;
    /**
     * Content identity of the file just written (`mtimeMs:size` from the clip
     * host). Re-exporting overwrites the same path, so the downstream node
     * needs this token in its `mediaUrl` to make the browser fetch the new
     * bytes instead of reusing the stale `<video>` element.
     */
    revision?: string;
  };
}

export type VideoCompositionStatus = 'idle' | 'editing' | 'rendering' | 'completed' | 'error';

export interface VideoCompositionNodeData {
  [key: string]: unknown;
  title: string;
  label?: string;
  projectId?: string;
  schemaVersion?: '1.0';
  schema?: TimelineSchema;
  status: VideoCompositionStatus;
  renderProgress?: number;
  outputVideoUrl?: string;
  /** Content identity of `outputVideoUrl`; part of the downstream node's media URL. */
  outputRevision?: string;
  thumbnailUrl?: string;
  outputThumbnailUrl?: string;
  outputDurationMs?: number;
  outputWidth?: number;
  outputHeight?: number;
  errorMessage?: string;
}

export function isSaveClipEditorPayload(payload: unknown): payload is SaveClipEditorPayload {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  if (value.nodeId != null && typeof value.nodeId !== 'string') return false;
  if (value.projectId != null && typeof value.projectId !== 'string') return false;
  if (value.schema != null && (typeof value.schema !== 'object' || Array.isArray(value.schema))) return false;
  if (value.output != null) {
    if (typeof value.output !== 'object' || value.output === null) return false;
    if (typeof (value.output as { videoPath?: unknown }).videoPath !== 'string') return false;
  }
  return true;
}

export function isCloseClipEditorPayload(payload: unknown): payload is { nodeId?: string } {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return value.nodeId == null || typeof value.nodeId === 'string';
}

export function isProgressClipEditorPayload(
  payload: unknown,
): payload is { nodeId?: string; status?: string; renderProgress?: number } {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  if (value.nodeId != null && typeof value.nodeId !== 'string') return false;
  if (value.status != null && typeof value.status !== 'string') return false;
  if (value.renderProgress != null && typeof value.renderProgress !== 'number') return false;
  return true;
}
