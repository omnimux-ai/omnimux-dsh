/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/publishTypes.ts
 *
 * Types for the Workflow-to-App publishing wizard and topology analysis.
 * Aligned with docs/contracts/workflow-app-boundary.md & ai-app-ui-spec.md
 */

/** Top-level category for OmniMux AI applications: strictly video | image | audio */
export type ApplicationCategory = 'video' | 'image' | 'audio';

/** 9 Standard Universal Form Widgets */
export type FormWidgetType =
  | 'media-extractor'   // Compound social media video/link extractor + drag-and-drop
  | 'media-uploader'    // Pure media asset drag-and-drop uploader
  | 'input-text'        // 40px Single-line text input
  | 'textarea'          // 80px Multi-line text area (fixed height, resize: none)
  | 'select-single'     // 398px Full-width single-column dropdown (no native select)
  | 'select-grid-pair'  // Dual-column dropdown pair (195px + 8px gap + 195px = 398px)
  | 'ratio-cards'       // Aspect ratio option cards (9:16, 16:9, 1:1, 4:3)
  | 'slider-range'      // Numeric range slider with dual cursor support
  | 'switch-boolean';   // Boolean toggle switch

/** Mapping type between form field and workflow execution slot / parameter */
export type FieldMappingType = 'text' | 'param' | 'slot' | 'media';

/** Field mapping descriptor for binding form schema keys to workflow nodes */
export interface FieldMappingEntry {
  nodeId: string;
  targetField: string; // e.g. 'prompt', 'content', 'mediaUrl', 'params.aspectRatio', 'slot:prompt'
  mappingType: FieldMappingType;
  widget: FormWidgetType;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  options?: Array<{ label: string; value: unknown }>;
}

/** Supported JSON Schema primitive types */
export type JsonSchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

/** Property definition within Restricted JSON Schema Draft-07 subset */
export interface FormPropertySchema {
  type: JsonSchemaPrimitiveType;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: FormPropertySchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, FormPropertySchema>;
  required?: string[];
  additionalProperties?: false;
  // UI widget hint
  widget?: FormWidgetType;
  placeholder?: string;
  options?: Array<{ label: string; value: unknown }>;
}

/** Restricted JSON Schema Draft-07 root schema */
export interface RestrictedJsonSchema {
  type: 'object';
  properties: Record<string, FormPropertySchema>;
  required: string[];
  additionalProperties: false;
}

/** Showcase display mode */
export type ShowcaseMode = 'carousel' | 'gallery' | 'comparison';

/** Single asset displayed in the showcase */
export interface ShowcaseItem {
  id: string;
  title?: string;
  mediaType: ApplicationCategory;
  mediaUrl: string;
  posterUrl?: string;
  aspectRatio?: string;
  durationSeconds?: number;
}

/** Showcase configuration */
export interface ShowcaseConfig {
  mode: ShowcaseMode;
  items: ShowcaseItem[];
}

/** Application metadata */
export interface ApplicationMetadata {
  name: string;
  category: ApplicationCategory;
  description?: string;
  iconSvg: string;
  coverUrl?: string;
}

/** Workflow binding specification */
export interface WorkflowBinding {
  workspaceId: string;
  workflowHash: string;
  snapshot: {
    nodes: unknown[];
    edges: unknown[];
  };
}

/**
 * Universal Application Manifest (v1.0)
 *
 * Defines the immutable contract for an AI Application published from an OmniMux Workflow.
 */
export interface ApplicationManifest {
  appId: string;
  version: string;
  schemaVersion: '1.0';
  createdAt: string;
  metadata: ApplicationMetadata;
  workflowBinding: WorkflowBinding;
  formSchema: RestrictedJsonSchema;
  fieldMappings: Record<string, FieldMappingEntry>;
  showcase: ShowcaseConfig;
  demoSnapshot: Record<string, unknown>;
}

/** An individual workflow input analyzed from the canvas DAG */
export interface ExposedWorkflowInput {
  /** Unique key for this input in the generated formSchema & fieldMappings */
  key: string;
  /** Workflow node ID */
  nodeId: string;
  /** Human-readable node label */
  nodeLabel: string;
  /** Node kind: 'generate' | 'import' | string */
  nodeKind: 'generate' | 'import' | string;
  /** Target field in node data (e.g. 'prompt', 'content', 'mediaUrl', 'params.aspectRatio') */
  targetField: string;
  /** Field title displayed in the form */
  fieldTitle: string;
  /** Optional field description */
  description?: string;
  /** Data type for JSON Schema */
  valueType: JsonSchemaPrimitiveType;
  /** Form UI widget */
  widget: FormWidgetType;
  /** Whether this field is exposed in the published app form */
  isExposed: boolean;
  /** Whether this field is required */
  isRequired: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Enum options if applicable */
  enumOptions?: Array<{ label: string; value: unknown }>;
  /** Numeric range if applicable */
  range?: { min?: number; max?: number; step?: number };
  /** In-degree of the parent node in the workflow graph */
  inDegree: number;
  /** Whether the parent node is a root node (inDegree === 0) */
  isRoot: boolean;
  /** Slot ID if mapped from a tool slot */
  slotId?: string;
  /** Mapping type */
  mappingType: FieldMappingType;
}

/** Result of the pure workflow topology analysis */
export interface WorkflowAnalysisResult {
  /** All identified inputs (roots default exposed/required, non-roots default unexposed) */
  inputs: ExposedWorkflowInput[];
  /** IDs of root nodes (inDegree === 0) */
  rootNodeIds: string[];
  /** IDs of terminal nodes (outDegree === 0) */
  terminalNodeIds: string[];
  /** In-degree map of all nodes */
  nodeInDegrees: Record<string, number>;
  /** Out-degree map of all nodes */
  nodeOutDegrees: Record<string, number>;
  /** Inferred app category based on terminal nodes */
  categorySuggestion: ApplicationCategory;
  /** Deterministic SHA-256 hash of the workflow topology */
  workflowHash: string;
}

/** Form schema and field mappings generated from selected inputs */
export interface GeneratedFormConfig {
  formSchema: RestrictedJsonSchema;
  fieldMappings: Record<string, FieldMappingEntry>;
  demoSnapshot: Record<string, unknown>;
}
