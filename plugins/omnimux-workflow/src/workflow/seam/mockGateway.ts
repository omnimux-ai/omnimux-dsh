/** Offline gateway: explicit simulated artifacts behind the same SubmitGuard. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CapabilityCatalog } from '../../shared/api.ts';
import type { GenerationGateway, SubmitRequest, SubmitResult, UpstreamTaskRef } from './gateway';
import { resolveCanvasSubmission } from './submitGuard.ts';
import { mockCatalog } from './mockCatalog.ts';
import { SeamGatewayError } from './SeamGatewayError.ts';

export interface MockGatewayOptions {
  minLatencyMs?: number;
  maxLatencyMs?: number;
  /** Offline QA may consume the hub's catalog without executing its generation seams. */
  catalog?: () => CapabilityCatalog | Promise<CapabilityCatalog>;
}
export const DEFAULT_MOCK_MIN_LATENCY_MS = 1000;
export const DEFAULT_MOCK_MAX_LATENCY_MS = 3000;
const MOCK_TEXT_PLACEHOLDER = '【mock 生成结果】这是 omnimux-workflow mock 网关的文本输出；M4 接入 OmniMux seam 后为真实模型结果。';
const MOCK_IMAGE_PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#eef2fb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#4176E6" font-family="sans-serif" font-size="14">mock image</text></svg>';
function placeholderFor(capability: string): string {
  if (capability === 'image') return MOCK_IMAGE_PLACEHOLDER;
  if (capability === 'text') return MOCK_TEXT_PLACEHOLDER;
  return `mock ${capability} artifact`;
}
interface MockTask { req: SubmitRequest; latencyMs: number }

export function createMockGateway(opts: MockGatewayOptions = {}): GenerationGateway {
  const minLatency = opts.minLatencyMs ?? DEFAULT_MOCK_MIN_LATENCY_MS;
  const maxLatency = Math.max(opts.maxLatencyMs ?? DEFAULT_MOCK_MAX_LATENCY_MS, minLatency);
  const tasks = new Map<string, MockTask>();
  const capabilities = async () => opts.catalog ? opts.catalog() : mockCatalog();
  function settle(task: MockTask, dest: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('mock task aborted')); };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) { reject(new Error('mock task aborted')); return; }
        if (task.req.mockFail === true) { reject(new Error('mock generation failed (mockFail=true)')); return; }
        try {
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, placeholderFor(task.req.capability), 'utf8');
          resolve();
        } catch (error) { reject(error instanceof Error ? error : new Error(String(error))); }
      }, task.latencyMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  return {
    async submit(req: SubmitRequest): Promise<SubmitResult> {
      req = resolveCanvasSubmission(req, await capabilities());
      const taskId = `mock_${randomUUID().slice(0, 12)}`;
      const latencyMs = minLatency + Math.floor(Math.random() * (maxLatency - minLatency + 1));
      tasks.set(taskId, { req, latencyMs });
      return { taskId, mode: 'submitted' };
    },
    async awaitTask(taskId: string, dest: string, signal?: AbortSignal) {
      const task = tasks.get(taskId);
      if (!task) throw new Error(`mock gateway: unknown task ${taskId}`);
      await settle(task, dest, signal);
      tasks.delete(taskId);
      return { url: dest, type: task.req.capability,
        ...(task.req.capability === 'text' ? { text: MOCK_TEXT_PLACEHOLDER } : {}), simulated: true };
    },
    capabilities,
    /**
     * #1382: mock tasks live in this process's `tasks` map and nowhere else, so
     * a task submitted before a restart cannot be reconciled — and after a
     * restart there is no map at all.
     *
     * Declaring that out loud (with the code the hub uses for an unknown task)
     * is what sends recovery down the resubmit path, which is both correct and
     * free for the mock. Fabricating a "settled" artifact here would hide the
     * fact that the node's real work was never done.
     */
    async reconcileTask(ref: UpstreamTaskRef): Promise<never> {
      throw new SeamGatewayError(
        'omnimux-invalid-request',
        `mock gateway: task ${ref.taskId} does not survive a restart (nothing to reconcile)`,
      );
    },
  };
}
