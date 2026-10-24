/**
 * NOTE: Extension point: node type registry (canvas island side).
 *
 * Adding a new node type never touches CanvasEditor: register a
 * NodeDefinition here (see docs/contracts/adding-a-node.md). The editor
 * generates its nodeTypes map from the registry; the toolbar palette lists
 * entries with `palette` metadata.
 */
import { memo, type ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';

/** Port material contract carried over from the Gxgen port. */
export type PortMaterialType = 'text' | 'image' | 'video' | 'audio';

export interface PortSpec {
  side: 'in' | 'out';
  acceptedTypes: PortMaterialType[];
}

/** Config-panel rendering description (M2 fills the full spec). */
export interface ConfigSpec {
  promptEnabled: boolean;
  modelCategory?: 'text' | 'image' | 'video' | 'audio';
}

export interface NodePaletteEntry {
  /**
   * Palette category key, as an i18n key (never a literal).
   *
   * Nodes declaring the same key share one category. Since Issue #3640 the
   * add-node panel renders a flat, uncategorised list: the key is no longer a
   * heading — it stays the palette's category search alias. Keys must exist in
   * both `canvas/i18n/dict.zh.ts` and `dict.en.ts`.
   */
  group: string;
  /** Entry label, as an i18n key (never a literal). */
  label: string;
  icon: string;
  /**
   * Extra palette search terms, as i18n keys.
   *
   * Declared from the node's real capability surface (its tool labelKeys, its
   * executor contract) so keyword search matches what the node can actually do
   * — e.g. 「音频转写」 finds the text node because `audio-transcription` is one
   * of its tools. Never carries user-facing copy of its own.
   */
  keywords?: readonly string[];
}

export interface NodeDefinition {
  /** React Flow node type key ('material' | future types). */
  type: string;
  component: ComponentType<NodeProps>;
  /** Input/output material contracts feeding connection validation. */
  ports: PortSpec[];
  defaultData: () => Record<string, unknown>;
  configSpec?: ConfigSpec;
  /** Host executor registry key (see src/workflow/executors/registry.ts). */
  executorKey?: string;
  /** Toolbar palette entry; omit to keep the type out of the palette. */
  palette?: NodePaletteEntry;
}

const definitions = new Map<string, NodeDefinition>();

export function registerNodeDefinition(def: NodeDefinition): void {
  definitions.set(def.type, def);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return definitions.get(type);
}

export function getNodeDefinitions(): Record<string, NodeDefinition> {
  return Object.fromEntries(definitions);
}

/** nodeTypes map for <ReactFlow> (built once at module load). */
export function buildNodeTypes(): Record<string, ComponentType<NodeProps>> {
  const types: Record<string, ComponentType<NodeProps>> = {};
  for (const [type, def] of definitions) {
    types[type] = def.component;
  }
  return types;
}

/** Palette entries in registration order. */
export function getPaletteEntries(): Array<{ type: string } & NodePaletteEntry> {
  const rows: Array<{ type: string } & NodePaletteEntry> = [];
  for (const [type, def] of definitions) {
    if (def.palette) rows.push({ type, ...def.palette });
  }
  return rows;
}

/**
 * Create a node instance from a registered definition.
 * (Registry-driven replacement of the Gxgen nodeFactory switch.)
 */
export function createNode(
  type: string,
  position: { x: number; y: number },
  id: string,
): { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> } | null {
  const def = definitions.get(type);
  if (!def) return null;
  return {
    id,
    type,
    position,
    data: def.defaultData(),
  };
}

/** Wrap a component with memo (helper mirroring Gxgen's memo exports). */
export function memoNode(component: ComponentType<NodeProps>): ComponentType<NodeProps> {
  return memo(component) as unknown as ComponentType<NodeProps>;
}
