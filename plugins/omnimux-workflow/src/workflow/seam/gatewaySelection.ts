/**
 * ★ M4: gateway assembly — pick the OmniMux seam client or the mock gateway
 * at mount time, with a configurable override.
 *
 * Selection rules (README「真实网关」chapter):
 *  - `OMNIMUX_WORKFLOW_GATEWAY=mock`     → always mockGateway (dev/offline).
 *  - `OMNIMUX_WORKFLOW_GATEWAY=omnimux`  → always the seam client; missing
 *    seams surface as node errors (`needs-provider`), never silent mocks.
 *  - default `auto`                       → probe `ctx.get` seams at mount;
 *    hub present → seam client, otherwise mock. In auto mode the probe is
 *    repeated before each submit/capabilities call so a hub mounted after
 *    this plugin still upgrades the gateway (one-way: mock → omnimux; an
 *    in-flight mock task keeps its mock owner).
 */

import type { GenerationGateway } from './gateway';
import { createMockGateway } from './mockGateway';
import {
  createOmnimuxSeamClient,
  resolveCanvasSubmission,
  type SeamGetter,
} from './omnimuxGateway';
import { createWorkflowLogger } from '../execution/logger';

const LOG_TAG = 'gatewaySelection';

const logger = createWorkflowLogger(LOG_TAG);

/** Env knob selecting the gateway backend. */
export const GATEWAY_MODE_ENV = 'OMNIMUX_WORKFLOW_GATEWAY';

export type GatewayMode = 'auto' | 'omnimux' | 'mock';

/** Parse the env override; anything unrecognized falls back to 'auto'. */
export function resolveGatewayMode(env: NodeJS.ProcessEnv = process.env): GatewayMode {
  const raw = env[GATEWAY_MODE_ENV];
  if (raw === 'mock' || raw === 'omnimux' || raw === 'auto') return raw;
  return 'auto';
}

export interface SeamAvailability {
  video: boolean;
  image: boolean;
  audio: boolean;
  text: boolean;
}

/** Probe the cordis seam registry (a seam must expose execute()). */
export function probeSeams(getSeam: SeamGetter): SeamAvailability {
  const isApi = (name: string): boolean => {
    const value = getSeam(name);
    return (
      typeof value === 'object'
      && value !== null
      && typeof (value as { execute?: unknown }).execute === 'function'
    );
  };
  return {
    video: isApi('videoGenerate'),
    image: isApi('imageGenerate'),
    audio: isApi('audioGenerate'),
    text: isApi('textComplete'),
  };
}

export interface AutoSwitchGatewayOptions {
  getSeam: SeamGetter;
  /** Mock backend (default: a fresh createMockGateway()). */
  mockGateway?: GenerationGateway;
  /** OmniMux backend (default: a fresh createOmnimuxSeamClient). */
  omnimuxGateway?: GenerationGateway;
  env?: NodeJS.ProcessEnv;
}

export type AutoSwitchGateway = GenerationGateway & {
  /** Currently active backend ('mock' until the hub seam shows up). */
  currentMode(): 'mock' | 'omnimux';
};

function hasModelCatalog(getSeam: SeamGetter): boolean {
  const catalog = getSeam('modelCatalog');
  return (
    typeof catalog === 'object'
    && catalog !== null
    && typeof (catalog as { list?: unknown }).list === 'function'
  );
}

/**
 * Offline generation paired with the hub's local catalog projection. This
 * lets L2 validate the real model/operation contract without ever invoking a
 * generation seam; only mock submit/await own artifacts and task lifecycles.
 */
function createCatalogAwareMockGateway(getSeam: SeamGetter, env?: NodeJS.ProcessEnv): GenerationGateway {
  const mock = createMockGateway();
  const catalogProjection = createOmnimuxSeamClient({ getSeam, env });
  return {
    submit: async (request) => mock.submit(hasModelCatalog(getSeam)
      ? resolveCanvasSubmission(request, await catalogProjection.capabilities())
      : request),
    awaitTask: (taskId, dest, signal) => mock.awaitTask(taskId, dest, signal),
    capabilities: () => (
      hasModelCatalog(getSeam)
        ? catalogProjection.capabilities()
        : mock.capabilities()
    ),
  };
}

