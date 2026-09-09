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

import type { ApplicationManifest, FieldMappingEntry } from '../shared/manifest.ts';

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

export interface PreparedWorkflowSnapshot {
  nodes: InjectedWorkflowNode[];
  edges: InjectedWorkflowEdge[];
  settings?: Record<string, any>;
}

export interface ExecutionBridgeOptions {
  manifest: ApplicationManifest;
  formValues: Record<string, unknown>;
  headlessSeam?: HeadlessExecutionSeam;
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

/**
 * Step 1 & Step 2: Prepare and inject form parameters into a deep-cloned workflow snapshot.
 * Guarantees that the input manifest snapshot is NEVER modified in-place (Fail-Closed immutability).
 */
export function prepareAndInjectWorkflowSnapshot(
  manifest: ApplicationManifest,
  formValues: Record<string, unknown> = {},
): PreparedWorkflowSnapshot {
  if (!manifest || typeof manifest !== 'object') {
    throw new ExecutionBridgeError('validation_failed', 'ApplicationManifest must be a valid object');
  }
  if (!manifest.workflowBinding || !manifest.workflowBinding.snapshot) {
    throw new ExecutionBridgeError('validation_failed', 'ApplicationManifest is missing workflowBinding.snapshot');
  }

  // Step 1: Deep clone snapshot to enforce strict immutability of the manifest
  const rawSnapshot = manifest.workflowBinding.snapshot;
  const snapshotCopy = structuredClone(rawSnapshot);
  const nodes = (Array.isArray(snapshotCopy.nodes) ? snapshotCopy.nodes : []) as InjectedWorkflowNode[];
  const edges = (Array.isArray(snapshotCopy.edges) ? snapshotCopy.edges : []) as InjectedWorkflowEdge[];
  const settings: Record<string, any> = (snapshotCopy as any).settings || {};

  if (nodes.length === 0) {
    throw new ExecutionBridgeError('validation_failed', 'Workflow snapshot contains no nodes');
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
    const isMediaWidget = mapping.widget === 'media-uploader' || mapping.widget === 'media-extractor';

    if (hasExplicitSlot || isSlotMapping || isMediaWidget) {
      const slotName =
        (mapping as any).targetSlot ||
        (targetPath.startsWith('slot:') ? targetPath.slice(5) : (mapping.mappingType === 'slot' ? targetPath : 'input'));

      const mediaUrl =
        typeof val === 'string'
          ? val
          : typeof val === 'object' && val !== null
            ? (val as any).url || (val as any).pathOrUrl || ''
            : String(val);

      const mediaType =
        typeof val === 'object' && val !== null && (val as any).type
          ? (val as any).type
          : mapping.widget === 'media-extractor' || mapping.widget === 'media-uploader'
            ? manifest.metadata.category || 'video'
            : 'image';

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
  const injectedSnapshot = prepareAndInjectWorkflowSnapshot(manifest, formValues);

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
