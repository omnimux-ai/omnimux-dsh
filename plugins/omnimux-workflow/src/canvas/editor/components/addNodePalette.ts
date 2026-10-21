/**
 * 画布「添加节点」菜单的数据单点真源。
 * Dock (+) 与 ContextMenu 钻取面板都经 getAddNodePalette(scope) 取同一份清单，
 * 禁止在 Toolbar / ContextMenu 再维护一份 ADD_NODE_ITEMS。
 *
 * 图标以 lucide 强符号键名存放（纯数据、不持有 React 节点），由 AddNodeMenu 映射。
 */

import type { MaterialType } from '../../types/materialNode';

export type CanvasAddNodeType = MaterialType | 'table' | 'video_composition' | 'import_asset' | 'director';

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
  | 'Box';

export type AddNodeBadgeVariant = 'primary' | 'new';

export interface AddNodeBadge {
  text: string;
  variant: AddNodeBadgeVariant;
}

export interface AddNodePaletteItem {
  type: CanvasAddNodeType;
  icon: AddNodePaletteIcon;
  labelKey: `node.type.${CanvasAddNodeType}`;
  badge?: AddNodeBadge;
  /** 出现在哪些入口；缺省视为两个入口都展示 */
  scopes: readonly AddNodePaletteScope[];
}

/**
 * 固定顺序：Type → Table → ImagePlus → Video → AudioLines → Film → Box → UploadCloud。
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
    type: 'video_composition',
    icon: 'Film',
    labelKey: 'node.type.video_composition',
    badge: { text: 'Clip', variant: 'new' },
    scopes: ['dock', 'context'],
  },
  {
    type: 'director',
    icon: 'Box',
    labelKey: 'node.type.director',
    scopes: ['dock', 'context'],
  },
  {
    type: 'import_asset',
    icon: 'UploadCloud',
    labelKey: 'node.type.import_asset',
    scopes: ['dock'],
  },
];

export function getAddNodePalette(scope: AddNodePaletteScope): AddNodePaletteItem[] {
  return ADD_NODE_PALETTE.filter((item) => item.scopes.includes(scope));
}
