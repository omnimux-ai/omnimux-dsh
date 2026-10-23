/**
 * 画布「添加节点」菜单：Dock (+) 与 ContextMenu 钻取共用同一份 UI。
 * 数据来自 addNodePalette（单点真源）；零 inline 颜色、零副标题。
 *
 * 分类与检索同样来自 addNodePalette（其分组/检索词取自节点注册表），
 * 本组件不持有第二份分类表；注册表未声明分组的节点不会被安进伪造分类。
 */

import { memo, useMemo, useState, type ComponentType, type FC, type MouseEvent, type ReactNode } from 'react';
import {
  AudioLines,
  Box,
  ChevronDown,
  ChevronLeft,
  Film,
  ImagePlus,
  Search,
  Table,
  Type,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useT } from '../../i18n';
import {
  getAddNodePalette,
  groupAddNodePalette,
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
};

/** 折叠态在组件内的键：注册表未声明分组的行使用此哨兵（不是用户可见文案）。 */
const UNGROUPED_KEY = '\u0000ungrouped';

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
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());

  const items = useMemo(() => getAddNodePalette(scope), [scope]);
  const matches = useMemo(() => matchAddNodePalette(items, query, t), [items, query, t]);
  const groups = useMemo(
    () => groupAddNodePalette(matches, (match) => match.item.type),
    [matches],
  );

  const searching = query.trim().length > 0;

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

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

        <div className="wf-node-menu__list">
          {groups.length === 0 ? (
            <div className="wf-node-menu__empty" role="status">
              <p className="wf-node-menu__empty-title">{t('palette.searchEmpty')}</p>
              <p className="wf-node-menu__empty-hint">{t('palette.searchEmptyHint')}</p>
            </div>
          ) : null}

          {groups.map((group) => {
            const groupKey = group.groupKey ?? UNGROUPED_KEY;
            // 检索时强制展开：命中项必须可见，折叠态不得藏住搜索结果。
            const isCollapsed = !searching && collapsedGroups.has(groupKey);
            return (
              <div key={groupKey} className="wf-node-menu__group">
                {group.groupKey ? (
                  <button
                    type="button"
                    className="wf-node-menu__group-header"
                    aria-expanded={!isCollapsed}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleGroup(groupKey);
                    }}
                  >
                    <ChevronDown
                      size={14}
                      className={`wf-node-menu__group-caret${
                        isCollapsed ? ' wf-node-menu__group-caret--collapsed' : ''
                      }`}
                    />
                    <span className="wf-node-menu__group-title">{t(group.groupKey)}</span>
                    <span className="wf-node-menu__group-count">{group.items.length}</span>
                  </button>
                ) : null}

                {isCollapsed
                  ? null
                  : group.items.map((match) => {
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
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(AddNodeMenu);
export type { CanvasAddNodeType };
