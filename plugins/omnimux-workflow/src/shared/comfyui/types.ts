/**
 * ComfyUI workflow document — structural model for the two published JSON
 * shapes (v0.4 legacy and v1).
 *
 * Implemented independently from the structural facts of the format
 * (field names, tuple/object link shapes, version dispatch). No upstream
 * ComfyUI source, schema file, resource or test fixture is copied into this
 * repository; see `specs/workflow-comfy-replica-3625.spec.md`.
 *
 * The model is intentionally lossless for round-tripping: every object keeps
 * an `unknown` bag for fields this codec does not model, so decode -> encode
 * preserves the original document instead of silently dropping data.
 */

/** Link payload type token: ComfyUI uses string type names, legacy files may carry numbers. */
export type ComfyLinkType = string | number;

/** Node input port declaration. */
export interface ComfyNodeInput {
  name: string;
  type: ComfyLinkType;
  /** Connected link id, or null when the port is unconnected. */
  link: number | null;
  slotIndex?: number;
  /** v1 marks widget-backed inputs with a `widget` descriptor. */
  widget?: Record<string, unknown>;
  unknown: Record<string, unknown>;
}

/** Node output port declaration. */
export interface ComfyNodeOutput {
  name: string;
  type: ComfyLinkType;
  /** Outgoing link ids; upstream writes null for "no links" in some files. */
  links: number[] | null;
  slotIndex?: number;
  unknown: Record<string, unknown>;
}

/** A graph node in either schema generation. */
export interface ComfyNode {
  id: number;
  type: string;
  /** Canvas position `[x, y]` in graph space. */
  pos: [number, number];
  /** Node size `[width, height]` when the file carries one. */
  size?: [number, number];
  flags?: Record<string, unknown>;
  order?: number;
  /** 0 = normal, 2 = muted, 4 = bypassed (upstream semantics). */
  mode?: number;
  inputs?: ComfyNodeInput[];
  outputs?: ComfyNodeOutput[];
  properties?: Record<string, unknown>;
  widgetsValues?: unknown[];
  color?: string;
  bgcolor?: string;
  title?: string;
  /** Fields not modelled above, preserved verbatim for round-tripping. */
  unknown: Record<string, unknown>;
}

/** A visual group container. */
export interface ComfyGroup {
  /** v0.4 files may omit group ids. */
  id?: number;
  title?: string;
  /** `[x, y, width, height]` in graph space. */
  bounding?: [number, number, number, number];
  color?: string;
  fontSize?: number;
  flags?: Record<string, unknown>;
  unknown: Record<string, unknown>;
}

/** A link in the normalised (object) form shared by both schema generations. */
export interface ComfyLink {
  id: number;
  originId: number;
  originSlot: number;
  targetId: number;
  targetSlot: number;
  type: ComfyLinkType;
  /** v1 only: owning (sub)graph id. */
  parentId?: number | null;
  /** Extra tuple slots (v0.4) or unknown object keys (v1). */
  unknown: Record<string, unknown>;
  /** v0.4 tuple slots beyond the first six, preserved positionally. */
  extraTupleSlots: unknown[];
}

/** v1 reroute (virtual pass-through) node. */
export interface ComfyReroute {
  id: number;
  pos: [number, number];
  linkIds: number[];
  parentId?: number | null;
  unknown: Record<string, unknown>;
}

/** v0.4 `extra` payload (viewport offset/scale and free-form extras). */
export interface ComfyV04Extra {
  ds?: { offset?: [number, number]; scale?: number; unknown: Record<string, unknown> };
  unknown: Record<string, unknown>;
}

/** v1 `state` block. */
export interface ComfyV1State {
  lastGroupId: number;
  lastNodeId: number;
  lastLinkId: number;
  lastRerouteId: number;
  unknown: Record<string, unknown>;
}

/** ComfyUI workflow, v0.4 schema (6-element tuple links). */
export interface ComfyWorkflowV04 {
  format: 'v0.4';
  version: number;
  lastNodeId: number;
  lastLinkId: number;
  nodes: ComfyNode[];
  links: ComfyLink[];
  groups: ComfyGroup[];
  config: Record<string, unknown>;
  extra: ComfyV04Extra;
  unknown: Record<string, unknown>;
}

