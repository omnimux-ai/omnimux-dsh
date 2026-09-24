/**
 * plugins/omnimux-apps/src/host/executionBridge.ts
 *
 * Headless Execution Adapter & Parameter Injection Service for OmniMux AI Applications.
 *
 * Implements:
 * 1. Deep clone manifest.workflowBinding.snapshot (strictly immutability guarantee).
 * 2. Traverse manifest.fieldMappings and inject formValues into DAG nodes:
 *    - targetPath === 'data.content' -> node.data.content
 *    - targetPath.startsWith('data.params.') -> safe assign to node.data.params[paramKey]
 *    - targetSlot or slot mapping -> construct standard FeedAsset and bind to slot
 * 3. Connect with Canvas HeadlessExecutionSeam for Fail-Closed execution launching.
 *
 * Architecture SSOT: docs/contracts/workflow-app-boundary.md (Section 4 & 6)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApplicationManifest, FieldMappingEntry, FormWidgetType } from '../shared/manifest.ts';
import { PRESET_WORKFLOW_SNAPSHOTS } from '../shared/builtinCatalogData.ts';

function resolvePresetSnapshot(appId: string): any | null {
  if (PRESET_WORKFLOW_SNAPSHOTS && PRESET_WORKFLOW_SNAPSHOTS[appId]) {
    return PRESET_WORKFLOW_SNAPSHOTS[appId];
  }

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, '../catalog/presets', `${appId}.workflow.json`),
      path.resolve(currentDir, '../../catalog/presets', `${appId}.workflow.json`),
      path.resolve(currentDir, '../../../catalog/presets', `${appId}.workflow.json`),
      path.resolve(process.cwd(), 'plugins/omnimux-apps/catalog/presets', `${appId}.workflow.json`),
      path.resolve(process.cwd(), 'catalog/presets', `${appId}.workflow.json`),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED';

export interface WorkflowJobDescriptor {
  executionId: string;
  jobId: string;
  workspaceId: string;
  status: TaskStatus | string;
  rawStatus: string;
  totalNodes?: number;
  createdAt: string;
  streamUrl: string;
  eventsUrl: string;
  pollUrl: string;
}

export interface WorkflowJobArtifact {
  nodeId: string;
  id?: string;
  type?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
}

export interface WorkflowJobStatus {
  executionId: string;
  jobId: string;
  workspaceId?: string;
  status: TaskStatus | string;
  rawStatus: string;
  error?: string;
  progress?: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    percentage: number;
  };
  artifacts: WorkflowJobArtifact[];
  nodeOutputs?: Record<string, unknown>;
}

export interface HeadlessExecutionParams {
  workspaceId: string;
  workflowVersion?: string | number;
  expectedVersion?: number;
  snapshot?: PreparedWorkflowSnapshot | {
    nodes: Array<{ id: string; type?: string; data?: Record<string, unknown>; [key: string]: unknown }>;
    edges: Array<{ id?: string; source: string; target: string; data?: Record<string, unknown>; targetHandle?: string | null; [key: string]: unknown }>;
    settings?: Record<string, unknown>;
  };
  inputs?: Record<string, unknown>;
  nodeIds?: string[];
  mode?: string;
  caller?: {
    pluginId?: string;
    appId?: string;
    submittedAt?: string;
  };
  [key: string]: unknown;
}

/**
 * Headless execution seam duck-typed interface.
 * Decoupled from omnimux-workflow private implementation to preserve plugin boundary purity.
 */
export interface HeadlessExecutionSeam {
  executeHeadless(params: HeadlessExecutionParams | any): Promise<WorkflowJobDescriptor>;
  cancelJob(jobId: string): Promise<{ success: boolean; canceledAt: string; message?: string }>;
  getJobStatus(jobId: string): Promise<WorkflowJobStatus | null>;
}

export class ExecutionBridgeError extends Error {
  public readonly code:
    | 'validation_failed'
    | 'node_not_found'
    | 'required_field_missing'
    | 'seam_unavailable'
    | 'execution_failed';
  public readonly details?: unknown;

