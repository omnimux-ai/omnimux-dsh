/** Canvas execution adapter. The hub owns provider I/O, polling and downloads. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AwaitTaskResult, GenerationCapability, GenerationGateway, SubmitRequest, SubmitResult, UpstreamTaskRef } from './gateway';
import { createWorkflowLogger } from '../execution/logger.ts';
import { readCanvasCatalog } from './canvasCatalog.ts';
import { resolveCanvasSubmission } from './submitGuard.ts';
import { SeamGatewayError } from './SeamGatewayError.ts';
import { validateGeneratedResult } from './generatedResult.ts';
export { SeamGatewayError } from './SeamGatewayError.ts';
export { resolveCanvasSubmission } from './submitGuard.ts';

const logger = createWorkflowLogger('OmniMuxSeamClient');
export type SeamName = 'videoGenerate' | 'imageGenerate' | 'audioGenerate' | 'textComplete';
/** Lazy lookup: the hub may mount after the domain plugin. */
export type SeamGetter = (name: string) => unknown;
interface SeamApi { execute(req: Record<string, unknown>): Promise<SeamExecuteResult> }
interface SeamExecuteResult extends Partial<Omit<AwaitTaskResult, 'url'>> {
  mode?: string;
  taskId?: string | null;
  url?: string | null;
  model?: string;
}
export interface OmniumuxSeamClientOptions {
  getSeam: SeamGetter;
  env?: NodeJS.ProcessEnv;
  maxConcurrency?: number;
}
export const SEAM_CONCURRENCY_ENV = 'OMNIMUX_WORKFLOW_MAX_SEAM_CONCURRENCY';
export const DEFAULT_SEAM_CONCURRENCY = 2;

function createSemaphore(limit: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) { active += 1; next(); }
  };
  return {
    acquire(): Promise<() => void> {
      if (active < limit) { active += 1; return Promise.resolve(release); }
      return new Promise((resolve) => { waiters.push(() => resolve(release)); });
    },
  };
}

type MediaCapability = 'image' | 'video' | 'audio';
type TaskRecord = {
  kind: 'media'; capability: MediaCapability; hubTaskId: string; settled?: AwaitTaskResult;
} | { kind: 'text'; request: Record<string, unknown> };

function isSeamApi(value: unknown): value is SeamApi {
  return typeof value === 'object' && value !== null && typeof (value as SeamApi).execute === 'function';
}
function requireSeam(getSeam: SeamGetter, capability: GenerationCapability): SeamApi {
  const name = seamNameFor(capability);
  const seam = name ? getSeam(name) : undefined;
  if (!isSeamApi(seam)) throw new SeamGatewayError('needs-provider', `执行中枢 ${name} 接缝不可用（hub 未加载或未提供该能力）`);
  return seam;
}
function toSeamError(error: unknown): Error {
  if (error instanceof SeamGatewayError) return error;
  const coded = error as { code?: unknown; cause?: unknown } | null;
  const code = typeof coded?.code === 'string' ? coded.code : 'omnimux-request-failed';
  if (code === 'CHANNEL_UNAVAILABLE') {
    const message = error instanceof Error ? error.message : String(error);
    return new SeamGatewayError(code, message);
  }
  let message = error instanceof Error ? error.message : String(error);
  const detail = coded?.cause instanceof Error ? coded.cause.message : typeof coded?.cause === 'string' ? coded.cause : '';
  if (detail.trim() && !message.includes(detail.trim())) message += `: ${detail.trim()}`;
  return new SeamGatewayError(code, message);
}

