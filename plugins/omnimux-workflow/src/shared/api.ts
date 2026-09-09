/**
 * omnimux-workflow HTTP API contract (route paths + DTO shapes).
 *
 * Contract-first: host routes (src/workflow/routes/canvasRoutes.ts) and the
 * island api client (src/canvas/bridge/apiClient.ts) both reference these
 * constants/types. Full human-readable contract:
 * docs/contracts/canvas-http-api.md.
 *
 * M2 prefix migration: the canonical prefix is /omnimux-workflow. The M1
 * prefix /dsh-workflow stays mounted as a legacy alias (dual registration,
 * no redirect) so existing sessions/bookmarks keep working.
 */

export const WORKFLOW_ROUTE_PREFIX = '/omnimux-workflow';

/** M1 legacy prefix — still matched by the host dispatcher (read + write). */
export const LEGACY_WORKFLOW_ROUTE_PREFIX = '/dsh-workflow';

/** All prefixes the host answers on (canonical first). */
export const WORKFLOW_ROUTE_PREFIXES = [
  WORKFLOW_ROUTE_PREFIX,
  LEGACY_WORKFLOW_ROUTE_PREFIX,
] as const;

export const WORKFLOW_API_ROUTES = {
  /** GET/PATCH: profile-wide last manual model choices. */
  generationPreferences: `${WORKFLOW_ROUTE_PREFIX}/api/generation-preferences`,
  /** GET: build manifest (canvas.js hash for cache busting). */
  manifest: `${WORKFLOW_ROUTE_PREFIX}/api/manifest`,
  /** GET: island bundle (lazy-loaded by CanvasBridge). */
  canvasJs: `${WORKFLOW_ROUTE_PREFIX}/canvas.js`,
  /** GET: workspace summaries. POST: create workspace. */
  workspaces: `${WORKFLOW_ROUTE_PREFIX}/api/workspaces`,
  /** GET/PUT/DELETE one workspace snapshot (PUT uses optimistic lock). */
  workspace: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}`,
  /** GET/PUT/DELETE one tabular document (.htable) within a workspace. */
  workspaceTable: (workspaceId: string, tableId: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/tables/${tableId}`,
  /** GET: lightweight { id, version } — external-edit polling (PR3). */
  workspaceVersion: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/version`,
  /** GET/PUT: project-private assets.json (independent rev, never canvas.version). */
  workspaceAssets: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets`,
  /** POST: create a logical folder record in assets.json. */
  workspaceAssetsMkdir: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/mkdir`,
  /** POST: copy source files into `<ProjectRoot>/assets/imported/`. */
  workspaceAssetsIngest: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/ingest`,
  /** POST application/octet-stream: bounded external audio bytes, never a URL. */
  workspaceAudioBytes: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/audio-bytes`,
  /** POST: deprecated alias of ingest (physical copy, not a path index). */
  workspaceAssetsIndex: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/index`,
  /** POST: copy a global library subject into `<ProjectRoot>/assets/subjects/<id>/`. */
  workspaceAssetsInstantiate: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/instantiate`,
  /** POST: copy a project file into the global library (explicit promote). */
  workspaceAssetsPromote: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/promote`,
  /** GET: stream a project-relative file (Range 206). */
  workspaceFile: (id: string, rel: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/file?rel=${encodeURIComponent(rel)}`,
  /** GET: alias of workspaceFile (`?workspace=&rel=`). */
  projectFile: `${WORKFLOW_ROUTE_PREFIX}/api/project-file`,
  /** GET: generation capability catalog (M3/M4 fills real data). */
  capabilities: `${WORKFLOW_ROUTE_PREFIX}/api/capabilities`,
  /** GET: media files under the plugin-owned media dir (traversal-guarded). */
  media: `${WORKFLOW_ROUTE_PREFIX}/media`,
  /** POST: native file/folder picker → absolute paths (no copy). */
  pick: `${WORKFLOW_ROUTE_PREFIX}/api/pick`,
  /** GET: stream an imported local file by realPath (Range 206). */
  localFile: `${WORKFLOW_ROUTE_PREFIX}/api/local-file`,
  /** POST: batch exists/size probe for imported realPath values. */
  localFileProbe: `${WORKFLOW_ROUTE_PREFIX}/api/local-file/probe`,
  /** GET: execution summaries. POST: create execution {mode, nodeIds?}. */
  executions: (workspaceId: string) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions`,
  /** GET: one execution status snapshot. */
  execution: (workspaceId: string, executionId: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}`,
  /** POST: pause | resume | cancel. */
  executionAction: (workspaceId: string, executionId: string, action: 'pause' | 'resume' | 'cancel') =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}/${action}`,
  /** GET: execution SSE event stream (text/event-stream). */
  executionEvents: (workspaceId: string, executionId: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}/events`,
  /** POST: speech-to-text transcription (Issue 744; default model doubao-asr-bigmodel, default format srt). */
  speechToText: (workspaceId: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/speech-to-text`,
  /** POST: extract video from social media URL and download to local media. */
  extractVideo: (workspaceId: string) =>
    `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/extract-video`,
  /** GET: list templates. POST: create template. */
  templates: `${WORKFLOW_ROUTE_PREFIX}/api/templates`,
  /** GET/DELETE one template. */
  template: (id: string) => `${WORKFLOW_ROUTE_PREFIX}/api/templates/${id}`,
} as const;

