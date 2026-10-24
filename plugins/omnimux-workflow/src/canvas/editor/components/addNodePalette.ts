/**
 * 画布「添加节点」菜单的数据单点真源 + 调色板检索索引。
 * Dock (+) 与 ContextMenu 钻取面板都经 getAddNodePalette(scope) 取同一份清单，
 * 禁止在 Toolbar / ContextMenu 再维护一份 ADD_NODE_ITEMS。
 *
 * 图标以 lucide 强符号键名存放（纯数据、不持有 React 节点），由 AddNodeMenu 映射。
 *
 * 面板是**无分类平铺列表**（Issue #3640）：顺序即 ADD_NODE_PALETTE 的声明顺序，
 * 与参考截图一致；不渲染分组标题 / 折叠态。注册表 `palette.group` 元数据仍保留，
 * 但只作为调色板检索别名使用（见 `paletteGroupKey`），不再决定条目归属或顺序。
 *
 * 文案：条目默认沿用节点类型名（`node.type.<type>`）；当菜单条目文案与节点名是两个
 * 事实时（#3640：导演台 / 视频剪辑），由 `ADD_NODE_MENU_LABEL_KEYS` 登记菜单专属
 * 文案键 `palette.item.*`，节点名不受影响。
 *
 * 检索词**不由本文件发明**：取注册表 `NodePaletteEntry.keywords`（节点真实能力面），
 * 四个素材子类型再按 `materialNodeSpec.MATERIAL_TOOLS_BY_TYPE` 的真实工具键收窄。
 * 本文件只声明「画布提供哪些调色板项、落在哪个入口、用什么图标、徽标与菜单文案」，
 * 以及不创建节点的画布动作（导入素材）自己的分组与检索词。
 */

import type { MaterialType } from '../../types/materialNode';
import { MATERIAL_TOOLS_BY_TYPE, materialTools } from '../../../shared/specs/nodes/materialNodeSpec.ts';
import { getNodeDefinition } from '../../nodes/registry.ts';

export type CanvasAddNodeType = MaterialType | 'table' | 'video_composition' | 'import_asset' | 'director' | 'comfy-page';

export type AddNodePaletteScope = 'dock' | 'context';

/** lucide-react 导出名；禁止 FileText / Music / Image 等弱别名混入 */
export type AddNodePaletteIcon =
  | 'Type'
  | 'Table'
  | 'ImagePlus'
  | 'Video'
  | 'AudioLines'
  | 'Film'
  | 'UploadCloud'
  | 'Box'
  | 'MonitorPlay';

/** 条目文案的 i18n key：节点类型名（菜单专属文案见 ADD_NODE_MENU_LABEL_KEYS）。 */
export type AddNodePaletteLabelKey = `node.type.${CanvasAddNodeType}`;

export type AddNodeBadgeVariant = 'primary' | 'new';

export interface AddNodeBadge {
  text: string;
  variant: AddNodeBadgeVariant;
}

export interface AddNodePaletteItem {
  type: CanvasAddNodeType;
  icon: AddNodePaletteIcon;
  labelKey: AddNodePaletteLabelKey;
  badge?: AddNodeBadge;
  /** 出现在哪些入口；缺省视为两个入口都展示 */
  scopes: readonly AddNodePaletteScope[];
}

/**
 * 固定顺序（Issue #3640，对齐参考截图）：
 * 文本 → 表格 → 图片 → 视频 → 音频 → 导演台 → 视频剪辑 → 导入素材。
 * 导入素材仅出现在 Dock（Context pane 主菜单已有独立「导入素材」项）。
 */
export const ADD_NODE_PALETTE: readonly AddNodePaletteItem[] = [
  {
    type: 'text',
    icon: 'Type',
    labelKey: 'node.type.text',
    scopes: ['dock', 'context'],
  },
  {
    type: 'table',
    icon: 'Table',
    labelKey: 'node.type.table',
    badge: { text: 'HTable', variant: 'primary' },
    scopes: ['dock', 'context'],
  },
  {
    type: 'image',
    icon: 'ImagePlus',
    labelKey: 'node.type.image',
    scopes: ['dock', 'context'],
  },
  {
    type: 'video',
    icon: 'Video',
    labelKey: 'node.type.video',
    badge: { text: 'MiniMax H3', variant: 'primary' },
    scopes: ['dock', 'context'],
  },
  {
    type: 'audio',
    icon: 'AudioLines',
    labelKey: 'node.type.audio',
    scopes: ['dock', 'context'],
  },
  {
    type: 'director',
    icon: 'Box',
    labelKey: 'node.type.director',
    scopes: ['dock', 'context'],
  },
  {
    type: 'video_composition',
    icon: 'Film',
    labelKey: 'node.type.video_composition',
    badge: { text: 'Clip', variant: 'new' },
    scopes: ['dock', 'context'],
  },
  {
    type: 'import_asset',
    icon: 'UploadCloud',
    labelKey: 'node.type.import_asset',
    scopes: ['dock'],
  },
  {
    type: 'comfy-page',
    icon: 'MonitorPlay',
    labelKey: 'node.type.comfy-page',
    scopes: ['dock', 'context'],
  },
];

