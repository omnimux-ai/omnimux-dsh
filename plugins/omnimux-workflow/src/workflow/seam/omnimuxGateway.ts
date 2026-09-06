/**
 * ★ M4: OmniMuxSeamClient — real GenerationGateway over the execution hub
 * seams (`docs/contracts/hub.md`).
 *
 * The canvas still never opens sockets itself: every generation goes through
 * `ctx.get('videoGenerate' | 'imageGenerate' | 'audioGenerate' | 'textComplete')`
 * and the hub owns keys, HTTP, polling and the download to `dest`. This module
 * only maps node data onto the seam request shape and back.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AwaitTaskResult,
  GenerationCapability,
  GenerationGateway,
  ReferenceAssetPayload,
  SubmitRequest,
  SubmitResult,
} from './gateway';
import type { CapabilityCatalog, CatalogModelDto, ModelParameterSchema } from '../../shared/api';
import { projectCanvasCatalog } from '../../shared/generationPolicy.ts';
import type { ModelInputCapability } from '../../shared/validation/modelCompatibilityEvaluator.ts';
import { createWorkflowLogger } from '../execution/logger.ts';

const LOG_TAG = 'OmniMuxSeamClient';

const logger = createWorkflowLogger(LOG_TAG);

/** Seam names exposed by the execution hub (docs/contracts/hub.md). */
export type SeamName = 'videoGenerate' | 'imageGenerate' | 'audioGenerate' | 'textComplete';

/**
 * Resolves a seam by name at call time (cordis `ctx.get`). Lazy by design:
 * the hub may be mounted after this plugin.
 */
export type SeamGetter = (name: string) => unknown;

/** Shape of the hub-provided seam API object (only what we consume). */
interface SeamApi {
  execute(req: Record<string, unknown>): Promise<SeamExecuteResult>;
}

/** Envelope returned by the hub media seams. */
interface SeamExecuteResult {
  mode?: string;
  taskId?: string | null;
  url?: string | null;
  /** textComplete only. */
  model?: string;
  text?: string;
}

