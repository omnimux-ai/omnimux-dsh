/**
 * Ported (narrowed) from Gxgen `apps/web/src/types/materialNode.ts` +
 * `packages/shared/src/canvas/materialTypes.ts` — validated by the
 * extraction spike (research/canvas-spike/SPIKE-REPORT.md).
 *
 * The `@gxg/shared/canvas` module (376 lines, zero deps) was inlined
 * verbatim below; MaterialNodeData is narrowed to the fields the canvas
 * graph + connection validation actually consume.
 *
 * MATERIAL_TOOLS and MATERIAL_TOOL_INPUT_TYPES are dynamically derived
 * from the unified NodeSpecRegistry SSOT.
 */

import type { MaterialType } from '../canvasTypes.ts';
import type { SlotBindings, SlotConflict } from './feedSlot/types.ts';
import {
  type MaterialTool,
  MATERIAL_TOOLS_BY_TYPE,
  DEFAULT_MATERIAL_TOOL_BY_TYPE,
} from '../specs/nodes/materialNodeSpec.ts';
import { NodeSpecRegistry } from '../specs/registry.ts';

// ============================================================================
// Inlined from @gxg/shared/canvas/materialTypes.ts (verbatim)
// ============================================================================

export type { MaterialType, MaterialTool };

export const MATERIAL_TYPES: MaterialType[] = ['text', 'image', 'video', 'audio'];

export const MATERIAL_TOOLS: Record<MaterialType, readonly MaterialTool[]> = MATERIAL_TOOLS_BY_TYPE;

export const DEFAULT_MATERIAL_TOOL: Record<MaterialType, MaterialTool> = DEFAULT_MATERIAL_TOOL_BY_TYPE;

/** 生成型工具的可用画幅选项（params.aspectRatio） */
export const ASPECT_RATIO_OPTIONS = ['1:1', '4:3', '16:9', '9:16'] as const;

/** 工具 -> 可接受的上游素材类型矩阵（连接校验的类型合同，由 NodeSpecRegistry 动态派生） */
function deriveMaterialToolInputTypes(): Partial<Record<MaterialTool, MaterialType[]>> {
  const result: Partial<Record<MaterialTool, MaterialType[]>> = {};
  const spec = NodeSpecRegistry.get('material');
  if (spec) {
    for (const [toolId, toolSpec] of Object.entries(spec.tools)) {
      result[toolId as MaterialTool] = [...toolSpec.acceptedInputTypes];
    }
  }
  return result;
}

export const MATERIAL_TOOL_INPUT_TYPES: Partial<Record<MaterialTool, MaterialType[]>> = deriveMaterialToolInputTypes();

// ============================================================================
// Narrowed from Gxgen apps/web/src/types/materialNode.ts
// ============================================================================

export type MaterialStatus = 'empty' | 'ready' | 'generating' | 'completed' | 'failed' | 'offline';
export type NodeFailStrategy = 'abort' | 'skip';
export type NodeKind = 'generate' | 'import';

/**
 * 文本节点历史版本快照
 */
export interface TextVersionSnapshot {
  id: string;
  timestamp: number;
  name: string;
  content: string;
  source?: 'auto' | 'manual' | 'revert' | 'import';
  wordCount?: number;
  charCount?: number;
}

/**
 * MaterialNode 节点数据（窄化版）。
 *
 * 保留了画布图结构 + 连接校验 + 配置面板真正消费的字段，裁掉了预设
 * 服务绑定、输入槽位、角色设计等强业务字段。索引签名保留以兼容
 * React Flow 的 Record<string, unknown> 约束。
 */
export interface MaterialNodeData {
  // 索引签名：兼容 Record<string, unknown>（React Flow 要求）
  [key: string]: unknown;

  // === 基础信息 ===
  label: string;
  materialType: MaterialType;
  /** 不可变身份判别：创建时确定，只读。缺省由 selectedTool 推导（兼容老数据）。 */
  nodeKind?: NodeKind;