/**
 * 菜单专属文案（Issue #3640）：调色板类型 → 菜单文案 i18n key。
 *
 * 只在「菜单条目文案」与「节点类型名」是两个事实时登记：菜单显示「导演台」而节点
 * 仍叫「3D 导演台」，菜单显示「视频剪辑」而节点仍叫「视频合成」。未登记的条目沿用
 * `item.labelKey`（节点类型名）；本表不覆盖节点名，也不承载分类。
 */
const ADD_NODE_MENU_LABEL_KEYS: Partial<Record<CanvasAddNodeType, string>> = {
  director: 'palette.item.director',
  video_composition: 'palette.item.video_composition',
};

/** 条目在「添加节点」菜单里实际显示的文案 key（菜单专属文案优先）。 */
export function addNodeMenuLabelKey(item: AddNodePaletteItem): string {
  return ADD_NODE_MENU_LABEL_KEYS[item.type] ?? item.labelKey;
}

const MATERIAL_TYPES: readonly MaterialType[] = ['text', 'image', 'video', 'audio'];

function isMaterialType(type: CanvasAddNodeType): type is MaterialType {
  return (MATERIAL_TYPES as readonly string[]).includes(type);
}

/**
 * 调色板项 → 注册表节点类型。
 *
 * 四个素材子类型都由同一个 `material` 节点承载（`materialType` 区分），
 * 因此它们共享 `material` 定义声明的分组与检索词；`import_asset` 是画布动作，
 * 不创建节点，故为 null。
 */
const PALETTE_NODE_TYPE: Record<CanvasAddNodeType, string | null> = {
  text: 'material',
  image: 'material',
  video: 'material',
  audio: 'material',
  table: 'table',
  video_composition: 'video_composition',
  director: 'director',
  'comfy-page': 'comfy-page',
  import_asset: null,
};

/**
 * 不创建节点的画布动作的分组与检索词（画布级产品数据，注册表无从声明）。
 */
const PALETTE_ACTION_GROUP: Partial<Record<CanvasAddNodeType, string>> = {
  import_asset: 'palette.group.source',
};

const PALETTE_ACTION_KEYWORDS: Partial<Record<CanvasAddNodeType, readonly string[]>> = {
  import_asset: ['assets.importFile'],
};

export function getAddNodePalette(scope: AddNodePaletteScope): AddNodePaletteItem[] {
  return ADD_NODE_PALETTE.filter((item) => item.scopes.includes(scope));
}

/**
 * 调色板项的分组标题 i18n key。
 *
 * 面板不再渲染分类（#3640），该 key 仅作为**检索别名**进入匹配串：输入「素材」仍能
 * 找到四个素材子类型。
 *
 * @returns 注册表声明的分组 key；该节点未声明分组时返回 null —— 调用方必须
 *   显式处理（不落入伪造分组），不得用兜底分类掩盖缺失的元数据。
 */
export function paletteGroupKey(type: CanvasAddNodeType): string | null {
  const nodeType = PALETTE_NODE_TYPE[type];
  if (nodeType) {
    const group = getNodeDefinition(nodeType)?.palette?.group;
    if (group) return group;
  }
  return PALETTE_ACTION_GROUP[type] ?? null;
}

/**
 * 调色板项的检索词 i18n key 列表（真实来源，非手写词表）。
 *
 *  - 注册表 `palette.keywords`：节点声明的能力面；
 *  - 素材子类型：按 `MATERIAL_TOOLS_BY_TYPE[subtype]` 收窄到该子类型真实可用的工具；
 *  - 画布动作：`PALETTE_ACTION_KEYWORDS`。
 */
export function paletteKeywordKeys(type: CanvasAddNodeType): string[] {
  const nodeType = PALETTE_NODE_TYPE[type];
  const declared = (nodeType ? getNodeDefinition(nodeType)?.palette?.keywords : undefined) ?? [];

  if (nodeType === 'material' && isMaterialType(type)) {
    const toolKeys = (MATERIAL_TOOLS_BY_TYPE[type] ?? [])
      .map((toolId) => materialTools[toolId]?.labelKey)
      .filter((key): key is string => typeof key === 'string' && key.length > 0);
    return [...new Set([...declared, ...toolKeys])];
  }

  if (!nodeType) {
    return [...new Set([...declared, ...(PALETTE_ACTION_KEYWORDS[type] ?? [])])];
  }

  return [...declared];
}