/**
 * Auto mode backend: delegates to the omnimux seam client once the hub is
 * reachable, with per-task routing so a task submitted through the mock is
 * still awaited through the mock.
 */
export function createAutoSwitchGateway(opts: AutoSwitchGatewayOptions): AutoSwitchGateway {
  const mock = opts.mockGateway ?? createMockGateway();
  const omnimux =
    opts.omnimuxGateway
    ?? createOmnimuxSeamClient({ getSeam: opts.getSeam, env: opts.env });

  let mode: 'mock' | 'omnimux' = (() => {
    const seams = probeSeams(opts.getSeam);
    return seams.video || seams.image || seams.audio || seams.text ? 'omnimux' : 'mock';
  })();

  /** task/submit ownership: a submitted task is awaited by its own backend. */
  const taskOwners = new Map<string, 'mock' | 'omnimux'>();

  /** One-way upgrade (mock → omnimux) when the hub seam appears late. */
  const pick = (): 'mock' | 'omnimux' => {
    if (mode === 'mock') {
      const seams = probeSeams(opts.getSeam);
      if (seams.video || seams.image || seams.audio || seams.text) {
        mode = 'omnimux';
        logger.info('execution hub seams detected after mount; upgrading gateway', {
          seams,
        });
      }
    }
    return mode;
  };

  /** Resolve the active backend gateway object from the current mode. */
  const backendOf = (): GenerationGateway => (pick() === 'mock' ? mock : omnimux);

  return {
    async submit(req) {
      const backend = backendOf();
      const result = await backend.submit(req);
      taskOwners.set(result.taskId, backend === omnimux ? 'omnimux' : 'mock');
      return result;
    },

    async awaitTask(taskId, dest, signal) {
      const owner = taskOwners.get(taskId);
      const backend = owner === 'mock' ? mock : owner === 'omnimux' ? omnimux : backendOf();
      try {
        return await backend.awaitTask(taskId, dest, signal);
      } finally {
        taskOwners.delete(taskId);
      }
    },

    async capabilities() {
      return backendOf().capabilities();
    },

    currentMode() {
      return mode;
    },
  };
}

export interface AssembleGatewayOptions {
  getSeam: SeamGetter;
  mode?: GatewayMode;
  env?: NodeJS.ProcessEnv;
  /** Passed through to the seam client (concurrency cap). */
  seamConcurrency?: number;
}

export interface AssembledGateway {
  gateway: GenerationGateway;
  mode: GatewayMode;
  /** Effective backend after the mount-time probe ('auto' resolves here). */
  backend: 'mock' | 'omnimux';
}

/**
 * Mount-time assembly. Explicit `opts.gateway` on mountWorkflowHost still
 * wins (tests / embedding code); this function is the default.
 */
export function assembleGateway(opts: AssembleGatewayOptions): AssembledGateway {
  const mode = opts.mode ?? resolveGatewayMode(opts.env);

  if (mode === 'mock') {
    logger.info('gateway mode: mock (explicit override; local catalog when available)');
    return { gateway: createCatalogAwareMockGateway(opts.getSeam, opts.env), mode, backend: 'mock' };
  }

  const omnimux = createOmnimuxSeamClient({
    getSeam: opts.getSeam,
    env: opts.env,
    ...(opts.seamConcurrency !== undefined ? { maxConcurrency: opts.seamConcurrency } : {}),
  });

  if (mode === 'omnimux') {
    logger.info('gateway mode: omnimux (explicit override; missing seams will fail visibly)');
    return { gateway: omnimux, mode, backend: 'omnimux' };
  }

  const seams = probeSeams(opts.getSeam);
  const backend: 'mock' | 'omnimux' = seams.video || seams.image || seams.audio || seams.text
    ? 'omnimux'
    : 'mock';
  logger.info('gateway mode: auto', { seams, backend });
  if (backend === 'mock') {
    // Auto wrapper keeps the upgrade path (hub mounted later in the session).
    return {
      gateway: createAutoSwitchGateway({
        getSeam: opts.getSeam,
        omnimuxGateway: omnimux,
        env: opts.env,
      }),
      mode,
      backend,
    };
  }
  return { gateway: omnimux, mode, backend };
}
