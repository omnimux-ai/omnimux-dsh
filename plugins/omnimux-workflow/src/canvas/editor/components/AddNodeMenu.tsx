/**
 * 画布「添加节点」菜单：Dock (+) 与 ContextMenu 钻取共用同一份 UI。
 * 数据来自 addNodePalette（单点真源）；零 inline 颜色。
 * 调色板行保持单行（无副标题）。
 *
 * 面板是**无分类平铺列表**（Issue 3640）：条目按 addNodePalette 的声明顺序渲染，
 * 不渲染分类标题 / 计数 / 折叠态；检索词同样来自 addNodePalette（取自节点注册表），
 * 本组件不持有第二份清单。
 *
 * 两个入口共用清单，但形态按 scope 分叉（Issue 3651）：Dock 面板有搜索框与命中高亮；
 * 右键钻取面板**不渲染搜索框**（该浮层不做检索，输入框只会是死入口），列表直接平铺，
 * 样式见 components.css 的 `wf-node-menu--context` 规则。
 *
 * Issue 3741：底部的 ComfyUI 工作流导入入口已删除——画布上只保留 `comfy-page` 节点
 * 一个 ComfyUI 入口（名字见 `node.type.comfy-page`）；工作流文件导入仍在工具栏。
 */

import { memo, useMemo, useState, type ComponentType, type FC, type MouseEvent, type ReactNode } from 'react';
import {
  AudioLines,
  Box,
  ChevronLeft,
  Film,
  ImagePlus,
  MonitorPlay,
  Search,
  Table,
  Type,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useT } from '../../i18n';
import {
  getAddNodePalette,
  matchAddNodePalette,
  type AddNodePaletteIcon,
  type AddNodePaletteMatch,
  type AddNodePaletteScope,
  type CanvasAddNodeType,
} from './addNodePalette';

const ICON_MAP: Record<AddNodePaletteIcon, ComponentType<{ size?: number }>> = {
  Type,
  Table,
  ImagePlus,
  Video,
  AudioLines,
  Box,
  Film,
  UploadCloud,
  MonitorPlay,
};

export interface AddNodeMenuProps {
  scope: AddNodePaletteScope;
  onSelect: (type: CanvasAddNodeType) => void;
  /** Context 钻取：返回主菜单 */
  onBack?: () => void;
}

function stopMenuEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** 把命中区间包进 <mark>；无命中时原样返回标签文本。 */
function renderLabel(match: AddNodePaletteMatch): ReactNode {
  const { labelText, labelRanges } = match;
  if (labelRanges.length === 0) return labelText;

  const parts: ReactNode[] = [];
  let cursor = 0;
  labelRanges.forEach((range, index) => {
    if (range.start > cursor) parts.push(labelText.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}-${index}`} className="wf-node-menu__match">
        {labelText.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < labelText.length) parts.push(labelText.slice(cursor));
  return parts;
}

const AddNodeMenu: FC<AddNodeMenuProps> = ({ scope, onSelect, onBack }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  /** 搜索只属于 Dock 的调色板视图：右键浮层不做检索（Issue 3651）。 */
  const showSearch = scope === 'dock';

  const items = useMemo(() => getAddNodePalette(scope), [scope]);
  const matches = useMemo(
    () => matchAddNodePalette(items, showSearch ? query : '', t),
    [items, query, showSearch, t],
  );

  return (
    <div
      className={`wf-node-menu wf-node-menu--${scope}`}
      onContextMenu={stopMenuEvent}
    >
      <div className="wf-node-menu__container">
        <div className="wf-node-menu__header">
          {scope === 'context' ? (
            <button
              type="button"
              className="wf-node-menu__back-btn"
              onClick={(event) => {
                event.stopPropagation();
                onBack?.();
              }}
              title={t('menu.back')}
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <span className="wf-node-menu__title">{t('menu.addNode')}</span>
          {scope === 'dock' ? <kbd className="wf-node-menu__kbd">N</kbd> : null}
        </div>

        {showSearch ? (
          <div className="wf-node-menu__search">
            <Search size={14} className="wf-node-menu__search-icon" />
            <input
              type="text"
              className="wf-node-menu__search-input"
              value={query}
              placeholder={t('palette.searchPlaceholder')}
              aria-label={t('palette.searchLabel')}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}

        <div className="wf-node-menu__list">
          {showSearch && matches.length === 0 ? (
            <div className="wf-node-menu__empty" role="status">
              <p className="wf-node-menu__empty-title">{t('palette.searchEmpty')}</p>
              <p className="wf-node-menu__empty-hint">{t('palette.searchEmptyHint')}</p>
            </div>
          ) : null}

          {matches.map((match) => {
            const { item } = match;
            const Icon = ICON_MAP[item.icon];
            return (
              <button
                key={item.type}
                type="button"
                className="wf-node-menu__item"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.type);
                }}
              >
                <div className="wf-node-menu__icon-box">
                  <Icon size={18} />
                </div>
                <span className="wf-node-menu__label">{renderLabel(match)}</span>
                {item.badge ? (
                  <span
                    className={`wf-node-menu__badge wf-node-menu__badge--${item.badge.variant}`}
                  >
                    {item.badge.text}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(AddNodeMenu);
export type { CanvasAddNodeType };
