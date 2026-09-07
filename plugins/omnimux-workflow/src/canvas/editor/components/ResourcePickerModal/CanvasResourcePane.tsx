/**
 * 画布资源面板：搜索 + CustomSelect 分类 + 网格/列表 + 已添加标记。
 */

import React, { useMemo, useState } from 'react';
import { Check, LayoutGrid, List, Search } from 'lucide-react';
import { CustomSelect } from '../../../ui';
import { useT } from '../../../i18n';
import type { MaterialType } from '../../../types/materialNode';
import {
  filterCanvasResources,
  type CanvasResourceItem,
  type ResourceTypeFilter,
  type ResourcePickerView,
} from '../../utils/resourcePickerPolicy.ts';
import PreviewThumb from './PreviewThumb.tsx';

export interface CanvasResourcePaneProps {
  items: CanvasResourceItem[];
  selectedIds: string[];
  onToggle: (nodeId: string, alreadyConnected: boolean) => void;
  /** T03：目标 slot 接受的素材类型；列表按此预过滤并锁定分类。 */
  acceptedTypes?: readonly string[];
  /** T03：slot 装填会话允许选中已连入（未消费）的供给。 */
  allowConnectedSelection?: boolean;
}

function typeLabelKey(type: MaterialType): string {
  switch (type) {
    case 'image':
      return 'node.type.image';
    case 'video':
      return 'node.type.video';
    case 'audio':
      return 'node.type.audio';
    default:
      return 'node.type.text';
  }
}

const CanvasResourcePane: React.FC<CanvasResourcePaneProps> = ({
  items,
  selectedIds,
  onToggle,
  acceptedTypes,
  allowConnectedSelection = false,
}) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>('all');
  const [view, setView] = useState<ResourcePickerView>('grid');
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  const scopedItems = useMemo(
    () => (acceptedTypes?.length
      ? items.filter((item) => acceptedTypes.includes(item.materialType))
      : items),
    [items, acceptedTypes],
  );
  const lockedFilter = acceptedTypes?.length === 1 ? acceptedTypes[0] as ResourceTypeFilter : null;
  const effectiveFilter = lockedFilter ?? typeFilter;

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('picker.filter.all') },
      { value: 'image' as const, label: t('picker.filter.image') },
      { value: 'video' as const, label: t('picker.filter.video') },
      { value: 'audio' as const, label: t('picker.filter.audio') },
    ],
    [t],
  );

  const visible = useMemo(
    () => filterCanvasResources(scopedItems, query, effectiveFilter),
    [scopedItems, query, effectiveFilter],
  );

  const emptyKey = scopedItems.length === 0 ? 'picker.empty' : 'picker.emptyFilter';

  return (
    <div className="wf-picker-pane">
      <div className="wf-picker-toolbar">
        <label className="wf-picker-search">
          <Search size={14} className="wf-picker-search__icon" />
          <input
            type="text"
            className="wf-picker-search__input"
            value={query}
            placeholder={t('picker.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!lockedFilter && (
          <CustomSelect
            className="wf-picker-filter"
            variant="standard"
            value={typeFilter}
            options={filterOptions}
            onChange={(value) => setTypeFilter(value)}
          />
        )}
        <div className="wf-picker-view-toggle" role="group" aria-label={t('picker.view.grid')}>
          <button
            type="button"
            className={`wf-picker-view-btn ${view === 'grid' ? 'wf-picker-view-btn--active' : ''}`}
            onClick={() => setView('grid')}
            title={t('picker.view.grid')}
            aria-pressed={view === 'grid'}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            className={`wf-picker-view-btn ${view === 'list' ? 'wf-picker-view-btn--active' : ''}`}
            onClick={() => setView('list')}
            title={t('picker.view.list')}
            aria-pressed={view === 'list'}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="wf-picker-empty">{t(emptyKey)}</div>
      ) : view === 'grid' ? (
        <div className="wf-picker-grid">
          {visible.map((item) => {
            const selected = selectedIds.includes(item.nodeId);
            return (
              <button
                key={item.nodeId}
                type="button"
                className={`wf-picker-card ${selected ? 'wf-picker-card--selected' : ''} ${
                  item.alreadyConnected ? 'wf-picker-card--added' : ''
                }`}
                onClick={() => onToggle(item.nodeId, item.alreadyConnected && !allowConnectedSelection)}
                disabled={item.alreadyConnected && !allowConnectedSelection}
                title={item.title}
              >
                <PreviewThumb
                  layout="grid"
                  materialType={item.materialType}
                  previewUrl={item.previewUrl}
                  width={measured[item.nodeId]?.width ?? item.width}
                  height={measured[item.nodeId]?.height ?? item.height}
                  badge={selected ? 'selected' : item.alreadyConnected ? 'added' : 'none'}
                  addedLabel={t('picker.added')}
                  fallbackLabel={t(typeLabelKey(item.materialType))}
                  mimeOrName={item.previewUrl}
                  onNaturalSize={(s) =>
                    setMeasured((prev) => ({ ...prev, [item.nodeId]: s }))
                  }
                />
                <div className="wf-picker-card__meta">
                  <span className="wf-picker-card__name">{item.title}</span>
                  <span className="wf-picker-type-tag">{t(typeLabelKey(item.materialType))}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="wf-picker-list">
          {visible.map((item) => {
            const selected = selectedIds.includes(item.nodeId);
            return (
              <button
                key={item.nodeId}
                type="button"
                className={`wf-picker-row ${selected ? 'wf-picker-row--selected' : ''} ${
                  item.alreadyConnected ? 'wf-picker-row--added' : ''
                }`}
                onClick={() => onToggle(item.nodeId, item.alreadyConnected && !allowConnectedSelection)}
                disabled={item.alreadyConnected && !allowConnectedSelection}
              >
                <PreviewThumb
                  layout="list"
                  materialType={item.materialType}
                  previewUrl={item.previewUrl}
                  width={measured[item.nodeId]?.width ?? item.width}
                  height={measured[item.nodeId]?.height ?? item.height}
                  badge="none"
                  fallbackLabel={t(typeLabelKey(item.materialType))}
                  mimeOrName={item.previewUrl}
                  className="wf-picker-row__thumb"
                  onNaturalSize={(s) =>
                    setMeasured((prev) => ({ ...prev, [item.nodeId]: s }))
                  }
                />
                <div className="wf-picker-row__body">
                  <span className="wf-picker-card__name">{item.title}</span>
                  <span className="wf-picker-row__sub">
                    {item.subtitle || item.nodeId}
                    {' · '}
                    {t(typeLabelKey(item.materialType))}
                  </span>
                </div>
                {item.alreadyConnected && !allowConnectedSelection ? (
                  <span className="wf-picker-added-badge wf-picker-added-badge--inline">
                    <Check size={11} />
                    {t('picker.added')}
                  </span>
                ) : (
                  <span className={`wf-picker-check ${selected ? 'wf-picker-check--on' : ''}`}>
                    {selected ? <Check size={11} /> : null}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CanvasResourcePane;