/** GET /api/manifest response. */
export interface BuildManifest {
  /** sha256 (hex, first 16 chars) of lib/canvas.js. */
  canvasHash: string;
}

import type { VoiceOptionMeta } from './voiceCatalog.ts';
export type { VoiceOptionMeta } from './voiceCatalog.ts';

export interface ModelParameterOption<T = string | number> {
  value: T;
  label: string;
}

export interface VoiceCatalogOption extends ModelParameterOption<string> {
  /** Present for rich voice catalogs; legacy providers may only send value/label. */
  meta?: VoiceOptionMeta;
}

export interface ModelParameterSchema {
  /** Prompt length constraints, measured in Unicode code points. */
  prompt?: {
    minLength?: number;
    maxLength?: number;
  };
  /** 画幅选项与默认值 */
  aspectRatio?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
  };
  /** 时长选项或范围与默认值 */
  duration?: {
    options?: Array<ModelParameterOption<number>>;
    range?: { min: number; max: number; step?: number };
    defaultValue: number;
    unit?: string;
    /** -1 asks the provider to choose the output duration. */
    allowAuto?: boolean;
  };
  /** 分辨率选项与默认值 */
  resolution?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
    /** Provider enum accepts case-insensitive input and emits the documented spelling. */
    caseInsensitive?: boolean;
  };
  /** 生成质量/模式选项 */
  quality?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
  };
  /** 音效支持 */
  sound?: {
    supported: boolean;
    defaultValue: boolean;
  };
  seed?: {
    type: 'integer';
    range?: { min: number; max: number; step?: number };
  };
  watermark?: {
    supported: boolean;
    defaultValue: boolean;
  };
  outputFormat?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
  };
  referenceTaskType?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
  };
  generationType?: {
    options: Array<ModelParameterOption<string>>;
    defaultValue: string;
  };
  returnLastFrame?: {
    supported: boolean;
    defaultValue: boolean;
  };
  webSearch?: {
    supported: boolean;
    defaultValue: boolean;
  };
  nsfwCheck?: {
    supported: boolean;
    defaultValue: boolean;
  };
  /** 音色选项 (TTS) */
  voice?: {
    options: VoiceCatalogOption[];
    defaultValue: string;
  };
  /** 纯音乐选项 (Suno) */
  instrumental?: {
    supported: boolean;
    defaultValue: boolean;
  };
}

import type { ModelInputCapability } from './validation/modelCompatibilityEvaluator.ts';
export type { ModelInputCapability };

// ============================================================================
// Catalog v1.1 contract DTO (Issue #466 — canvas consumes the hub projection)
// ============================================================================
//
// The hub (`omnimux`) owns the contract SSOT; workflow NEVER imports it.
// These shapes mirror the seam / HTTP DTO only. Operation ids are plain
// `string` + metadata — workflow must NOT copy the registry N-entry union.

/** One operation input slot (contract v1.1). */
export interface InputSlotDto {
  slot: string;
  /** 'text' | 'image' | 'video' | 'audio' | 'document' (open string). */
  type: string;
  role: string;
  source?: 'user' | 'upstream_edge' | 'node_field';
  min: number;
  /** null means the official source does not publish an upper bound. */
  max: number | null;
  allowedMimes?: string[];
  maxSizeMb?: number;
  /** True when the official limit is strictly less than maxSizeMb. */
  maxSizeExclusive?: boolean;
  minDurationSec?: number;
  maxDurationSec?: number;
  totalMinDurationSec?: number;
  totalMaxDurationSec?: number;
  /** Input duration plus requested output duration must not exceed this value. */
  combinedOutputMaxDurationSec?: number;
  totalMinExclusive?: boolean;
  totalMaxExclusive?: boolean;
  limitSource?: { kind: string; url?: string; note?: string };
}

/** Operation-level contract (research/execution/listed are per-operation). */
export interface OperationContractDto {
  id: string;
  label?: string;
  output: { type: string; allowedMimes?: string[]; min?: number; max?: number };
  inputs: InputSlotDto[];
  inputGroups?: Array<{ slots: string[]; min: number; hint?: string }>;
  research?: { status?: string; docUrl?: string; verifiedAt?: string; notes?: string };
  execution?: { status?: string; profileId?: string; seam?: string; notes?: string };
  implementation?: { status?: string; profileId?: string; seam?: string; verifiedAt?: string; notes?: string };
  listed?: boolean;
  /** Legacy operation-name aliases (read-time mapping only). */
  aliases?: string[];
  parameters?: Record<string, unknown>;
}

