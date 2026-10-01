/**
 * 画布资源面板：搜索 + CustomSelect 分类 + 网格/列表 + 已添加标记。
 */

import React, { useMemo, useState } from 'react';
import { Check, FileText, LayoutGrid, List, Search } from 'lucide-react';
import { CustomSelect } from '../../../ui';
import { useT } from '../../../i18n';
import type { MaterialType } from '../../../types/materialNode';
import {
  filterCanvasResources,
  pickerCandidateAvailability,
  type CanvasResourceItem,
  type ResourceTypeFilter,
  type ResourcePickerView,
  type ResourcePickerMode,
} from '../../utils/resourcePickerPolicy.ts';
import type { NodeSlotEngineState } from '../../../../shared/graph/slotContractTypes.ts';
import PreviewThumb from './PreviewThumb.tsx';

export interface CanvasResourcePaneProps {
  items: CanvasResourceItem[];
  selectedIds: string[];
  mode?: ResourcePickerMode;
  targetSlotIndex?: number;
  slotState?: NodeSlotEngineState;
  onToggle: (nodeId: string, alreadyConnected: boolean, disabled?: boolean) => void;
  /** T03：目标 slot 接受的素材类型；列表按此预过滤并锁定分类。 */
  acceptedTypes?: readonly string[];
  /** T03：slot 装填会话允许选中已连入（未消费）的供给。 */
  allowConnectedSelection?: boolean;
}

const CanvasResourcePane: React.FC<CanvasResourcePaneProps> = ({
  items,
  selectedIds,
  mode = 'add',
  targetSlotIndex,
  slotState,
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
      : items).map(item => ({ ...item, title: item.titleKey ? t(item.titleKey) : item.title })),
    [items, acceptedTypes, t],
  );
  const qualifiedTypes = [...new Set(scopedItems.map(item => item.materialType))];
  const lockedFilter = qualifiedTypes.length === 1 ? qualifiedTypes[0] as ResourceTypeFilter : null;
  const effectiveFilter = lockedFilter ?? typeFilter;

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('picker.filter.all') },
      { value: 'text' as const, label: t('node.type.text') },
      { value: 'image' as const, label: t('panel.slot.image') },
      { value: 'video' as const, label: t('panel.slot.video') },
      { value: 'audio' as const, label: t('picker.filter.audio') },
    ].filter(option => option.value === 'all' || qualifiedTypes.includes(option.value as MaterialType)),
    [t, qualifiedTypes.join(',')],
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
        {qualifiedTypes.length > 1 && (
          <CustomSelect
            className="wf-picker-filter"
            variant="standard"
            value={typeFilter}
            placeholder={t('picker.type')}
            options={filterOptions.map(option => option.value === 'all' ? { ...option, triggerLabel: t('picker.type') } : option)}
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
            const availability = { isCurrentSlot: false, badgeLabel: undefined };

            const { isAssigned, disabled } = pickerCandidateAvailability(item, mode, allowConnectedSelection);
            const isDisabled = isAssigned || (!selected && disabled);

            return (
              <button
                key={item.nodeId}
                type="button"
                className={`wf-picker-card ${selected ? 'wf-picker-card--selected' : ''} ${
                  isAssigned ? 'wf-picker-card--added wf-resource-item--assigned' : ''
                } ${
                  isDisabled ? 'wf-resource-item--disabled' : ''
                } ${
                  availability.isCurrentSlot ? 'wf-resource-item--current-slot' : ''
                }`}
                onClick={() => onToggle(item.nodeId, isAssigned, isDisabled)}
                disabled={isDisabled}
                aria-pressed={selected}
                aria-label={item.title}
                title={item.title}
              >
                {item.materialType === 'text' ? <span className="wf-picker-text-preview"><FileText size={18} aria-hidden="true" /><span>{item.textContent}</span>{selected ? <Check size={14} aria-hidden="true" /> : null}</span> : <PreviewThumb
                  layout="grid"
                  materialType={item.materialType}
                  previewUrl={item.previewUrl}
                  width={measured[item.nodeId]?.width ?? item.width}
                  height={measured[item.nodeId]?.height ?? item.height}
                  badge={isAssigned ? 'added' : selected ? 'selected' : 'none'}
                  addedLabel={t('picker.added')}
                  fallbackLabel=""
                  mimeOrName={item.previewUrl}
                  onNaturalSize={(s) =>
                    setMeasured((prev) => ({ ...prev, [item.nodeId]: s }))
                  }
                />}
                <div className="wf-picker-card__meta">
                  <span className="wf-picker-card__name">{item.title}</span>
                  {isAssigned && item.materialType === 'text' ? <span className="wf-picker-added-badge">{t('picker.added')}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="wf-picker-list">
          {visible.map((item) => {
            const selected = selectedIds.includes(item.nodeId);
            const availability = { isCurrentSlot: false, badgeLabel: undefined };

            const { isAssigned, disabled } = pickerCandidateAvailability(item, mode, allowConnectedSelection);
            const isDisabled = isAssigned || (!selected && disabled);

            return (
              <button
                key={item.nodeId}
                type="button"
                className={`wf-picker-row ${selected ? 'wf-picker-row--selected' : ''} ${
                  isAssigned ? 'wf-picker-row--added wf-resource-item--assigned' : ''
                } ${
                  isDisabled ? 'wf-resource-item--disabled' : ''
                } ${
                  availability.isCurrentSlot ? 'wf-resource-item--current-slot' : ''
                }`}
                onClick={() => onToggle(item.nodeId, isAssigned, isDisabled)}
                disabled={isDisabled}
                aria-pressed={selected}
                aria-label={item.title}
              >
                {item.materialType === 'text' ? <span className="wf-picker-row__thumb wf-picker-text-preview"><FileText size={18} aria-hidden="true" /></span> : <PreviewThumb
                  layout="list"
                  materialType={item.materialType}
                  previewUrl={item.previewUrl}
                  width={measured[item.nodeId]?.width ?? item.width}
                  height={measured[item.nodeId]?.height ?? item.height}
                  badge="none"
                  fallbackLabel=""
                  mimeOrName={item.previewUrl}
                  className="wf-picker-row__thumb"
                  onNaturalSize={(s) =>
                    setMeasured((prev) => ({ ...prev, [item.nodeId]: s }))
                  }
                />}
                <div className="wf-picker-row__body">
                  <span className="wf-picker-card__name">{item.title}</span>
                  <span className="wf-picker-row__sub">
                    {item.subtitle}
                  </span>
                </div>
                {isAssigned || availability.badgeLabel ? (
                  <span className="wf-picker-added-badge wf-picker-added-badge--inline">
                    {isAssigned ? <Check size={11} /> : null}
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