  constructor(
    code:
      | 'validation_failed'
      | 'node_not_found'
      | 'required_field_missing'
      | 'seam_unavailable'
      | 'execution_failed',
    message: string,
    details?: unknown,
  ) {
    super(`[ExecutionBridge] ${code}: ${message}`);
    this.name = 'ExecutionBridgeError';
    this.code = code;
    this.details = details;
  }
}

/** Standard FeedAsset shape required by OmniMux workflow slot kernel */
export interface InjectedFeedAsset {
  edgeId: string;
  sourceNodeId: string;
  outputId?: string;
  type: string;
  availability: 'ready' | 'waiting' | 'unavailable';
  ordinal: number;
  url?: string;
  pathOrUrl?: string;
  targetSlot?: string;
  role?: string;
}

export interface InjectedWorkflowNode {
  id: string;
  type?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface InjectedWorkflowEdge {
  id?: string;
  source: string;
  target: string;
  targetHandle?: string | null;
  data?: Record<string, any>;
  [key: string]: any;
}

/**
 * Decode a JSON-encoded picked-card form value (library-picker / media-extractor
 * picks and uploads). Returns null for plain pasted links and malformed input.
 */
function decodePickedFormValue(val: unknown): Record<string, any> | null {
  if (typeof val !== 'string' || !val.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through: treat as raw string
  }
  return null;
}

/**
 * Check if the widget is a media-capable widget that may supply picked JSON or media URLs.
 */
function isMediaWidget(widget: FormWidgetType | undefined): boolean {
  return (
    widget === 'media-uploader' ||
    widget === 'media-extractor' ||
    widget === 'library-picker' ||
    widget === 'product-link'
  );
}

export interface PreparedWorkflowSnapshot {
  nodes: InjectedWorkflowNode[];
  edges: InjectedWorkflowEdge[];
  settings?: Record<string, any>;
}

export interface ExecutionBridgeOptions {
  manifest: ApplicationManifest;
  formValues: Record<string, unknown>;
  headlessSeam?: HeadlessExecutionSeam;
  modelCatalog?: any;
  caller?: {
    pluginId?: string;
    appId?: string;
    submittedAt?: string;
  };
}

export interface ExecutionBridgeResult {
  taskId: string;
  executionId: string;
  jobId: string;
  workspaceId: string;
  status: TaskStatus | string;
  rawStatus: string;
  createdAt: string;
  streamUrl: string;
  eventsUrl: string;
  pollUrl: string;
  injectedSnapshot: PreparedWorkflowSnapshot;
}

export interface ModelCapabilityContract {
  id: string;
  parameters?: {
    duration?: {
      options?: Array<number | { label?: string; value: number }>;
      range?: { min?: number; max?: number; step?: number };
      defaultValue?: number;
      max?: number;
    };
    aspectRatio?: {
      options?: Array<string | { label?: string; value: string }>;
      defaultValue?: string;
      default?: string;
    };
    resolution?: {
      options?: Array<string | { label?: string; value: string }>;
      defaultValue?: string;
      default?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export const KNOWN_MODEL_CAPABILITY_CONTRACTS: Record<string, ModelCapabilityContract> = {
  'seedance-2.0': {
    id: 'seedance-2.0',
    parameters: {
      duration: {
        range: { min: 4, max: 15, step: 1 },
        defaultValue: 5,
        max: 15,
      },
      aspectRatio: {
        options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
        defaultValue: '16:9',
      },
      resolution: {
        options: ['480p', '720p'],
        defaultValue: '720p',
      },
    },
  },
  'seedance-2-0': {
    id: 'seedance-2-0',
    parameters: {
      duration: {
        range: { min: 4, max: 15, step: 1 },
        defaultValue: 5,
        max: 15,
      },
      aspectRatio: {
        options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
        defaultValue: '16:9',
      },
      resolution: {
        options: ['480p', '720p'],
        defaultValue: '720p',
      },
    },
  },
  'minimax-h3': {
    id: 'minimax-h3',
    parameters: {
      duration: {
        options: [5, 10],
        defaultValue: 5,
        max: 10,
      },
      aspectRatio: {
        options: ['16:9', '9:16', '1:1', '4:3', '21:9'],
        defaultValue: '16:9',
      },
      resolution: {
        options: ['768p', '1080p'],
        defaultValue: '768p',
      },
    },
  },
  'kling-v1-6': {
    id: 'kling-v1-6',
    parameters: {
      duration: {
        options: [5, 10],
        defaultValue: 5,
        max: 10,
      },
      aspectRatio: {
        options: ['9:16', '16:9', '1:1'],
        defaultValue: '9:16',
      },
      resolution: {
        options: ['1080p'],
        defaultValue: '1080p',
      },
    },
  },
  'kling-o3': {
    id: 'kling-o3',
    parameters: {
      duration: {
        options: [5, 10, 15],
        defaultValue: 5,
        max: 15,
      },
      aspectRatio: {
        options: ['9:16', '16:9', '1:1'],
        defaultValue: '9:16',
      },
      resolution: {
        options: ['1080p', '4k'],
        defaultValue: '1080p',
      },
    },
  },
  'kling-v2-master': {
    id: 'kling-v2-master',
    parameters: {
      duration: {
        options: [5, 10],
        defaultValue: 5,
        max: 10,
      },
      aspectRatio: {
        options: ['9:16', '16:9', '1:1'],
        defaultValue: '9:16',
      },
      resolution: {
        options: ['1080p'],
        defaultValue: '1080p',
      },
    },
  },
  'gpt-image-2.5': {
    id: 'gpt-image-2.5',
    parameters: {
      aspectRatio: {
        options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
        defaultValue: '1:1',
      },
      resolution: {
        options: ['1024x1024'],
        defaultValue: '1024x1024',
      },
    },
  },
  'flux-1-schnell': {
    id: 'flux-1-schnell',
    parameters: {
      aspectRatio: {
        options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        defaultValue: '1:1',
      },
      resolution: {
        options: ['1024x1024'],
        defaultValue: '1024x1024',
      },
    },
  },
  'wan-3.0': {
    id: 'wan-3.0',
    parameters: {
      duration: {
        max: 15,
        defaultValue: 5,
      },
      aspectRatio: {
        options: ['16:9', '9:16', '1:1'],
        defaultValue: '16:9',
      },
      resolution: {
        options: ['720p', '1080p'],
        defaultValue: '720p',
      },
    },
  },
};

export function resolveModelContract(modelId: string, customCatalog?: any): ModelCapabilityContract | null {
  if (!modelId || typeof modelId !== 'string') return null;
  const normalizedId = modelId.trim().toLowerCase();

  if (customCatalog) {
    let list: any[] = [];
    if (Array.isArray(customCatalog)) {
      list = customCatalog;
    } else if (typeof customCatalog === 'object') {
      if (Array.isArray(customCatalog.models)) list = customCatalog.models;
      else if (Array.isArray(customCatalog.video)) list = [...list, ...customCatalog.video];
      else if (Array.isArray(customCatalog.image)) list = [...list, ...customCatalog.image];
    }
    const found = list.find((m) => m && (m.id === modelId || m.id?.toLowerCase() === normalizedId));
    if (found) return found;
  }

  if (KNOWN_MODEL_CAPABILITY_CONTRACTS[normalizedId]) {
    return KNOWN_MODEL_CAPABILITY_CONTRACTS[normalizedId];
  }

  const aliasKey = Object.keys(KNOWN_MODEL_CAPABILITY_CONTRACTS).find(
    (k) => k === normalizedId || k.replace(/[-_.]/g, '') === normalizedId.replace(/[-_.]/g, ''),
  );
  if (aliasKey) {
    return KNOWN_MODEL_CAPABILITY_CONTRACTS[aliasKey];
  }

  return null;
}

/**
 * Step 1 & Step 2: Prepare and inject form parameters into a deep-cloned workflow snapshot.
 * Guarantees that the input manifest snapshot is NEVER modified in-place (Fail-Closed immutability).
 */
export function prepareAndInjectWorkflowSnapshot(
  manifest: ApplicationManifest,
  formValues: Record<string, unknown> = {},
  options?: { modelCatalog?: any },
): PreparedWorkflowSnapshot {
  if (!manifest || typeof manifest !== 'object') {
    throw new ExecutionBridgeError('validation_failed', 'ApplicationManifest must be a valid object');
  }
  let rawSnapshot = manifest.workflowBinding?.snapshot;
  if (!rawSnapshot && manifest.appId) {
    rawSnapshot = resolvePresetSnapshot(manifest.appId);
  }
  if (!rawSnapshot) {
    throw new ExecutionBridgeError(
      'validation_failed',
      `ApplicationManifest is missing workflowBinding.snapshot and no preset snapshot found for appId: ${manifest.appId}`,
    );
  }

  // Step 1: Deep clone snapshot to enforce strict immutability of the manifest
  const snapshotCopy = structuredClone(rawSnapshot);
  const nodes = (Array.isArray(snapshotCopy.nodes) ? snapshotCopy.nodes : []) as InjectedWorkflowNode[];
  const edges = (Array.isArray(snapshotCopy.edges) ? snapshotCopy.edges : []) as InjectedWorkflowEdge[];
  const settings: Record<string, any> = (snapshotCopy as any).settings || {};

  if (nodes.length === 0) {
    throw new ExecutionBridgeError('validation_failed', 'Workflow snapshot contains no nodes');
  }

  // Step 1.5: 强制规范所有插槽节点 (isSlot, slotRole, node-slot-*) 为 import 节点，杜绝被调度内核误判为生成节点
  for (const node of nodes) {
    const d = node.data || {};
    if (
      d.isSlot ||
      d.slotRole ||
      node.id.startsWith('node-slot-') ||
      d.tool === 'import-image' ||
      d.tool === 'prompt-template'
    ) {
      node.data = node.data || {};
      node.data.nodeKind = 'import';
      node.data.selectedTool = 'import';
      node.data.status = 'completed';
      if (d.type && !node.data.materialType) {
        node.data.materialType = d.type;
      }
    }
  }

  // Step 2: Traverse fieldMappings and inject formValues
  const fieldMappings = manifest.fieldMappings || {};

  for (const [fieldKey, mapping] of Object.entries(fieldMappings)) {
    const val = formValues[fieldKey] !== undefined ? formValues[fieldKey] : mapping.defaultValue;

    // Validate required fields (Fail-Closed)
    if (mapping.required && (val === undefined || val === null || val === '')) {
      throw new ExecutionBridgeError(
        'required_field_missing',
        `Required form field "${fieldKey}" is missing. Execution rejected (Fail-Closed).`,
      );
    }

    // If optional and not supplied, skip injection
    if (val === undefined || val === null) {
      continue;
    }

    // Locate target node in DAG
    const targetNode = nodes.find((n) => n.id === mapping.nodeId);
    if (!targetNode) {
      throw new ExecutionBridgeError(
        'node_not_found',
        `Target node "${mapping.nodeId}" specified in mapping for "${fieldKey}" not found in workflow snapshot`,
      );
    }

    targetNode.data = targetNode.data || {};
    const targetPath = ((mapping as any).targetPath || mapping.targetField || '').trim();

    // 2.1: Content text injection
    if (targetPath === 'data.content' || targetPath === 'content') {
      const textVal = typeof val === 'string' ? val : String(val);
      targetNode.data.content = textVal;
      if (targetNode.data.prompt !== undefined) {
        targetNode.data.prompt = textVal;
      }
    }
    // 2.2: Parameter injection (data.params.<paramKey> or params.<paramKey>)
    else if (targetPath.startsWith('data.params.') || targetPath.startsWith('params.')) {
      const paramKey = targetPath.startsWith('data.params.')
        ? targetPath.slice('data.params.'.length)
        : targetPath.slice('params.'.length);
      targetNode.data.params =
        targetNode.data.params && typeof targetNode.data.params === 'object'
          ? { ...targetNode.data.params }
          : {};
      targetNode.data.params[paramKey] = val;
    }
    // 2.3: Direct prompt injection
    else if (targetPath === 'prompt' || targetPath === 'data.prompt') {
      const textVal = typeof val === 'string' ? val : String(val);
      targetNode.data.prompt = textVal;
      targetNode.data.content = textVal;
    }
    // 2.4: General data field injection
    else if (targetPath.startsWith('data.')) {
      const dataKey = targetPath.slice('data.'.length);
      targetNode.data[dataKey] = val;
    }

    // 2.5: Slot association & standard FeedAsset construction
    const hasExplicitSlot = Boolean((mapping as any).targetSlot);
    const isSlotMapping = mapping.mappingType === 'slot' || targetPath.startsWith('slot:');
    const isMedia = isMediaWidget(mapping.widget);

    if (hasExplicitSlot || isSlotMapping || isMedia) {
      const slotName =
        (mapping as any).targetSlot ||
        (targetPath.startsWith('slot:') ? targetPath.slice(5) : (mapping.mappingType === 'slot' ? targetPath : 'input'));

      // Library-picked / uploaded values are JSON-encoded picked cards
      // ({name, sub, url, source, type?}); plain pasted links stay raw strings.
      const picked = decodePickedFormValue(val);

      // Fail-closed: a value shaped like a picked card (leading '{') that fails
      // to decode, or decodes to a card without a media URL, must NOT be
      // injected — passing the raw JSON fragment through as mediaUrl would
      // silently feed a broken URL into the slot.
      const trimmedVal = typeof val === 'string' ? val.trim() : '';
      if (trimmedVal.startsWith('{') && (!picked || !(picked.url || picked.pathOrUrl))) {
        throw new ExecutionBridgeError(
          'validation_failed',
          `Form field "${fieldKey}" holds a malformed library-picked value; refusing to inject it as a media URL.`,
        );
      }

      const mediaUrl = picked
        ? String(picked.url || picked.pathOrUrl || '')
        : typeof val === 'string'
          ? val
          : typeof val === 'object' && val !== null
            ? (val as any).url || (val as any).pathOrUrl || ''
            : String(val);

      const mediaType =
        (picked && picked.type) ||
        (typeof val === 'object' && val !== null && (val as any).type
          ? (val as any).type
          : mapping.widget === 'media-extractor' || mapping.widget === 'media-uploader'
            ? manifest.metadata.category || 'video'
            : 'image');

      if (
        targetPath === 'mediaUrl' ||
        targetPath === 'data.mediaUrl' ||
        targetPath === 'url' ||
        targetPath === 'data.url' ||
        mapping.mappingType === 'media'
      ) {
        targetNode.data.mediaUrl = mediaUrl;
        targetNode.data.mediaAssets = [
          {
            type: mediaType,
            url: mediaUrl,
          },
        ];
      }

      const feedAsset: InjectedFeedAsset = {
        edgeId: `feed-edge-${targetNode.id}-${fieldKey}`,
        sourceNodeId: `input-source-${fieldKey}`,
        type: mediaType,
        availability: 'ready',
        ordinal: 0,
        url: mediaUrl,
        pathOrUrl: mediaUrl,
        targetSlot: slotName,
        role: (mapping as any).role || slotName,
      };

      // Bind to node feedAssets & slotBindings
      targetNode.data.feedAssets = Array.isArray(targetNode.data.feedAssets)
        ? [...targetNode.data.feedAssets, feedAsset]
        : [feedAsset];

      targetNode.data.slotBindings = targetNode.data.slotBindings || {};
      targetNode.data.slotBindings[slotName] = targetNode.data.slotBindings[slotName] || [];
      targetNode.data.slotBindings[slotName].push({
        sourceNodeId: feedAsset.sourceNodeId,
        edgeId: feedAsset.edgeId,
        outputId: feedAsset.outputId,
        pinned: true,
      });

      // Construct virtual source node and edge so readNodeInputSource and prepareExecutionSlotGraph resolve it
      nodes.push({
        id: feedAsset.sourceNodeId,
        type: 'material',
        data: {
          label: mapping.label || fieldKey,
          materialType: mediaType,
          nodeKind: 'import',
          selectedTool: 'import',
          mediaUrl,
          mediaAssets: [
            {
              type: mediaType,
              url: mediaUrl,
            },
          ],
          status: 'completed',
        },
      });

      edges.push({
        id: feedAsset.edgeId,
        source: feedAsset.sourceNodeId,
        target: targetNode.id,
        targetHandle: slotName,
        data: {
          slotBinding: { role: feedAsset.role },
          feedType: mediaType,
          role: feedAsset.role,
          targetSlot: slotName,
        },
      });
    }
  }

  // Step 2.6: 动态模型穿透 (Issue 2631)
  // 当用户在表单中显式选定生成模型（通过 formValues.__model__ 或 formValues.model 传入）时，
  // 遍历工作流 DAG 节点，定位主生成引擎节点并安全覆盖其模型定义，保持连线拓扑不变
  const rawSelectedModel = (formValues as any).__model__ || (formValues as any).model;
  if (typeof rawSelectedModel === 'string' && rawSelectedModel.trim() !== '') {
    const selectedModel = rawSelectedModel.trim();
    const generatorNode = nodes.find((n) => {
      const d = n.data || {};
      if (d.nodeKind === 'import' || d.isSlot || d.slotRole || n.id.startsWith('node-slot-')) {
        return false;
      }
      return (
        d.tool === 'omnimux_video_submit' ||
        d.tool === 'omnimux_image_submit' ||
        d.type === 'video' ||
        d.type === 'image' ||
        d.materialType === 'video' ||
        d.materialType === 'image' ||
        n.type === 'video' ||
        n.type === 'image'
      );
    });

    if (generatorNode) {
      generatorNode.data = generatorNode.data || {};
      generatorNode.data.model = selectedModel;
      generatorNode.data.params =
        generatorNode.data.params && typeof generatorNode.data.params === 'object'
          ? generatorNode.data.params
          : {};
      generatorNode.data.params.model = selectedModel;

      // 未公开隐藏参数的契约自愈 (Issue #2642)
      // 遍历未在表单公开由作者固定的后台参数（node.data.params）并进行安全校准
      const contract = resolveModelContract(selectedModel, options?.modelCatalog);
      if (contract && contract.parameters) {
        const exposedParamKeys = new Set<string>();
        for (const mapping of Object.values(fieldMappings)) {
          if (mapping.nodeId === generatorNode.id) {
            const tp = ((mapping as any).targetPath || mapping.targetField || '').trim();
            if (tp.startsWith('data.params.')) {
              exposedParamKeys.add(tp.slice('data.params.'.length));
            } else if (tp.startsWith('params.')) {
              exposedParamKeys.add(tp.slice('params.'.length));
            }
          }
        }

        const params = generatorNode.data.params;

        // 1. 时长校准：未在表单公开且存在时，若超过新模型允许的最大时长，自动收敛为该模型最大支持时长
        if (!exposedParamKeys.has('duration') && params.duration !== undefined && params.duration !== null) {
          const currentDur = Number(params.duration);
          if (!Number.isNaN(currentDur)) {
            let maxDuration: number | null = null;
            const durSpec = contract.parameters.duration;
            if (durSpec) {
              if (durSpec.range?.max !== undefined) {
                maxDuration = Number(durSpec.range.max);
              } else if (durSpec.max !== undefined) {
                maxDuration = Number(durSpec.max);
              } else if (Array.isArray(durSpec.options) && durSpec.options.length > 0) {
                maxDuration = Math.max(
                  ...durSpec.options.map((o: any) =>
                    typeof o === 'object' && o !== null && 'value' in o ? Number(o.value) : Number(o),
                  ),
                );
              }
            }

            if (maxDuration !== null && currentDur > maxDuration) {
              params.duration = maxDuration;
            }
          }
        }

        // 2. 比例校准：未在表单公开且存在时，若不被新模型支持，自动收敛为新模型默认比例
        if (!exposedParamKeys.has('aspectRatio') && params.aspectRatio !== undefined && params.aspectRatio !== null) {
          const ratioSpec = contract.parameters.aspectRatio;
          if (ratioSpec && Array.isArray(ratioSpec.options) && ratioSpec.options.length > 0) {
            const validRatios = ratioSpec.options.map((o: any) =>
              typeof o === 'object' && o !== null && 'value' in o ? String(o.value) : String(o),
            );
            if (!validRatios.includes(String(params.aspectRatio))) {
              const defRatio = ratioSpec.defaultValue || ratioSpec.default || validRatios[0];
              if (defRatio) {
                params.aspectRatio = defRatio;
              }
            }
          }
        }

        // 3. 分辨率校准：未在表单公开且存在时，若不被新模型支持，自动收敛为新模型默认分辨率
        if (!exposedParamKeys.has('resolution') && params.resolution !== undefined && params.resolution !== null) {
          const resSpec = contract.parameters.resolution;
          if (resSpec && Array.isArray(resSpec.options) && resSpec.options.length > 0) {
            const validRes = resSpec.options.map((o: any) =>
              typeof o === 'object' && o !== null && 'value' in o ? String(o.value).toLowerCase() : String(o).toLowerCase(),
            );
            if (!validRes.includes(String(params.resolution).toLowerCase())) {
              const defRes =
                resSpec.defaultValue ||
                resSpec.default ||
                (typeof resSpec.options[0] === 'object' && resSpec.options[0] !== null && 'value' in resSpec.options[0]
                  ? resSpec.options[0].value
                  : resSpec.options[0]);
              if (defRes) {
                params.resolution = defRes;
              }
            }
          }
        }
      }
    } else {
      console.warn(
        `[omnimux:executionBridge] 指定了模型 ${selectedModel}，但在工作流快照中未定位到主生成引擎节点，无法执行模型动态穿透`,
      );
    }
  }

  return {
    nodes,
    edges,
    settings,
  };
}

/**
 * Step 3: Connect with Canvas HeadlessExecutionSeam and launch headless execution.
 */
export async function executeAppWorkflow(options: ExecutionBridgeOptions): Promise<ExecutionBridgeResult> {
  const { manifest, formValues, headlessSeam, caller } = options;

  if (!headlessSeam || typeof headlessSeam.executeHeadless !== 'function') {
    throw new ExecutionBridgeError(
      'seam_unavailable',
      'HeadlessExecutionSeam is required and must be provided to execute app workflow',
    );
  }

  // 1 & 2: Prepare and inject parameters into deep-cloned snapshot
  const injectedSnapshot = prepareAndInjectWorkflowSnapshot(manifest, formValues, {
    modelCatalog: options.modelCatalog,
  });

  // 3: Call Canvas HeadlessExecutionSeam
  try {
    const descriptor: WorkflowJobDescriptor = await headlessSeam.executeHeadless({
      workspaceId: manifest.workflowBinding.workspaceId,
      workflowVersion: manifest.workflowBinding.workflowHash,
      snapshot: injectedSnapshot,
      inputs: formValues,
      caller: {
        pluginId: 'omnimux-apps',
        appId: manifest.appId,
        submittedAt: new Date().toISOString(),
        ...caller,
      },
    });

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    return {
      taskId,
      executionId: descriptor.executionId,
      jobId: descriptor.jobId,
      workspaceId: descriptor.workspaceId,
      status: descriptor.status,
      rawStatus: descriptor.rawStatus,
      createdAt: descriptor.createdAt,
      streamUrl: descriptor.streamUrl,
      eventsUrl: descriptor.eventsUrl,
      pollUrl: descriptor.pollUrl,
      injectedSnapshot,
    };
  } catch (err: any) {
    if (err instanceof ExecutionBridgeError) throw err;
    throw new ExecutionBridgeError(
      'execution_failed',
      `Failed to launch headless execution: ${err.message}`,
      err.details,
    );
  }
}

/**
 * Query current execution status and reconcile artifacts.
 */
export async function queryExecutionStatus(
  executionId: string,
  headlessSeam: HeadlessExecutionSeam,
): Promise<WorkflowJobStatus | null> {
  if (!headlessSeam || typeof headlessSeam.getJobStatus !== 'function') {
    throw new ExecutionBridgeError('seam_unavailable', 'HeadlessExecutionSeam is required to query execution status');
  }
  return headlessSeam.getJobStatus(executionId);
}

/**
 * Cancel a running execution.
 */
export async function cancelAppExecution(
  executionId: string,
  headlessSeam: HeadlessExecutionSeam,
): Promise<{ success: boolean; canceledAt: string; message?: string }> {
  if (!headlessSeam || typeof headlessSeam.cancelJob !== 'function') {
    throw new ExecutionBridgeError('seam_unavailable', 'HeadlessExecutionSeam is required to cancel execution');
  }
  return headlessSeam.cancelJob(executionId);
}