  // === 输出内容 ===
  status: MaterialStatus;
  content?: string;
  mediaUrl?: string;
  /** Project-relative POSIX path of the materialized file (SSOT). */
  relativePath?: string;
  /** Ledger asset id in `<ProjectRoot>/.omnimux/assets.json`. */
  assetId?: string;
  /** Legacy absolute path. New writes must not persist this. */
  realPath?: string;
  originalName?: string;
  /** Canonical MIME; null when unknown (never invent octet-stream). */
  mimeType?: string | null;
  /** Canonical byte size; null when unknown (never invent 0). */
  sizeBytes?: number | null;
  /** Canonical duration seconds; null when unknown. */
  durationSec?: number | null;
  /** Legacy alias of sizeBytes (same null semantics). */
  fileSize?: number | null;
  isMissing?: boolean;
  taskId?: string;
  errorMessage?: string;
  generatedContent?: string;

  // === 生成配置 ===
  selectedTool: MaterialTool;
  prompt?: string;
  params: Record<string, unknown>;
  failStrategy?: NodeFailStrategy;
  /** Media consumption authority; absent only on graphs awaiting hydration. */
  slotBindings?: SlotBindings;
  slotConflicts?: SlotConflict[];

  // === 尺寸配置 ===
  nodeWidth?: number;
  nodeHeight?: number;
  dimensions?: { width: number; height: number };
  aspectRatio?: number;
  /** Legacy alias of durationSec (same null semantics). */
  duration?: number | null;

  // === 文本与版本快照配置 ===
  versions?: TextVersionSnapshot[];
  wordCount?: number;
  charCount?: number;
}

/** 创建默认的 MaterialNodeData（窄化版）。
 *
 * label 默认为空串：NodeHeader 在 label 为空时回退到 i18n 字典的
 * `node.type.<materialType>` 文案，节点类型名可随宿主语言 live 切换；
 * 用户双击改名后 label 落为持久化用户数据，不再跟随语言。
 */
export function createDefaultMaterialNodeData(
  materialType: MaterialType,
  overrides?: Partial<MaterialNodeData>,
): MaterialNodeData {
  return {
    label: '',
    materialType,
    status: 'empty',
    selectedTool: DEFAULT_MATERIAL_TOOL[materialType],
    params: {},
    failStrategy: 'abort',
    ...overrides,
  };
}

/**
 * 全仓唯一节点身份判定真源：
 * 1. 显式 nodeKind === 'generate' | 'import' 优先
 * 2. 老数据 / 未标注节点兜底：selectedTool === 'import' 视为导入节点，其余为生成节点
 *
 * 关键规则：身份证据优先于行为残留 —— 标为 import 的节点即使残留 prompt，
 * 也绝不走模型生成（从根本上杜绝覆盖 realPath 与误烧钱）。
 */
export function resolveNodeKind(data: {
  nodeKind?: unknown;
  selectedTool?: unknown;
  realPath?: unknown;
  materialType?: unknown;
  content?: unknown;
  prompt?: unknown;
  generatedContent?: unknown;
}): NodeKind {
  // 文本节点专属业务逻辑（模型生成与手动编辑互斥）：
  // 若填写了手动编辑内容且无活跃 Prompt，坚决判定为 import（文本文件输入，不再支持模型生成）
  if (
    data.materialType === 'text' &&
    typeof data.content === 'string' &&
    data.content.trim().length > 0 &&
    !data.generatedContent &&
    (!data.prompt || !String(data.prompt).trim())
  ) {
    return 'import';
  }

  if (data.nodeKind === 'generate' || data.nodeKind === 'import') {
    return data.nodeKind;
  }
  if (data.selectedTool === 'import') {
    return 'import';
  }
  return 'generate';
}

/**
 * @deprecated 请改用 `resolveNodeKind(data) === 'generate'`。
 * 保留此函数仅供老代码兼容，内部委托给 resolveNodeKind。
 */
export function isGenerativeTool(tool: MaterialTool): boolean {
  return resolveNodeKind({ selectedTool: tool }) === 'generate';
}
