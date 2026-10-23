/**
 * ComfyUI interoperability + portable workflow file codec.
 *
 * Public surface (all pure, no network / filesystem / backend):
 * - `parseComfyWorkflow` / `stringifyComfyWorkflow` — structural codec for the
 *   ComfyUI v0.4 and v1 workflow JSON shapes.
 * - `projectComfyToCanvas` / `projectCanvasToComfy` — declared mapping with an
 *   explicit `{ supported, unsupported }` inventory. Nothing is dropped
 *   silently.
 * - `buildOmnimuxWorkflowFile` / `parseOmnimuxWorkflowFile` — this
 *   repository's own portable `.json` workflow format.
 */

export type {
  ComfyCanvasEdge,
  ComfyCanvasEncodeResult,
  ComfyCanvasNode,
  ComfyCanvasProjection,
  ComfyCodecError,
  ComfyCodecErrorCode,
  ComfyGroup,
  ComfyInventory,
  ComfyLink,
  ComfyLinkType,
  ComfyNode,
  ComfyNodeInput,
  ComfyNodeOutput,
  ComfyParseResult,
  ComfyReroute,
  ComfySupportedEntry,
  ComfyUnsupportedEntry,
  ComfyUnsupportedKind,
  ComfyV04Extra,
  ComfyV1State,
  ComfyWorkflowDocument,
  ComfyWorkflowFormat,
  ComfyWorkflowV04,
  ComfyWorkflowV1,
} from './types.ts';

export {
  ComfyWorkflowCodecError,
  describeCodecError,
  isCodecError,
} from './errors.ts';

export {
  detectComfyWorkflowFormat,
  encodeComfyWorkflowValue,
  parseComfyWorkflow,
  parseComfyWorkflowValue,
  stringifyComfyWorkflow,
} from './codec.ts';

export { createEmptyV04, decodeLinkTuple, encodeLinkTuple } from './schemaV04.ts';
export { createEmptyV1 } from './schemaV1.ts';

export {
  COMFY_TO_CANVAS_MAPPING,
  canvasEdgeIdFor,
  canvasNodeIdFor,
  lookupComfyNodeMapping,
  projectCanvasToComfy,
  projectComfyToCanvas,
} from './canvasMapping.ts';
export type { CanvasToComfyInput, ComfyNodeMappingSpec } from './canvasMapping.ts';

export {
  OMNIMUX_WORKFLOW_FILE_KIND,
  OMNIMUX_WORKFLOW_FILE_VERSION,
  buildOmnimuxWorkflowFile,
  parseOmnimuxWorkflowFile,
  serializeOmnimuxWorkflowFile,
} from './omnimuxWorkflowFile.ts';
export type {
  BuildOmnimuxWorkflowFileInput,
  BuildOmnimuxWorkflowFileResult,
  OmnimuxWorkflowFile,
  WorkflowFileEdge,
  WorkflowFileError,
  WorkflowFileErrorCode,
  WorkflowFileNode,
  WorkflowFileParseResult,
  WorkflowFileSettings,
} from './omnimuxWorkflowFile.ts';