export interface AddNodePaletteGroup<T = AddNodePaletteItem> {
  /** 分组标题 i18n key；未声明分组的项以 null 归入尾组。 */
  groupKey: string | null;
  items: T[];
}

/**
 * 按注册表分组给调色板行分组。
 *
 * 面板自 #3640 起不再渲染分组标题，本函数保留为注册表分组元数据的分组能力
 * （分组顺序 = 各分组在输入中首次出现的顺序，稳定、无独立分组表）；
 * 未声明分组的行收进 `groupKey: null` 的尾组，由调用方决定如何呈现，
 * 而不是被悄悄塞进某个已有分类。
 *
 * @param rows 待分组的行（调色板项本身，或带命中信息的 `AddNodePaletteMatch`）。
 * @param typeOf 从行取出调色板类型。
 */
export function groupAddNodePalette<T>(
  rows: readonly T[],
  typeOf: (row: T) => CanvasAddNodeType,
  groupKeyOf: (type: CanvasAddNodeType) => string | null = paletteGroupKey,
): AddNodePaletteGroup<T>[] {
  const groups: AddNodePaletteGroup<T>[] = [];
  const indexByKey = new Map<string | null, number>();
  for (const row of rows) {
    const groupKey = groupKeyOf(typeOf(row));
    let index = indexByKey.get(groupKey);
    if (index === undefined) {
      index = groups.length;
      indexByKey.set(groupKey, index);
      groups.push({ groupKey, items: [] });
    }
    groups[index]!.items.push(row);
  }
  return groups;
}

/** 命中区间：`[start, end)`，相对被匹配文本（UTF-16 码元，与 slice 一致）。 */
export interface PaletteMatchRange {
  start: number;
  end: number;
}

export interface AddNodePaletteMatch {
  item: AddNodePaletteItem;
  /** 该条目的本地化标签文本（调用方直接渲染，勿再取 key）。 */
  labelText: string;
  /** 标签文本内命中的区间，升序且互不重叠；空查询或无命中时为空数组。 */
  labelRanges: readonly PaletteMatchRange[];
}

/** 定位 needle 在 text 中的所有出现位置（大小写不敏感，非重叠）。 */
export function matchRanges(text: string, needle: string): PaletteMatchRange[] {
  if (!needle) return [];
  const target = needle.toLowerCase();
  const haystack = text.toLowerCase();
  const ranges: PaletteMatchRange[] = [];
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(target, from);
    if (index === -1) break;
    ranges.push({ start: index, end: index + target.length });
    from = index + target.length;
  }
  return ranges;
}

/**
 * 关键字检索：菜单文案 / 节点名 / 分类别名 / 检索词 / 条目身份 token 任一命中即保留。
 *
 * 菜单文案与节点名都进匹配串：面板显示「导演台」的同时，画布节点名「3D 导演台」
 * 仍可被搜到（#3640 去分类后不缩小可发现性）。身份 token 沿用既有 `item.type`
 * （类型 id）并补上 `item.labelKey`（节点类型名 key），两者都是条目身份而非用户文案。
 *
 * 纯函数，文本解析经 `resolveText` 注入（组件传 `t`），因此可在 node --test
 * 里脱离 React 与 locale 直接验证。空查询返回全部条目（保持声明顺序）。
 *
 * @param query 用户输入；首尾空白忽略，大小写不敏感。
 * @returns 命中的条目 + 标签命中区间（供高亮）。
 */
export function matchAddNodePalette(
  items: readonly AddNodePaletteItem[],
  query: string,
  resolveText: (key: string) => string,
  groupKeyOf: (type: CanvasAddNodeType) => string | null = paletteGroupKey,
): AddNodePaletteMatch[] {
  const needle = query.trim().toLowerCase();
  const toMatch = (item: AddNodePaletteItem): AddNodePaletteMatch => ({
    item,
    labelText: resolveText(addNodeMenuLabelKey(item)),
    labelRanges: [],
  });

  if (!needle) return items.map(toMatch);

  const matches: AddNodePaletteMatch[] = [];
  for (const item of items) {
    const labelText = resolveText(addNodeMenuLabelKey(item));
    const groupKey = groupKeyOf(item.type);
    const haystack = [
      labelText,
      resolveText(item.labelKey),
      groupKey ? resolveText(groupKey) : '',
      ...paletteKeywordKeys(item.type).map(resolveText),
      item.type,
      item.labelKey,
    ]
      .join('\u0000')
      .toLowerCase();
    if (!haystack.includes(needle)) continue;
    matches.push({ item, labelText, labelRanges: matchRanges(labelText, needle) });
  }
  return matches;
}