export function createOmnimuxSeamClient(opts: OmniumuxSeamClientOptions): GenerationGateway & { currentMode(): 'omnimux' } {
  const env = opts.env ?? process.env;
  const rawLimit = Number.parseInt(env[SEAM_CONCURRENCY_ENV] ?? '', 10);
  const semaphore = createSemaphore(opts.maxConcurrency
    ?? (Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_SEAM_CONCURRENCY));
  const tasks = new Map<string, TaskRecord>();
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    const release = await semaphore.acquire();
    try { return await fn(); } catch (error) { throw toSeamError(error); } finally { release(); }
  }
  return {
    async submit(req: SubmitRequest): Promise<SubmitResult> {
      const seam = requireSeam(opts.getSeam, req.capability);
      req = resolveCanvasSubmission(req, readCanvasCatalog(opts.getSeam));
      const structured = [...(req.references ?? []), ...(req.audioTrack ? [req.audioTrack] : [])];
      const isMirror = (key: string, value: unknown) => ['image', 'video', 'audio', 'speech'].includes(key)
        && structured.some((ref) => ref.type === (key === 'speech' ? 'audio' : key) && ref.pathOrUrl === value);
      if (req.capability === 'text') {
        const request: Record<string, unknown> = { prompt: req.prompt ?? '', model: req.model, operation: req.operation };
        for (const key of ['video', 'image', 'references', 'audioTrack', 'fileUrl', 'linkUrl'] as const) {
          if (req[key] !== undefined && !isMirror(key, req[key])) request[key] = req[key];
        }
        // The text seam is one-shot; defer execution until awaitTask, but guard now.
        const taskId = `text_${randomUUID().slice(0, 12)}`;
        tasks.set(taskId, { kind: 'text', request });
        return { taskId, mode: 'submitted' };
      }
      const request: Record<string, unknown> = { prompt: req.prompt ?? '', dest: req.dest, wait: false };
      for (const key of [
        'image', 'video', 'references', 'audioTrack', 'duration', 'operation', 'resolution', 'aspectRatio',
        'speech', 'audio', 'voice', 'style', 'instrumental', 'speed', 'sound', 'seed', 'watermark',
        'outputFormat', 'referenceTaskType', 'generationType', 'returnLastFrame', 'webSearch',
        'nsfwCheck', 'fileUrl', 'linkUrl', 'model', 'signal',
      ] as const) {
        if (req[key] !== undefined && !isMirror(key, req[key])) request[key] = req[key];
      }
      const result = await guarded(() => seam.execute(request));
      if (!result || (result.type !== undefined && result.type !== req.capability)) {
        throw new SeamGatewayError('omnimux-invalid-response', '生成服务返回了不匹配的产物类型');
      }
      const hubTaskId = typeof result.taskId === 'string' ? result.taskId.trim() : '';
      if (result.mode === 'live') {
        const metadata = validateGeneratedResult({ ...result, url: result.url ?? req.dest }, req.capability, req.dest);
        const localId = hubTaskId || `live_${randomUUID().slice(0, 12)}`;
        tasks.set(localId, { kind: 'media', capability: req.capability, hubTaskId: localId,
          settled: { url: req.dest, type: req.capability, ...metadata } });
        return { taskId: localId, mode: 'live', url: result.url ?? undefined };
      }
      if (result.mode !== 'submitted' || !hubTaskId) {
        throw new SeamGatewayError('omnimux-invalid-response', '提交结果无效或缺少 taskId（无法轮询）');
      }
      tasks.set(hubTaskId, { kind: 'media', capability: req.capability, hubTaskId });
      return { taskId: hubTaskId, mode: 'submitted' };
    },
    async awaitTask(taskId: string, dest: string, signal?: AbortSignal): Promise<AwaitTaskResult> {
      const record = tasks.get(taskId);
      if (!record) throw new SeamGatewayError('omnimux-invalid-request', `未知任务 ${taskId}（进程重启后节点需重新提交）`);
      if (record.kind === 'text') {
        const seam = requireSeam(opts.getSeam, 'text');
        const request = { ...record.request, ...(signal ? { signal } : {}) };
        const result = await guarded(() => seam.execute(request));
        const metadata = validateGeneratedResult(result, 'text');
        tasks.delete(taskId);
        try {
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, result.text!, 'utf8');
        } catch (error) {
          logger.warn('failed to persist text artifact', { dest, error: error instanceof Error ? error.message : String(error) });
        }
        return { url: dest, text: result.text!, type: 'text', ...metadata };
      }
      if (record.settled) { tasks.delete(taskId); return record.settled; }
      // Resume never revalidates sources or catalog: the hub already owns this task.
      const seam = requireSeam(opts.getSeam, record.capability);
      const request = { dest, taskId: record.hubTaskId, ...(signal ? { signal } : {}) };
      const result = await guarded(() => seam.execute(request));
      if (result?.mode !== 'live') throw new SeamGatewayError('omnimux-invalid-response', '轮询未返回已完成的产物');
      const metadata = validateGeneratedResult({ ...result, url: result.url ?? dest }, record.capability, dest);
      tasks.delete(taskId);
      return { url: dest, type: record.capability, ...metadata };
    },
    async capabilities() { return readCanvasCatalog(opts.getSeam); },
    /**
     * #1382: finish a task from a persisted reference.
     *
     * No catalog and no task-table lookup: the hub owns the task and is asked by
     * id through the pre-existing `{ taskId, dest }` form, which is why a task
     * submitted by a *previous* process can be reconciled at all. `submittedAt`
     * travels with the request so the hub anchors the poll deadline at the
     * original submit time instead of restarting the clock.
     */
    async reconcileTask(ref: UpstreamTaskRef, dest: string, signal?: AbortSignal): Promise<AwaitTaskResult> {
      const seam = requireSeam(opts.getSeam, ref.capability);
      const request = {
        dest,
        taskId: ref.taskId,
        submittedAt: ref.submittedAt,
        ...(signal ? { signal } : {}),
      };
      const result = await guarded(() => seam.execute(request));
      if (result?.mode !== 'live') throw new SeamGatewayError('omnimux-invalid-response', '轮询未返回已完成的产物');
      const metadata = validateGeneratedResult({ ...result, url: result.url ?? dest }, ref.capability, dest);
      tasks.delete(ref.taskId);
      return { url: dest, type: ref.capability, ...metadata };
    },
    currentMode() { return 'omnimux' as const; },
  };
}

export function seamNameFor(capability: GenerationCapability): SeamName | null {
  if (capability === 'video') return 'videoGenerate';
  if (capability === 'image') return 'imageGenerate';
  if (capability === 'audio') return 'audioGenerate';
  if (capability === 'text') return 'textComplete';
  return null;
}