/** Authoritative model row of the Catalog v1.1 DTO (`models[]`). */
export interface CatalogModelDto {
  id: string;
  label: string;
  family?: string;
  badge?: string;
  subtitle?: string;
  /** Runtime/wire model-id aliases normalized to `id`. */
  aliases?: string[];
  operations?: OperationContractDto[];
  parameters?: ModelParameterSchema | Record<string, unknown>;
  routing?: { channel: string; wireModel: string; endpoint: string; automaticFallback?: boolean };
  /** Derived summary only — never use as a per-operation gate. */
  listed?: boolean;
  listedOperations?: string[];
  disposition?: string;
}

export interface CapabilityModelItem {
  id: string;
  label: string;
  badge?: string;
  subtitle?: string;
  family?: string;
  aliases?: string[];
  inputCapability?: ModelInputCapability;
  parameters?: ModelParameterSchema;
}

/** GET /api/capabilities response (hub modelCatalog.list shape). */
export interface CapabilityCatalog {
  /** Canvas product curation, separate from model input capabilities. */
  generationPolicy?: Readonly<Record<import('./canvasTypes.ts').MaterialType, import('./generationPolicy.ts').GenerationPolicy>>;
  source: 'static-stub' | 'omnimux';
  /** Contract schema version ('1.1' when the hub projects contract v1.1). */
  schemaVersion?: string;
  /** Hub content hash; used by canvas cache invalidation. */
  fingerprint?: string;
  /** Per-type default model ids (env → settings → config → first sorted). */
  defaults?: {
    text?: string;
    image?: string;
    video?: string;
    audio?: string;
  };
  /** Authoritative contract rows (operations/inputs/output/research/execution). */
  models?: CatalogModelDto[];
  /** Per-operation default model id (hub catalog-defaults). */
  defaultsByOperation?: Record<string, string>;
  text: Array<CapabilityModelItem>;
  image: Array<CapabilityModelItem>;
  video: Array<CapabilityModelItem>;
  audio: Array<CapabilityModelItem>;
}

// ============================================================================
// Execution API DTOs (M3)
// ============================================================================

/** Execution lifecycle status (host ExecutionContext.ExecutionStatus). */
export type ExecutionApiStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

/** Node execution status (host ExecutionContext.NodeStatus). */
export type NodeExecutionApiStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped';

/** POST /executions request body. */
export interface StartExecutionPayload {
  /** Last successfully saved input version; mismatch returns 409 version_conflict. */
  expectedVersion?: number;
  /** full = whole graph; subset = nodeIds + transitive upstream closure; single = target nodeIds only (inheriting existing upstream outputs). */
  mode?: 'full' | 'subset' | 'single';
  /** Required for subset and single modes. */
  nodeIds?: string[];
}

/** POST /executions response. */
export interface CreateExecutionResponse {
  execution: {
    id: string;
    workspaceId: string;
    status: ExecutionApiStatus;
    totalNodes: number;
    createdAt: string;
  };
}

/** GET /executions (list) entry. */
export interface ExecutionSummaryDto {
  id: string;
  workspaceId: string;
  status: ExecutionApiStatus;
  createdAt: string;
  progress: { total: number; completed: number; percentage: number };
}

/** GET /executions/:id response (status snapshot; SSE missed-event backfill). */
export interface ExecutionSnapshotDto {
  id: string;
  workspaceId: string;
  status: ExecutionApiStatus;
  createdAt: string;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  totalNodes: number;
  completedNodes: number;
  progress: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    percentage: number;
  };
  nodeStates: Record<
    string,
    { status: NodeExecutionApiStatus; startedAt: number | null; completedAt: number | null; error: string | null }
  >;
  nodeOutputs: Record<string, unknown>;
  mediaAssets: Record<string, Array<Record<string, unknown>>>;
  breakpoints: string[];
}

// ============================================================================
// Table Node API DTOs (.htable L2 persistence)
// ============================================================================

export interface SaveWorkspaceTablePayload {
  expectedRev: number;
  document: import('./types/htable').HTableDocument;
}

export interface WorkspaceTableDto {
  tableId: string;
  tablePath: string;
  contentRev: number;
  rowCount: number;
  columnCount: number;
  title: string;
  document: import('./types/htable').HTableDocument;
}

export interface WorkspaceTableResponse {
  table?: WorkspaceTableDto;
  error?: string;
  message?: string;
  currentRev?: number;
}
