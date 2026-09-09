/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts
 *
 * Pure function workflow topology analyzer for AI Application publishing.
 * Computes InDegree/OutDegree, classifies root vs generative nodes, extracts
 * unwired slots & parameters, and derives UI form widget mappings.
 *
 * Architecture SSOT: docs/contracts/workflow-app-boundary.md & ai-app-ui-spec.md
 */

import type {
  ApplicationCategory,
  FormWidgetType,
  ExposedWorkflowInput,
  WorkflowAnalysisResult,
  GeneratedFormConfig,
  RestrictedJsonSchema,
  FormPropertySchema,
  FieldMappingEntry,
} from './publishTypes.ts';
import { NodeSpecRegistry } from '../../../../shared/specs/registry.ts';

export const STANDARD_ASPECT_RATIOS = ['1:1', '4:3', '16:9', '9:16'] as const;

/** Minimal interface representing a canvas node */
export interface FlowNodeLike {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

/** Minimal interface representing a canvas edge */
export interface FlowEdgeLike {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Optional tool catalog provider */
export interface ToolCatalogProvider {
  getToolSpec?(nodeType: string, toolId: string): any;
  [key: string]: any;
}

/**
 * Pure function: Analyze workflow topology and extract inputs for app publishing.
 *
 * 1. Computes InDegree and OutDegree for each node.
 * 2. InDegree === 0 (root nodes like text prompt or media import):
 *    Default to mandatory core inputs (isExposed: true, isRequired: true).
 * 3. InDegree > 0 (generative nodes):
 *    Default to unexposed (isExposed: false, isRequired: false),
 *    but extracts unwired slots and adjustable parameters as advanced options.
 * 4. Derives widget mappings:
 *    - Text: textarea / input-text
 *    - Media: media-uploader
 *    - Ratio/Enum: ratio-cards / select-single
 *    - Slider/Number: slider-range
 *    - Switch/Boolean: switch-boolean
 * 5. Recommends top-level category from terminal nodes (video | image | audio).
 * 6. Generates deterministic SHA-256 workflowHash.
 */
export function analyzeWorkflowInputs(
  nodes: FlowNodeLike[],
  edges: FlowEdgeLike[],
  catalog?: ToolCatalogProvider,
): WorkflowAnalysisResult {
  const nodeInDegrees: Record<string, number> = {};
  const nodeOutDegrees: Record<string, number> = {};

  for (const node of nodes) {
    nodeInDegrees[node.id] = 0;
    nodeOutDegrees[node.id] = 0;
  }

  for (const edge of edges) {
    const curIn = nodeInDegrees[edge.target];
    if (curIn !== undefined) {
      nodeInDegrees[edge.target] = curIn + 1;
    }
    const curOut = nodeOutDegrees[edge.source];
    if (curOut !== undefined) {
      nodeOutDegrees[edge.source] = curOut + 1;
    }
  }

  const rootNodeIds: string[] = [];
  const terminalNodeIds: string[] = [];

  for (const node of nodes) {
    const inDeg = nodeInDegrees[node.id] ?? 0;
    const outDeg = nodeOutDegrees[node.id] ?? 0;

    if (inDeg === 0) {
      rootNodeIds.push(node.id);
    }
    if (outDeg === 0) {
      terminalNodeIds.push(node.id);
    }
  }

  const inputs: ExposedWorkflowInput[] = [];

  for (const node of nodes) {
    const inDeg = nodeInDegrees[node.id] ?? 0;
    const data = node.data || {};
    const materialType = (data.materialType as string) || 'text';
    const selectedTool = (data.selectedTool as string) || '';
    const nodeKind = (data.nodeKind as string) || (selectedTool === 'import' ? 'import' : 'generate');
    const nodeLabel = (data.label as string) || `${materialType} Node`;

    if (inDeg === 0) {
      // Root node: default exposed & required
      if (materialType === 'text' || selectedTool === 'text-editor' || node.type === 'text') {
        const targetField = data.content !== undefined ? 'content' : 'prompt';
        const defaultVal = (data.content ?? data.prompt ?? '') as string;
        inputs.push({
          key: `${node.id}_${targetField}`,
          nodeId: node.id,
          nodeLabel,
          nodeKind,
          targetField,
          fieldTitle: (data.label as string) || 'Prompt Text',
          description: 'Primary text prompt input',
          valueType: 'string',
          widget: 'textarea',
          isExposed: true,
          isRequired: true,
          defaultValue: defaultVal,
          inDegree: inDeg,
          isRoot: true,
          mappingType: 'text',
        });
      } else if (
        nodeKind === 'import' ||
        selectedTool === 'import' ||
        ['image', 'video', 'audio'].includes(materialType)
      ) {
        const defaultVal = (data.mediaUrl ?? data.relativePath ?? '') as string;
        inputs.push({
          key: `${node.id}_media`,
          nodeId: node.id,
          nodeLabel,
          nodeKind,
          targetField: 'mediaUrl',
          fieldTitle: (data.label as string) || `${capitalize(materialType)} Asset`,
          description: `Primary ${materialType} input asset`,
          valueType: 'string',
          widget: 'media-uploader',
          isExposed: true,
          isRequired: true,
          defaultValue: defaultVal,
          inDegree: inDeg,
          isRoot: true,
          mappingType: 'media',
        });
      } else {
        inputs.push({
          key: `${node.id}_input`,
          nodeId: node.id,
          nodeLabel,
          nodeKind,
          targetField: 'value',
          fieldTitle: (data.label as string) || 'Input',
          description: 'Root workflow input',
          valueType: 'string',
          widget: 'input-text',
          isExposed: true,
          isRequired: true,
          defaultValue: data.value ?? '',
          inDegree: inDeg,
          isRoot: true,
          mappingType: 'text',
        });
      }
    } else {
      // InDegree > 0: Generative or intermediate node (default unexposed / optional)
      // 1. Unwired input slots
      const incomingEdges = edges.filter((e) => e.target === node.id);
      const connectedSlotIds = new Set<string>();
      for (const edge of incomingEdges) {
        if (edge.targetHandle) {
          connectedSlotIds.add(edge.targetHandle);
        }
      }

      // Look up tool slots
      let toolSpec: any = null;
      if (catalog && typeof catalog.getToolSpec === 'function') {
        toolSpec = catalog.getToolSpec('material', selectedTool);
      }
      if (!toolSpec) {
        try {
          toolSpec = NodeSpecRegistry.getToolSpec('material', selectedTool);
        } catch {
          // ignore fallback
        }
      }

      const slots = Array.isArray(toolSpec?.slots) ? toolSpec.slots : [];
      let promptSlotHandled = false;

      for (const slot of slots) {
        const isConnected = connectedSlotIds.has(slot.slotId);
        if (slot.slotId === 'prompt') {
          promptSlotHandled = true;
        }

        if (!isConnected) {
          const slotType = slot.materialType || 'text';
          const isText = slotType === 'text';
          const widget: FormWidgetType = isText ? 'textarea' : 'media-uploader';

          inputs.push({
            key: `${node.id}_slot_${slot.slotId}`,
            nodeId: node.id,
            nodeLabel,
            nodeKind,
            targetField: `slot:${slot.slotId}`,
            fieldTitle: `${nodeLabel} - ${slot.slotId}`,
            description: `Unwired slot: ${slot.slotId} (${slot.role || slotType})`,
            valueType: 'string',
            widget,
            isExposed: false,
            isRequired: false,
            defaultValue: '',
            inDegree: inDeg,
            isRoot: false,
            slotId: slot.slotId,
            mappingType: 'slot',
          });
        }
      }

      // 2. Unwired prompt on generative nodes
      if (
        !promptSlotHandled &&
        (nodeKind === 'generate' || data.prompt !== undefined || isGenerativeToolName(selectedTool))
      ) {
        const hasPromptConnection = incomingEdges.some(
          (e) => e.targetHandle === 'prompt' || (!e.targetHandle && incomingEdges.length === 1 && inDeg === 1),
        );
        if (!hasPromptConnection) {
          inputs.push({
            key: `${node.id}_prompt`,
            nodeId: node.id,
            nodeLabel,
            nodeKind,
            targetField: 'prompt',
            fieldTitle: `${nodeLabel} - Prompt`,
            description: 'Generative prompt override',
            valueType: 'string',
            widget: 'textarea',
            isExposed: false,
            isRequired: false,
            defaultValue: (data.prompt as string) || '',
            inDegree: inDeg,
            isRoot: false,
            mappingType: 'text',
          });
        }
      }

      // 3. Adjustable parameters in params
      const params = (data.params as Record<string, unknown>) || {};
      const isVisualTool =
        materialType === 'video' ||
        materialType === 'image' ||
        selectedTool.includes('video') ||
        selectedTool.includes('image');

      if (params.aspectRatio !== undefined || isVisualTool) {
        const defaultRatio = (params.aspectRatio as string) || '16:9';
        inputs.push({
          key: `${node.id}_aspectRatio`,
          nodeId: node.id,
          nodeLabel,
          nodeKind,
          targetField: 'params.aspectRatio',
          fieldTitle: `${nodeLabel} - Aspect Ratio`,
          description: 'Output aspect ratio option',
          valueType: 'string',
          widget: 'ratio-cards',
          isExposed: false,
          isRequired: false,
          defaultValue: defaultRatio,
          enumOptions: STANDARD_ASPECT_RATIOS.map((r) => ({ label: r, value: r })),
          inDegree: inDeg,
          isRoot: false,
          mappingType: 'param',
        });
      }

      // Extract other params
      for (const [paramKey, paramValue] of Object.entries(params)) {
        if (paramKey === 'aspectRatio') continue;

        let widget: FormWidgetType = 'input-text';
        let valueType: ExposedWorkflowInput['valueType'] = 'string';
        let range: { min?: number; max?: number; step?: number } | undefined = undefined;

        if (typeof paramValue === 'boolean') {
          widget = 'switch-boolean';
          valueType = 'boolean';
        } else if (typeof paramValue === 'number') {
          widget = 'slider-range';
          valueType = 'number';
          range = { min: 0, max: 100, step: 1 };
        } else if (typeof paramValue === 'string') {
          if (paramKey.toLowerCase().includes('prompt')) {
            widget = 'textarea';
          } else {
            widget = 'input-text';
          }
        }

        inputs.push({
          key: `${node.id}_param_${paramKey}`,
          nodeId: node.id,
          nodeLabel,
          nodeKind,
          targetField: `params.${paramKey}`,
          fieldTitle: `${nodeLabel} - ${capitalize(paramKey)}`,
          description: `Configurable parameter: ${paramKey}`,
          valueType,
          widget,
          isExposed: false,
          isRequired: false,
          defaultValue: paramValue,
          range,
          inDegree: inDeg,
          isRoot: false,
          mappingType: 'param',
        });
      }
    }
  }

  // Suggest application category based on terminal nodes
  const categorySuggestion = inferCategory(terminalNodeIds, nodes);

  // Calculate deterministic workflow hash
  const workflowHash = computeWorkflowHash(nodes, edges);

  return {
    inputs,
    rootNodeIds,
    terminalNodeIds,
    nodeInDegrees,
    nodeOutDegrees,
    categorySuggestion,
    workflowHash,
  };
}

/**
 * Helper: Generate RestrictedJsonSchema, FieldMappingEntry record, and demoSnapshot from inputs.
 */
export function generateFormConfig(inputs: ExposedWorkflowInput[]): GeneratedFormConfig {
  const activeInputs = inputs.filter((i) => i.isExposed);
  // If no inputs explicitly set to isExposed, fallback to root inputs
  const targetInputs = activeInputs.length > 0 ? activeInputs : inputs.filter((i) => i.isRoot);

  const properties: Record<string, FormPropertySchema> = {};
  const required: string[] = [];
  const fieldMappings: Record<string, FieldMappingEntry> = {};
  const demoSnapshot: Record<string, unknown> = {};

  for (const input of targetInputs) {
    const propSchema: FormPropertySchema = {
      type: input.valueType,
      title: input.fieldTitle,
      description: input.description,
      default: input.defaultValue,
      widget: input.widget,
    };

    if (input.enumOptions && input.enumOptions.length > 0) {
      propSchema.enum = input.enumOptions.map((o) => o.value as string | number | boolean);
      propSchema.options = input.enumOptions;
    }

    if (input.range) {
      if (input.range.min !== undefined) propSchema.minimum = input.range.min;
      if (input.range.max !== undefined) propSchema.maximum = input.range.max;
    }

    properties[input.key] = propSchema;

    if (input.isRequired) {
      required.push(input.key);
    }

    fieldMappings[input.key] = {
      nodeId: input.nodeId,
      targetField: input.targetField,
      mappingType: input.mappingType,
      widget: input.widget,
      label: input.fieldTitle,
      required: input.isRequired,
      defaultValue: input.defaultValue,
      description: input.description,
    };

    demoSnapshot[input.key] = input.defaultValue ?? (input.valueType === 'boolean' ? false : input.valueType === 'number' ? 0 : '');
  }

  const formSchema: RestrictedJsonSchema = {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };

  return {
    formSchema,
    fieldMappings,
    demoSnapshot,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isGenerativeToolName(tool: string): boolean {
  if (!tool) return false;
  return (
    tool.includes('generate') ||
    tool.includes('text-to-') ||
    tool.includes('image-to-') ||
    tool.includes('mimicry') ||
    tool.includes('clone')
  );
}

function inferCategory(terminalIds: string[], nodes: FlowNodeLike[]): ApplicationCategory {
  const terminalNodes = nodes.filter((n) => terminalIds.includes(n.id));
  for (const node of terminalNodes) {
    const materialType = (node.data?.materialType as string) || '';
    if (materialType === 'video') return 'video';
  }
  for (const node of terminalNodes) {
    const materialType = (node.data?.materialType as string) || '';
    if (materialType === 'image') return 'image';
  }
  for (const node of terminalNodes) {
    const materialType = (node.data?.materialType as string) || '';
    if (materialType === 'audio') return 'audio';
  }
  return 'video';
}

/**
 * Pure JS SHA-256 standard implementation.
 * Zero external or node:crypto dependencies — runs in browser, web workers, and node.
 */
function computeWorkflowHash(nodes: FlowNodeLike[], edges: FlowEdgeLike[]): string {
  const normalizedNodes = [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      id: n.id,
      type: n.type || 'material',
      materialType: n.data?.materialType,
      tool: n.data?.selectedTool,
      nodeKind: n.data?.nodeKind,
    }));

  const normalizedEdges = [...edges]
    .sort((a, b) => {
      const cmp = a.source.localeCompare(b.source);
      if (cmp !== 0) return cmp;
      return (a.target || '').localeCompare(b.target || '');
    })
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    }));

  const ascii = JSON.stringify({ nodes: normalizedNodes, edges: normalizedEdges });

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (let i = 0; i < ascii.length; i++) {
    const charCode = ascii.charCodeAt(i);
    const wordIndex = i >> 2;
    words[wordIndex] = ((words[wordIndex] || 0) << 8) | charCode;
  }

  const lastWordIndex = ascii.length >> 2;
  words[lastWordIndex] = ((words[lastWordIndex] || 0) << 8) | 0x80;
  for (let i = (ascii.length % 4) + 1; i < 4; i++) {
    words[lastWordIndex] = (words[lastWordIndex] || 0) << 8;
  }

  while ((words.length % 16) !== 14) {
    words.push(0);
  }
  words.push(Math.floor(asciiBitLength / maxWord));
  words.push(asciiBitLength % maxWord);

  const w = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) {
      w[j] = words[i + j] || 0;
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j]! + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0]! + a) | 0;
    hash[1] = (hash[1]! + b) | 0;
    hash[2] = (hash[2]! + c) | 0;
    hash[3] = (hash[3]! + d) | 0;
    hash[4] = (hash[4]! + e) | 0;
    hash[5] = (hash[5]! + f) | 0;
    hash[6] = (hash[6]! + g) | 0;
    hash[7] = (hash[7]! + h) | 0;
  }

  for (let i = 0; i < 8; i++) {
    result += (hash[i]! >>> 0).toString(16).padStart(8, '0');
  }

  return result;
}
