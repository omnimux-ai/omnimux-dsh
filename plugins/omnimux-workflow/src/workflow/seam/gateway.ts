/**
 * ★ Extension point: GenerationGateway seam interface (replaceable).
 *
 * The canvas never calls model APIs itself. All generation work flows
 * through this gateway. M1–M3 shipped the mock implementation; M4 adds the
 * OmniMux seam client (omnimuxGateway.ts) over ctx.get('videoGenerate' |
 * 'imageGenerate' | 'textComplete') and assembles one of the two at mount
 * (gatewaySelection.ts) — the vertical I/O rule (docs/contracts/hub.md).
 */

export type GenerationCapability = 'text' | 'image' | 'video' | 'audio';

export type MediaInputRole =
  | 'reference'
  | 'first_frame'
  | 'last_frame'
  | 'controlnet'
  | 'mask'
  | 'audio_track'
  | 'source'
  | 'document'
  | 'webpage'
  | 'motion_source';

export interface ReferenceAssetPayload {
  /** Omitted during assembly only; the submit guard binds the catalog role. */
  role?: MediaInputRole;
  type: 'image' | 'video' | 'audio' | 'document';
  pathOrUrl: string;
  targetSlot?: string;
  sourceNodeId?: string;
  edgeId?: string;
  mimeType?: string;
  sizeBytes?: number;
  originalName?: string;
  durationSec?: number;
  /** Legacy alias; new callers should use durationSec. */
  duration?: number;
  dimensions?: { width: number; height: number };
}

export interface SubmitRequest {
  capability: GenerationCapability;
  /** Prompt text (or upstream text content). */
  prompt?: string;
  /** Reference image (absolute local path / http(s) / data URI). */
  image?: string;
  /** Legacy single video; prefer ordered references for new callers. */
  video?: string;
  /** Multi-modal reference asset payloads (images, video references, controlnet, etc.). */
  references?: ReferenceAssetPayload[];
  /** Audio track payload for video audio-driven or lip-sync/background audio. */
  audioTrack?: ReferenceAssetPayload;
  /** Video duration hint in seconds. */
  duration?: number;
  /** Required for new submissions: explicit canonical catalog operation, never a legacy alias.
   * Executors resolve omitted saved-node choices before calling submit; polling uses taskId only.
   */
  operation?: string;
  /** Media resolution hint (e.g. '720P' | '1080P' | '4K'). */
  resolution?: string;
  /** Aspect ratio hint (e.g. '16:9' | '9:16' | '1:1'). */
  aspectRatio?: string;
  /** Speech audio for talking-head, or background audio. */
  speech?: string;
  audio?: string;
  /** Audio voice selection (alloy, echo, fable, onyx, nova, shimmer). */
  voice?: string;
  /** Audio/music style. */
  style?: string;
  /** Instrumental only flag for music. */
  instrumental?: boolean;
  /** Speed multiplier for speech. */
  speed?: number;
  sound?: boolean;
  seed?: number;
  watermark?: boolean;
  outputFormat?: string;
  referenceTaskType?: string;
  generationType?: string;
  returnLastFrame?: boolean;
  webSearch?: boolean;
  nsfwCheck?: boolean;
  fileUrl?: string;
  linkUrl?: string;
  /** Model id from the capability catalog; omit for hub default. */
  model?: string;
  /** Absolute download destination (plugin-owned media dir). */
  dest: string;
  /** Cooperative cancel. */
  signal?: AbortSignal;
  /**
   * Mock-gateway control (M3): force the simulated task to fail so failure
   * paths (node error / fail strategy / SSE node_error) are testable.
   * Real seam clients ignore this field.
   */
  mockFail?: boolean;
}

export interface SubmitResult {
  taskId: string;
  /** Submitted-only (no immediate local file yet). */
  mode: 'live' | 'submitted';
  url?: string;
}

export interface AwaitTaskResult {
  /** Actual output metadata when supplied by the seam (never request hints). */
  type?: GenerationCapability;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  relativePath?: string;
  assetId?: string;
  /** Absolute path (or URL) of the settled artifact. */
  url: string;
  /** Text capability output (mock gateway / future text seam). */
  text?: string;
  /** True only for artifacts produced by the offline mock gateway. */
  simulated?: boolean;
}

export interface GenerationGateway {
  /** Submit a generation task (wait:false semantics). */
  submit(req: SubmitRequest): Promise<SubmitResult>;
  /** Poll a task and download the artifact to its dest. */
  awaitTask(taskId: string, dest: string, signal?: AbortSignal): Promise<AwaitTaskResult>;
  /** Capability catalog for the config panel (model lists). */
  capabilities(): Promise<import('../../shared/api.ts').CapabilityCatalog>;
}
