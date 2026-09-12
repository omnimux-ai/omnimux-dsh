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
  /** Interleaved multimodal message parts (Issue #714 / T05). */
  interleavedParts?: Array<{
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | string;
    text?: string;
    url?: string;
    mediaUrl?: string;
    image_url?: { url: string };
    video_url?: { url: string };
    audio_url?: { url: string };
    mimeType?: string;
    slotIndex?: number;
    sourceNodeId?: string;
    label?: string;
    materialType?: string;
    [key: string]: unknown;
  }>;
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

/**
 * #1382: the upstream (hub) task a node is currently waiting on.
 *
 * Persisted with the node state so a host restart can ask the hub about a task
 * the *previous* process submitted, instead of blindly resubmitting it — which
 * would discard an artifact the hub may already hold and can bill twice.
 *
 * The hub never sees this type: it only recognizes `{ taskId, dest }`.
 */
export interface UpstreamTaskRef {
  /** Task id returned by the hub on submit. */
  taskId: string;
  /** Capability domain; selects which seam a reconcile goes through. */
  capability: GenerationCapability;
  /**
   * First submit time (epoch ms) — the deadline anchor. A restart must not
   * reset it, otherwise every restart would hand the task a fresh window and
   * the whole-run timeout would become a meaningless ceiling.
   */
  submittedAt: number;
}

export interface GenerationGateway {
  /** Submit a generation task (wait:false semantics). */
  submit(req: SubmitRequest): Promise<SubmitResult>;
  /** Poll a task and download the artifact to its dest. */
  awaitTask(taskId: string, dest: string, signal?: AbortSignal): Promise<AwaitTaskResult>;
  /**
   * #1382: finish (or fail) a task from a *persisted* reference, without
   * requiring in-process bookkeeping.
   *
   * `awaitTask` cannot carry this: it is defined over the client's own task
   * table, so an unknown id is its contractual error ("resubmit") — the exact
   * opposite of what a reconcile needs. Reconciling also needs `capability`
   * (which seam) and `submittedAt` (the deadline anchor), neither of which has a
   * place in the `awaitTask` signature.
   *
   * An implementation that cannot reconcile across processes (the mock gateway:
   * its tasks live in memory only) throws instead of pretending, so the caller
   * falls back to resubmitting — today's behavior, never worse.
   */
  reconcileTask(ref: UpstreamTaskRef, dest: string, signal?: AbortSignal): Promise<AwaitTaskResult>;
  /** Capability catalog for the config panel (model lists). */
  capabilities(): Promise<import('../../shared/api.ts').CapabilityCatalog>;
}
