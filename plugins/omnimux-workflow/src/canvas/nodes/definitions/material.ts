/**
 * Material node definition — the first registry entry (extension point ①).
 *
 * Wraps the Gxgen-ported MaterialNode component; aligned with the central
 * NodeSpecRegistry SSOT.
 */

import MaterialNode from '../../editor/components/MaterialNode';
import type { NodeDefinition } from '../registry';
import { createDefaultMaterialNodeData } from '../../types/materialNode';
import { getDefaultNodeWidth } from '../../editor/utils/nodeSizeConfig';
import { NodeSpecRegistry } from '../../../shared/specs/registry.ts';
import { materialTools } from '../../../shared/specs/nodes/materialNodeSpec.ts';

const materialSpec = NodeSpecRegistry.get('material');

/**
 * Palette search terms for the material node: the labelKeys of every tool the
 * node actually exposes (SSOT: `materialNodeSpec`). Derived, never hand-listed,
 * so a new tool automatically becomes searchable.
 */
const MATERIAL_KEYWORDS: readonly string[] = Object.values(materialTools).map(
  (tool) => tool.labelKey,
);

export const materialNodeDefinition: NodeDefinition = {
  type: 'material',
  component: MaterialNode,
  ports: materialSpec
    ? materialSpec.ports.map((p) => ({
        side: p.side,
        acceptedTypes: p.acceptedTypes,
      }))
    : [
        { side: 'in', acceptedTypes: ['text', 'image', 'video', 'audio'] },
        { side: 'out', acceptedTypes: ['text', 'image', 'video', 'audio'] },
      ],
  defaultData: () =>
    createDefaultMaterialNodeData('text', {
      status: 'empty',
      nodeWidth: getDefaultNodeWidth('text'),
    }) as unknown as Record<string, unknown>,
  configSpec: {
    promptEnabled: true,
    modelCategory: 'text',
  },
  executorKey: materialSpec?.executorKey ?? 'material',
  // palette 是未渲染的注册表扩展点元数据：文案以 i18n key 存放，
  // 未来消费方（如 Toolbar palette 化）需经 t() 解析。
  palette: {
    group: 'palette.group.material',
    label: 'palette.node.material',
    icon: 'box',
    keywords: MATERIAL_KEYWORDS,
  },
};