/** ComfyUI workflow, v1 schema (`state` + object links + reroutes). */
export interface ComfyWorkflowV1 {
  format: 'v1';
  version: 1;
  state: ComfyV1State;
  groups: ComfyGroup[];
  nodes: ComfyNode[];
  links: ComfyLink[];
  floatingLinks: unknown[];
  reroutes: ComfyReroute[];
  extra: Record<string, unknown>;
  /** Subgraph definitions block, preserved verbatim (not materialised). */
  definitions?: unknown;
  unknown: Record<string, unknown>;
}

export type ComfyWorkflowDocument = ComfyWorkflowV04 | ComfyWorkflowV1;

export type ComfyWorkflowFormat = ComfyWorkflowDocument['format'];

// ============================================================================
// Codec results
// ============================================================================

export type ComfyCodecErrorCode =
  | 'invalid-json'
  | 'invalid-root'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'missing-field';

/** Structured, UI-translatable parse error. */
export interface ComfyCodecError {
  code: ComfyCodecErrorCode;
  /** JSON-ish location of the offending value, e.g. `nodes[3].pos`. */
  path: string;
  /** Developer-readable English detail; the UI prefers the i18n key for `code`. */
  message: string;
}

export type ComfyParseResult =
  | { ok: true; document: ComfyWorkflowDocument; format: ComfyWorkflowFormat }
  | { ok: false; error: ComfyCodecError };

/**
 * `kind` vocabulary used by the explicit unsupported inventory.
 *
 * - `node`      a graph node that has no canvas counterpart (or is inert)
 * - `parameter` a node field / input port that cannot be carried over
 * - `widget`    an unmapped entry in `widgets_values`
 * - `link`      a connection that cannot be re-created on the canvas
 * - `group`     a group container that cannot be carried over
 * - `reroute`   a v1 reroute node
 * - `floating-link` a v1 floating link
 * - `document-field` a top-level field the canvas cannot represent
 */
export type ComfyUnsupportedKind =
  | 'node'
  | 'parameter'
  | 'widget'
  | 'link'
  | 'group'
  | 'reroute'
  | 'floating-link'
  | 'document-field';

/** One explicitly reported, non-carried item. Never silently dropped. */
export interface ComfyUnsupportedEntry {
  kind: ComfyUnsupportedKind;
  /** Stable identity: ComfyUI node/link id, or `<nodeId>.<field>` / `<nodeId>:widgets_values[i]`. */
  id: string;
  /**
   * Machine-readable reason token. UI translates `comfy.unsupported.reason.<reason>`
   * and always renders the raw token when no translation exists.
   */
  reason: string;
  /** Optional human-readable context (e.g. the upstream class_type). */
  detail?: string;
}

/** One item that was carried over into the target representation. */
export interface ComfySupportedEntry {
  kind: 'node' | 'link' | 'group';
  id: string;
  /** Target type when the entry was mapped (canvas node type or ComfyUI class_type). */
  targetType?: string;
  /**
   * True when the mapping preserves the item's structure but not all of its
   * semantics (the missing parts are listed in `unsupported`).
   */
  lossy?: boolean;
}

export interface ComfyInventory {
  supported: ComfySupportedEntry[];
  unsupported: ComfyUnsupportedEntry[];
}

/** Result of projecting a ComfyUI document onto the canvas graph model. */
export interface ComfyCanvasProjection extends ComfyInventory {
  format: ComfyWorkflowFormat;
  nodes: ComfyCanvasNode[];
  edges: ComfyCanvasEdge[];
}

/** Minimal canvas node shape (structurally compatible with `@xyflow/react`). */
export interface ComfyCanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  height?: number;
}

/** Minimal canvas edge shape (structurally compatible with `@xyflow/react`). */
export interface ComfyCanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

/** Result of encoding a canvas graph into a ComfyUI document. */
export interface ComfyCanvasEncodeResult extends ComfyInventory {
  document: ComfyWorkflowDocument;
}