/** Error thrown by the hub (OmnimuxError shape) re-wrapped for node badges. */
export class SeamGatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[omnimux:${code}] ${message}`);
    this.name = 'SeamGatewayError';
    this.code = code;
  }
}

export interface OmniumuxSeamClientOptions {
  /** cordis seam lookup (usually `(name) => ctx.get(name)`). */
  getSeam: SeamGetter;
  /** Env overlay source (tests); defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Max concurrent in-flight seam calls (default 2; env overlay below). */
  maxConcurrency?: number;
}

/** Env knob for the seam concurrency cap. */
export const SEAM_CONCURRENCY_ENV = 'OMNIMUX_WORKFLOW_MAX_SEAM_CONCURRENCY';

export const DEFAULT_SEAM_CONCURRENCY = 2;

// ============================================================================
// Capability catalog (hub modelCatalog seam)
// ============================================================================

interface ModelCatalogSeam {
  list(): {
    source?: string;
    schemaVersion?: string;
    fingerprint?: string;
    defaults?: {
      text?: string;
      image?: string;
      video?: string;
      audio?: string;
    };
    /** Catalog v1.1 authoritative rows — passed through untouched (DTO). */
    models?: Array<Record<string, unknown>>;
    defaultsByOperation?: Record<string, string>;
    text?: Array<Record<string, unknown>>;
    image?: Array<Record<string, unknown>>;
    video?: Array<Record<string, unknown>>;
    audio?: Array<Record<string, unknown>>;
  };
}

function isModelCatalog(value: unknown): value is ModelCatalogSeam {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as ModelCatalogSeam).list === 'function'
  );
}

function asCatalogRows(value: unknown): Array<{
  id: string;
  label: string;
  badge?: string;
  subtitle?: string;
  family?: string;
  aliases?: string[];
  inputCapability?: ModelInputCapability;
  parameters?: ModelParameterSchema;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      id: String(row.id ?? ''),
      label: typeof row.label === 'string' && row.label.trim() ? row.label : String(row.id ?? ''),
      ...(typeof row.badge === 'string' ? { badge: row.badge } : {}),
      ...(typeof row.subtitle === 'string' ? { subtitle: row.subtitle } : {}),
      ...(typeof row.family === 'string' ? { family: row.family } : {}),
      ...(Array.isArray(row.aliases) ? { aliases: row.aliases.map(String) } : {}),
      ...(row.inputCapability && typeof row.inputCapability === 'object'
        ? { inputCapability: row.inputCapability as ModelInputCapability }
        : {}),
      ...(row.parameters && typeof row.parameters === 'object'
        ? { parameters: row.parameters as ModelParameterSchema }
        : {}),
    }))
    .filter((row) => row.id.length > 0);
}

/**
 * Catalog v1.1 passthrough: keep every contract field (operations/inputs/
 * output/research/execution/aliases/parameters). Rows that are not plain
 * objects are dropped; everything else crosses the seam verbatim.
 */
function asCatalogModels(value: unknown): CatalogModelDto[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (row): row is CatalogModelDto =>
      typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string',
  );
}

function asDefaultsByOperation(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw) out[key] = raw;
  }
  return out;
}

// ============================================================================
// Semaphore
// ============================================================================

/** Counting semaphore: acquire() resolves with a release() callback. */
function createSemaphore(limit: number): { acquire(): Promise<() => void> } {
  let active = 0;
  const waiters: Array<() => void> = [];

  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) {
      active += 1;
      next();
    }
  };

  return {
    acquire(): Promise<() => void> {
      if (active < limit) {
        active += 1;
        return Promise.resolve(release);
      }
      return new Promise<(() => void)>((resolve) => {
        waiters.push(() => resolve(release));
      });
    },
  };
}

// ============================================================================
// Task bookkeeping
// ============================================================================

interface MediaTaskRecord {
  kind: 'media';
  capability: 'image' | 'video' | 'audio';
  /** Hub task id (used for poll + download resume). */
  hubTaskId: string;
  /** Sync providers (gpt-image-2) already wrote dest; skip poll. */
  settled?: boolean;
}

interface TextTaskRecord {
  kind: 'text';
  prompt: string;
  operation?: string;
  video?: string;
  model?: string;
  image?: string;
  references?: ReferenceAssetPayload[];
  audioTrack?: ReferenceAssetPayload;
}

type TaskRecord = MediaTaskRecord | TextTaskRecord;

// ============================================================================
// Client
// ============================================================================

function isSeamApi(value: unknown): value is SeamApi {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as SeamApi).execute === 'function'
  );
}

/** Resolve the seam for a media capability ('image' | 'video' | 'audio'), or throw. */
function requireMediaSeam(getSeam: SeamGetter, capability: 'image' | 'video' | 'audio'): SeamApi {
  const name: SeamName = capability === 'video' ? 'videoGenerate' : capability === 'audio' ? 'audioGenerate' : 'imageGenerate';
  const seam = getSeam(name);
  if (!isSeamApi(seam)) {
    throw new SeamGatewayError(
      'needs-provider',
      `执行中枢 ${name} 接缝不可用（hub 未加载或未提供该能力）`,
    );
  }
  return seam;
}

/**
 * Normalize a hub rejection into SeamGatewayError. Errors carrying a string
 * `code` (OmnimuxError) keep code + message; anything else becomes
 * `omnimux-request-failed`. Adapter wrappers keep the provider text on `cause`.
 */
function causeDetail(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  if (typeof cause === 'string' && cause.trim()) return cause.trim();
  return '';
}

function withCause(message: string, error: unknown): string {
  const detail = causeDetail(error);
  if (!detail || message.includes(detail)) return message;
  return `${message}: ${detail}`;
}

function toSeamError(error: unknown): Error {
  if (error instanceof SeamGatewayError) return error;
  if (
    error instanceof Error
    && typeof (error as { code?: unknown }).code === 'string'
  ) {
    const coded = error as unknown as { code: string; message?: string };
    return new SeamGatewayError(coded.code, withCause(coded.message ?? String(error), error));
  }
  if (error instanceof Error) {
    return new SeamGatewayError('omnimux-request-failed', withCause(error.message, error));
  }
  return new SeamGatewayError('omnimux-request-failed', String(error));
}

export function createOmnimuxSeamClient(
  opts: OmniumuxSeamClientOptions,
): GenerationGateway & { currentMode(): 'omnimux' } {
  const env = opts.env ?? process.env;
  const rawLimit = Number.parseInt(env[SEAM_CONCURRENCY_ENV] ?? '', 10);
  const maxConcurrency =
    opts.maxConcurrency
    ?? (Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_SEAM_CONCURRENCY);
  const semaphore = createSemaphore(maxConcurrency);

  /** TaskId → record. Media ids are the hub's own task ids (poll resume). */
  const tasks = new Map<string, TaskRecord>();

  /** Run one seam call under the concurrency cap. */
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    const release = await semaphore.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  const readCanvasCatalog = (): CapabilityCatalog => {
      // Generate seams still decide omnimux vs mock; modelCatalog alone must not
      // flip the gateway (probeSeams ignores it by design).
      const hasVideo = isSeamApi(opts.getSeam('videoGenerate'));
      const hasImage = isSeamApi(opts.getSeam('imageGenerate'));
      const hasAudio = isSeamApi(opts.getSeam('audioGenerate'));
      const hasText = isSeamApi(opts.getSeam('textComplete'));
      const source: 'omnimux' | 'static-stub' =
        hasVideo || hasImage || hasAudio || hasText ? 'omnimux' : 'static-stub';

      const catalogSeam = opts.getSeam('modelCatalog');
      if (!isModelCatalog(catalogSeam)) {
        return {
          source,
          fingerprint: undefined,
          defaults: undefined,
          text: [],
          image: [],
          video: [],
          audio: [],
        };
      }

      const body = catalogSeam.list();
      return projectCanvasCatalog({
        source: body.source === 'omnimux' || body.source === 'static-stub' ? body.source : source,
        schemaVersion: typeof body.schemaVersion === 'string' ? body.schemaVersion : undefined,
        fingerprint: typeof body.fingerprint === 'string' ? body.fingerprint : undefined,
        defaults: body.defaults,
        models: asCatalogModels(body.models),
        defaultsByOperation: asDefaultsByOperation(body.defaultsByOperation),
        text: asCatalogRows(body.text),
        image: asCatalogRows(body.image),
        video: asCatalogRows(body.video),
        audio: asCatalogRows(body.audio),
      });
  };

  return {
    async submit(req: SubmitRequest): Promise<SubmitResult> {
      const catalog = readCanvasCatalog();
      const model = req.model?.trim() || catalog.defaults?.[req.capability] || '';
      if (!catalog[req.capability].some((row) => row.id === model)) {
        throw new SeamGatewayError('model-not-allowed', '请选择此类节点白名单中可用的模型');
      }
      if (req.operation && catalog.models && !catalog.models.some((row) => row.id === model
        && row.operations?.some((op) => op.id === req.operation && op.listed === true && op.output?.type === req.capability))) {
        throw new SeamGatewayError('operation-not-allowed', '当前模型不支持所选生成方式，请重新选择');
      }
      req = { ...req, model };
      if (req.capability === 'text') {
        // textComplete is a one-shot synchronous seam (no taskId protocol):
        // register the work now, run it in awaitTask so the executor's
        // progress milestones keep their meaning.
        const taskId = `text_${randomUUID().slice(0, 12)}`;
        tasks.set(taskId, {
          kind: 'text',
          prompt: req.prompt ?? '',
          model: req.model,
          operation: req.operation,
          video: req.video,
          image: req.image,
          references: req.references,
          audioTrack: req.audioTrack,
        });
        return { taskId, mode: 'submitted' };
      }

      const capability = req.capability === 'video' ? 'video' : req.capability === 'audio' ? 'audio' : 'image';
      const seam = requireMediaSeam(opts.getSeam, capability);

      const request: Record<string, unknown> = {
        prompt: req.prompt ?? '',
        dest: req.dest,
        wait: false,
      };
      if (req.image !== undefined) request.image = req.image;
      if (req.references !== undefined) request.references = req.references;
      if (req.audioTrack !== undefined) request.audioTrack = req.audioTrack;
      if (req.duration !== undefined) request.duration = req.duration;
      if (req.operation !== undefined) request.operation = req.operation;
      if (req.resolution !== undefined) request.resolution = req.resolution;
      if (req.aspectRatio !== undefined) request.aspectRatio = req.aspectRatio;
      if (req.speech !== undefined) request.speech = req.speech;
      if (req.audio !== undefined) request.audio = req.audio;
      if (req.voice !== undefined) request.voice = req.voice;
      if (req.style !== undefined) request.style = req.style;
      if (req.instrumental !== undefined) request.instrumental = req.instrumental;
      if (req.speed !== undefined) request.speed = req.speed;
      if (req.sound !== undefined) request.sound = req.sound;
      if (req.seed !== undefined) request.seed = req.seed;
      if (req.watermark !== undefined) request.watermark = req.watermark;
      if (req.outputFormat !== undefined) request.outputFormat = req.outputFormat;
      if (req.referenceTaskType !== undefined) request.referenceTaskType = req.referenceTaskType;
      if (req.generationType !== undefined) request.generationType = req.generationType;
      if (req.returnLastFrame !== undefined) request.returnLastFrame = req.returnLastFrame;
      if (req.webSearch !== undefined) request.webSearch = req.webSearch;
      if (req.nsfwCheck !== undefined) request.nsfwCheck = req.nsfwCheck;
      if (req.fileUrl !== undefined) request.fileUrl = req.fileUrl;
      if (req.linkUrl !== undefined) request.linkUrl = req.linkUrl;
      if (req.model !== undefined) request.model = req.model;
      if (req.signal !== undefined) request.signal = req.signal;

      let result: SeamExecuteResult;
      try {
        result = await guarded(() => seam.execute(request));
      } catch (error) {
        throw toSeamError(error);
      }

      const hubTaskId =
        typeof result.taskId === 'string' && result.taskId.trim().length > 0
          ? result.taskId.trim()
          : '';
      if (result.mode === 'live') {
        // Provider already produced the file: the hub downloaded it to dest.
        // Sync image models (gpt-image-2) return b64_json with no task_id.
        const localId = hubTaskId || `live_${randomUUID().slice(0, 12)}`;
        tasks.set(localId, { kind: 'media', capability, hubTaskId: localId, settled: true });
        return { taskId: localId, mode: 'live', url: result.url ?? undefined };
      }
      if (!hubTaskId) {
        throw new SeamGatewayError(
          'omnimux-invalid-response',
          'submitted 提交缺少 taskId（无法轮询）',
        );
      }
      tasks.set(hubTaskId, { kind: 'media', capability, hubTaskId });
      return { taskId: hubTaskId, mode: 'submitted' };
    },

    async awaitTask(
      taskId: string,
      dest: string,
      signal?: AbortSignal,
    ): Promise<AwaitTaskResult> {
      const record = tasks.get(taskId);
      if (!record) {
        throw new SeamGatewayError(
          'omnimux-invalid-request',
          `未知任务 ${taskId}（进程重启后 hub 任务不登记，节点会重新提交）`,
        );
      }

      if (record.kind === 'text') {
        const seamValue = opts.getSeam('textComplete');
        if (!isSeamApi(seamValue)) {
          throw new SeamGatewayError(
            'needs-provider',
            '执行中枢 textComplete 接缝不可用（hub 未加载或未提供该能力）',
          );
        }
        const request: Record<string, unknown> = { prompt: record.prompt };
        if (record.model !== undefined) request.model = record.model;
        if (record.operation !== undefined) request.operation = record.operation;
        if (record.video !== undefined) request.video = record.video;
        if (record.image !== undefined) request.image = record.image;
        if (record.references !== undefined) request.references = record.references;
        if (record.audioTrack !== undefined) request.audioTrack = record.audioTrack;
        if (signal !== undefined) request.signal = signal;

        let result: SeamExecuteResult;
        try {
          result = await guarded(() => seamValue.execute(request));
        } catch (error) {
          throw toSeamError(error);
        }
        const text = typeof result.text === 'string' ? result.text : '';
        tasks.delete(taskId);
        // Persist the text artifact beside media outputs (same dest contract
        // as the mock gateway) so downstream nodes / the UI can reference it.
        try {
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, text, 'utf8');
        } catch (error) {
          logger.warn('failed to persist text artifact', {
            dest,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return { url: dest, text };
      }

      // Sync live submit already wrote dest; do not poll a missing task id.
      if (record.settled) {
        tasks.delete(taskId);
        return { url: dest };
      }

      // Media: poll + download via the hub ({ dest, taskId } resume path).
      const seam = requireMediaSeam(opts.getSeam, record.capability);
      const request: Record<string, unknown> = { dest, taskId: record.hubTaskId };
      if (signal !== undefined) request.signal = signal;

      let result: SeamExecuteResult;
      try {
        result = await guarded(() => seam.execute(request));
      } catch (error) {
        throw toSeamError(error);
      }
      tasks.delete(taskId);
      // The hub downloaded the artifact to dest; return the local path so
      // the executor's toPublicUrl rewriter serves it same-origin through
      // /omnimux-workflow/media/ (the hub's remote url never reaches the
      // browser).
      return { url: dest };
    },

    async capabilities() {
      return readCanvasCatalog();
    },

    currentMode() {
      return 'omnimux' as const;
    },
  };
}

/** Re-exported for callers that want the seam name of a capability. */
export function seamNameFor(capability: GenerationCapability): SeamName | null {
  if (capability === 'video') return 'videoGenerate';
  if (capability === 'image') return 'imageGenerate';
  if (capability === 'audio') return 'audioGenerate';
  if (capability === 'text') return 'textComplete';
  return null;
}
