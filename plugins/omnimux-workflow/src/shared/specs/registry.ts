/**
 * Node specification registry single source of truth (SSOT).
 *
 * Provides central registration, lookup, and input requirements calculation
 * for all workflow nodes and tools.
 */

import type { MaterialType } from '../canvasTypes.ts';
import type { NodeSpec, ToolSpec } from './contracts.ts';
import { materialNodeSpec, MATERIAL_TOOLS_BY_TYPE } from './nodes/materialNodeSpec.ts';
import { tableNodeSpec } from './nodes/tableNodeSpec.ts';
import { videoCompositionNodeSpec } from './nodes/videoCompositionNodeSpec.ts';
import { groupNodeSpec } from './nodes/groupNodeSpec.ts';
import { directorNodeSpec } from './nodes/directorNodeSpec.ts';

export class NodeSpecRegistryImpl {
  private readonly specs = new Map<string, NodeSpec>();

  constructor() {
    this.registerBuiltins();
  }

  /**
   * Register a node specification into the registry.
   */
  public register(spec: NodeSpec): void {
    this.specs.set(spec.type, spec);
  }

  /**
   * Get a node specification by its node type key.
   */
  public get(type: string): NodeSpec | undefined {
    return this.specs.get(type);
  }

  /**
   * Get a specific tool specification under a node type.
   */
  public getToolSpec(nodeType: string, toolId: string): ToolSpec | undefined {
    const spec = this.specs.get(nodeType);
    if (!spec) return undefined;
    return spec.tools[toolId];
  }

  /**
   * Get all registered node specifications.
   */
  public getAll(): NodeSpec[] {
    return Array.from(this.specs.values());
  }

  /**
   * Calculate accepted incoming connection material types for a node.
   *
   * 1. If a specific tool is provided and exists in spec.tools, returns the exact acceptedInputTypes of that tool.
   * 2. If a materialType is provided (or selectedTool matches a material type key), returns the union of acceptedInputTypes for all tools belonging to that material type.
   * 3. For material node with no tool/materialType specified, returns the union of all material tools.
   * 4. For non-material nodes, returns input port acceptedTypes (or empty array if no input port).
   * 5. For unknown/unregistered nodes, safely falls back to all four material types.
   */
  public getNodeInputRequirements(
    nodeType: string,
    selectedTool?: string,
    materialType?: MaterialType,
  ): { acceptedTypes: MaterialType[] } {
    const spec = this.specs.get(nodeType);
    if (!spec) {
      // Unknown node type safe fallback
      return { acceptedTypes: ['text', 'image', 'video', 'audio'] };
    }

    if (nodeType === 'material') {
      // 1. Exact tool match
      if (selectedTool && spec.tools[selectedTool]) {
        return { acceptedTypes: [...spec.tools[selectedTool].acceptedInputTypes] };
      }

      // 2. Material type union
      const targetMaterialType: MaterialType | undefined =
        materialType ||
        (selectedTool && ['text', 'image', 'video', 'audio'].includes(selectedTool)
          ? (selectedTool as MaterialType)
          : undefined);

      if (targetMaterialType) {
        const toolsForType = MATERIAL_TOOLS_BY_TYPE[targetMaterialType];
        if (toolsForType && toolsForType.length > 0) {
          const unionSet = new Set<MaterialType>();
          for (const toolId of toolsForType) {
            const tSpec = spec.tools[toolId];
            if (tSpec?.acceptedInputTypes) {
              for (const inType of tSpec.acceptedInputTypes) {
                unionSet.add(inType);
              }
            }
          }
          return { acceptedTypes: Array.from(unionSet) };
        }
      }

      // 3. Union of all material tools
      const allUnionSet = new Set<MaterialType>();
      for (const tSpec of Object.values(spec.tools)) {
        if (tSpec?.acceptedInputTypes) {
          for (const inType of tSpec.acceptedInputTypes) {
            allUnionSet.add(inType);
          }
        }
      }
      return {
        acceptedTypes:
          allUnionSet.size > 0
            ? Array.from(allUnionSet)
            : ['text', 'image', 'video', 'audio'],
      };
    }

    // Non-material nodes
    const inPort = spec.ports.find((p) => p.side === 'in');
    if (inPort) {
      return { acceptedTypes: [...inPort.acceptedTypes] };
    }

    if (spec.ports.length === 0 || !inPort) {
      return { acceptedTypes: [] };
    }

    return { acceptedTypes: ['text', 'image', 'video', 'audio'] };
  }

  private registerBuiltins(): void {
    this.register(materialNodeSpec);
    this.register(tableNodeSpec);
    this.register(videoCompositionNodeSpec);
    this.register(groupNodeSpec);
    this.register(directorNodeSpec);
  }
}

export const NodeSpecRegistry = new NodeSpecRegistryImpl();
