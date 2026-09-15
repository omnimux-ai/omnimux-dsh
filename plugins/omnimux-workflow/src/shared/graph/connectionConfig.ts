/**
 * Ported (narrowed) from Gxgen
 * `apps/web/src/pages/CanvasEditor/utils/connectionConfig.ts`
 * (validated by the extraction spike): type matrix + isNodeConnectionValid
 * + input/output options.
 *
 * Input requirements are delegated to the unified NodeSpecRegistry SSOT.
 */

import {
  MATERIAL_TOOLS,
  MATERIAL_TOOL_INPUT_TYPES,
  type MaterialType,
  type MaterialTool,
// 显式 .ts 扩展名：node --test 的 type-stripping 不做 TS 扩展名解析
} from './materialNode.ts';
import { NodeSpecRegistry } from '../specs/registry.ts';

export { MATERIAL_TOOLS, MATERIAL_TOOL_INPUT_TYPES };

// ==================== 输出选项 ====================

export interface MaterialOutputOption {
  targetMaterialType: MaterialType;
  targetTool: MaterialTool | string;
  icon?: string;
}

/**
 * MaterialNode 素材类型到输出选项的映射（结构原样保留；label/desc 文案
 * 已入 i18n 字典 menu.option.*，由 connectionMenuOptions 按 key 派生）。
 */
const MATERIAL_OUTPUT_OPTIONS: Record<MaterialType, MaterialOutputOption[]> = {
  text: [
    { targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' },
    { targetMaterialType: 'image', targetTool: 'text-to-image', icon: 'ImageGen' },
    { targetMaterialType: 'video', targetTool: 'video-generation', icon: 'VideoGen' },
    { targetMaterialType: 'audio', targetTool: 'text-to-audio', icon: 'AudioLines' },
  ],
  image: [
    { targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' },
    { targetMaterialType: 'image', targetTool: 'image-to-image', icon: 'ImageGen' },
    { targetMaterialType: 'video', targetTool: 'video-generation', icon: 'VideoGen' },
  ],
  video: [
    { targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' },
    { targetMaterialType: 'video', targetTool: 'video-generation', icon: 'VideoGen' },
  ],
  audio: [
    { targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' },
    { targetMaterialType: 'video', targetTool: 'video-generation', icon: 'VideoGen' },
    { targetMaterialType: 'audio', targetTool: 'voice-clone', icon: 'Mic' },
    { targetMaterialType: 'text', targetTool: 'audio-transcription', icon: 'TextGen' },
  ],
};

export function getOutputOptionsForMaterialNode(materialType: MaterialType): MaterialOutputOption[] {
  return MATERIAL_OUTPUT_OPTIONS[materialType] ?? [];
}

// ==================== 连接校验工具函数 ====================

interface NodeOutputInfo {
  nodeType: string;
  materialType?: MaterialType;
  materialTypes?: MaterialType[];
  hasOutput: boolean;
}

interface NodeInputRequirements {
  nodeType: string;
  selectedTool?: MaterialTool;
  acceptedTypes: MaterialType[];
}

export function getNodeOutputInfo(node: { type?: string; data?: Record<string, unknown> }): NodeOutputInfo {
  const nodeType = node.type ?? '';
  const data = node.data ?? {};

  if (nodeType === 'material') {
    const materialType = data.materialType as MaterialType | undefined;
    const status = data.status as string | undefined;
    const mediaUrl = data.mediaUrl as string | undefined;
    const content = data.content as string | undefined;
    const generatedContent = data.generatedContent as string | undefined;

    let hasOutput = false;
    if (materialType === 'text') {
      hasOutput = !!(content?.trim() || generatedContent);
    } else if (materialType === 'image') {
      hasOutput = !!mediaUrl; // 窄化：原实现还查 mediaSource/mediaFiles
    } else {
      hasOutput = !!mediaUrl || status === 'completed' || status === 'ready';
    }

    return { nodeType, materialType, hasOutput };
  }

  if (nodeType === 'video_composition') {
    const videoUrl = typeof data.outputVideoUrl === 'string' ? data.outputVideoUrl : '';
    return {
      nodeType,
      materialType: 'video',
      hasOutput: Boolean(videoUrl) || data.status === 'completed',
    };
  }

  // 未知类型，默认允许连接
  return { nodeType, hasOutput: true };
}

/**
 * 提取节点输入需求（委托 NodeSpecRegistry 单一真源：
 * 对 material 节点按「该素材类型全部工具」收集可接受输入，
 * 支持先连线后换工具的交互）
 */
function getNodeInputRequirements(node: { type?: string; data?: Record<string, unknown> }): NodeInputRequirements {
  const nodeType = node.type ?? '';
  const data = node.data ?? {};
  const selectedTool = data.selectedTool as MaterialTool | undefined;
  const materialType = data.materialType as MaterialType | undefined;

  const req = NodeSpecRegistry.getNodeInputRequirements(nodeType, undefined, materialType);
  return { nodeType, selectedTool, acceptedTypes: req.acceptedTypes };
}

export function canNodeAcceptIncomingConnection(
  node: { type?: string; data?: Record<string, unknown> },
): boolean {
  return getNodeInputRequirements(node).acceptedTypes.length > 0;
}

/** 验证两个节点之间的连接是否有效（基于类型兼容性，原样保留） */
export function isNodeConnectionValid(
  sourceNode: { type?: string; data?: Record<string, unknown> },
  targetNode: { type?: string; data?: Record<string, unknown> },
): boolean {
  const sourceInfo = getNodeOutputInfo(sourceNode);
  const targetRequirements = getNodeInputRequirements(targetNode);

  if (sourceInfo.nodeType === 'group' && !sourceInfo.hasOutput) {
    return false;
  }

  if (targetRequirements.acceptedTypes.length === 0) {
    return false;
  }

  if (sourceInfo.materialTypes && sourceInfo.materialTypes.length > 0) {
    return sourceInfo.materialTypes.some((type) => targetRequirements.acceptedTypes.includes(type));
  }

  if (!sourceInfo.materialType) {
    return true;
  }

  return targetRequirements.acceptedTypes.includes(sourceInfo.materialType);
}
