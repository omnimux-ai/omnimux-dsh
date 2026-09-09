/**
 * plugins/omnimux-apps/src/shared/manifest.ts
 *
 * OmniMux Universal AI Application Metadata Standard (ApplicationManifest v1.0)
 * Contract: docs/contracts/ai-app-ui-spec.md & docs/contracts/workflow-app-boundary.md
 * Authority: L1 Core Architecture
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
  // UI widget hints
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
