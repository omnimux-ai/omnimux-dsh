/**
 * VoicePickerDialog — 音色选择弹窗（Issue #735 / T04）。
 *
 * 结构（基于现网 CustomModal，540px / ≤70vh / 16px 圆角）：
 *   Header  标题「选择音色」+ X 关闭（CustomModal 内建）
 *   Search  「搜索音色...」即时模糊搜索（中文名 / 拼音全拼 / 首字母 /
 *           voice_type / 场景 / 标签，逻辑见 voicePickerModel）
 *   Filters 语言 / 口音 / 性别 / 场景 四维紧凑下拉，选项由 meta 动态聚合，
 *           AND 关系，空值即「全部」
 *   List    热门置顶（hot_order 1–10 → 热门标签 → 目录原序）；行内 ▶ 试听
 *           P0 无 previewUrl，点击仅 Toast「暂无试听音频」，绝不发起 TTS；
 *           点击行直接 onSelect(voice_type) 并由宿主关闭弹窗；
 *           空结果 → 友好空态 + 清除筛选
 *   Footer  常驻当前选中音色条
 * 全部颜色走 --wb-* / --dsw-* tokens，零裸 hex/rgba。
 */

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { AudioLines, Check, Play, Search } from 'lucide-react';
import { CustomModal, CustomSelect, toast } from '../../../../../ui/index.ts';
import type { VoiceCatalogOption } from '../../../../../../shared/api.ts';
import {
  EMPTY_VOICE_FILTERS,
  VOICE_GENDER_LABELS,
  collectVoiceFacets,
  filterAndSortVoices,
  resolveVoiceLabel,
  voiceTagLine,
  type VoiceFilterState,
} from './voicePickerModel.ts';

export interface VoicePickerDialogProps {
  /** 弹窗是否打开 */
  open: boolean;
  /** schema.voice.options（含 meta 的富音色目录） */
  options: VoiceCatalogOption[];
  /** 当前生效的 voice 参数值（voice_type） */
  value?: string;
  /** 选中音色：回传 voice_type，宿主负责 updateParam('voice', ...) 并关闭 */
  onSelect: (voiceType: string) => void;
  /** 关闭弹窗（X / ESC / 遮罩） */
  onClose: () => void;
}

export function VoicePickerDialog({
  open,
  options,
  value,
  onSelect,
  onClose,
}: VoicePickerDialogProps): ReactElement | null {
  const [filters, setFilters] = useState<VoiceFilterState>(EMPTY_VOICE_FILTERS);

  const patchFilters = (patch: Partial<VoiceFilterState>): void => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };
  const clearFilters = (): void => setFilters(EMPTY_VOICE_FILTERS);

  const facets = useMemo(() => collectVoiceFacets(options), [options]);
  const visibleOptions = useMemo(() => filterAndSortVoices(options, filters), [options, filters]);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const hasActiveFilters = Boolean(
    filters.query.trim() || filters.language || filters.accent || filters.gender || filters.category,
  );

  const dimensionOptions = (
    dimensionLabel: string,
    values: ReadonlyArray<string>,
  ): Array<{ value: string; label: string }> => [
    { value: '', label: dimensionLabel },
    ...values.map((item) => ({ value: item, label: item })),
  ];
  const genderOptions = [
    { value: '', label: '性别' },
    ...facets.genders.map((key) => ({ value: key, label: VOICE_GENDER_LABELS[key] ?? key })),
  ];

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      title="选择音色"
      width={540}
      className="wf-voice-picker-modal"
      bodyClassName="wf-voice-picker-modal__body"
      footer={(
        <div className="wf-voice-picker__selected" data-testid="wf-voice-picker-selected">
          <AudioLines size={13} aria-hidden="true" />
          <span className="wf-voice-picker__selected-label">当前音色</span>
          <span className="wf-voice-picker__selected-name">
            {selectedOption ? resolveVoiceLabel(selectedOption) : '未选择'}
          </span>
        </div>
      )}
    >
      <div className="wf-voice-picker__search">
        <Search size={14} aria-hidden="true" />
        <input
          type="text"
          value={filters.query}
          placeholder="搜索音色..."
          aria-label="搜索音色"
          onChange={(event) => patchFilters({ query: event.target.value })}
        />
      </div>

      <div className="wf-voice-picker__filters" data-testid="wf-voice-picker-filters">
        <CustomSelect
          className="wf-voice-picker__filter"
          value={filters.language}
          options={dimensionOptions('语言', facets.languages)}
          onChange={(next) => patchFilters({ language: String(next) })}
        />
        <CustomSelect
          className="wf-voice-picker__filter"
          value={filters.accent}
          options={dimensionOptions('口音', facets.accents)}
          onChange={(next) => patchFilters({ accent: String(next) })}
        />
        <CustomSelect
          className="wf-voice-picker__filter"
          value={filters.gender}
          options={genderOptions}
          onChange={(next) => patchFilters({ gender: String(next) })}
        />
        <CustomSelect
          className="wf-voice-picker__filter"
          value={filters.category}
          options={dimensionOptions('场景', facets.categories)}
          onChange={(next) => patchFilters({ category: String(next) })}
        />
      </div>

      <div className="wf-voice-picker__list" role="listbox" aria-label="音色列表">
        {visibleOptions.length === 0 ? (
          <div className="wf-voice-picker__empty" data-testid="wf-voice-picker-empty" role="status">
            <span className="wf-voice-picker__empty-text">未找到匹配音色</span>
            {hasActiveFilters ? (
              <button
                type="button"
                className="wf-voice-picker__empty-clear"
                onClick={clearFilters}
              >
                清除筛选
              </button>
            ) : null}
          </div>
        ) : (
          visibleOptions.map((option) => {
            const label = resolveVoiceLabel(option);
            const tagLine = voiceTagLine(option);
            const isSelected = option.value === value;
            const isHot = Boolean(option.meta?.is_hot);
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={`wf-voice-picker__row${isSelected ? ' wf-voice-picker__row--selected' : ''}`}
                data-voice-type={option.value}
                onClick={() => onSelect(option.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelect(option.value);
                }}
              >
                <button
                  type="button"
                  className="wf-voice-picker__preview"
                  aria-label={`试听 ${label}`}
                  title="试听"
                  onClick={(event) => {
                    event.stopPropagation();
                    // P0 音色索引无 previewUrl：优雅提示，绝不调用真 TTS 冒充试听。
                    toast.info('暂无试听音频');
                  }}
                >
                  <Play size={12} aria-hidden="true" />
                </button>
                <span className="wf-voice-picker__row-main">
                  <span className="wf-voice-picker__row-name">
                    {label}
                    {isHot ? <em className="wf-voice-picker__hot">热门</em> : null}
                  </span>
                  {tagLine ? (
                    <span className="wf-voice-picker__row-tags">{tagLine}</span>
                  ) : null}
                </span>
                {isSelected ? (
                  <Check size={16} className="wf-voice-picker__row-check" aria-hidden="true" />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </CustomModal>
  );
}

export default VoicePickerDialog;
