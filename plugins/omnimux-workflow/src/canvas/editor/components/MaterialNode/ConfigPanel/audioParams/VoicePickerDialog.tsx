/**
 * VoicePickerDialog — 音色选择弹窗（Issue #735 / T04；Issue #771 试听接入）。
 *
 * 结构（基于现网 CustomModal，540px / ≤70vh / 16px 圆角）：
 *   Header  标题「选择音色」+ X 关闭（CustomModal 内建）
 *   Search  「搜索音色...」即时模糊搜索（中文名 / 拼音全拼 / 首字母 /
 *           voice_type / 场景 / 标签，逻辑见 voicePickerModel）
 *   Filters 语言 / 口音 / 性别 / 场景 四维紧凑下拉，选项由 meta 动态聚合，
 *           AND 关系，空值即「全部」
 *   List    热门置顶（hot_order 1–10 → 热门标签 → 目录原序）；行内 ▶ 试听
 *           Issue #771：原生 Audio 对象加载火山官方 CDN 样音（见
 *           getVoiceSampleUrl），单例播放（同时只有一个音色发声），
 *           播放中切 ⏸ 可暂停；加载失败兜底 Toast「该音色暂无官方试听音频」，
 *           绝不发起 TTS 请求；点击行直接 onSelect(voice_type) 并由宿主
 *           关闭弹窗；空结果 → 友好空态 + 清除筛选
 *   Footer  常驻当前选中音色条
 * 全部颜色走 --wb-* / --dsw-* tokens，零裸 hex/rgba。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { AudioLines, Check, Pause, Play, Search } from 'lucide-react';
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

/** 火山引擎大模型官方公开 CDN：预置音色 3~5 秒 MP3 试听样音（已开 CORS） */
export const VOLCENGINE_SAMPLE_CDN_BASE = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts';

/** 按 voice_type 生成官方试听样音 URL（纯前端 Audio 播放，零 TTS 请求） */
export function getVoiceSampleUrl(voiceType: string): string {
  return `${VOLCENGINE_SAMPLE_CDN_BASE}/${encodeURIComponent(voiceType)}.mp3`;
}

/**
 * 计算音色试听候选样音文件名列表（按匹配优先级排序，解决火山官方对英文/别名音色命名差异）：
 * 1. 英文/外语音色（或含英文别名的音色）：如 Charlie 2.0 -> Charlie.mp3、Frosty Man -> Frosty_Man.mp3、爽快思思/Skye -> Skye.mp3
 * 2. 官方标准代号名：voice_type.mp3
 * 3. 中文名（去除斜杠等）：如 解说小明.mp3、枕边低语.mp3
 * 4. 去除 2.0 后缀后的名称
 */
export function getVoiceSampleCandidates(optionOrVoiceType: VoiceCatalogOption | string): string[] {
  const isString = typeof optionOrVoiceType === 'string';
  const voiceType = isString ? optionOrVoiceType : optionOrVoiceType.value;
  const option = isString ? null : optionOrVoiceType;
  const rawName = option?.meta?.name || '';
  const displayName = option?.meta?.display_name || option?.label || '';

  const fileNames: string[] = [];

  // 1. 英文名 / 拼写（如 Charlie, Frosty_Man, The_Grinch 等）或带斜杠别名（爽快思思/Skye）
  if (rawName) {
    if (rawName.includes('/')) {
      const parts = rawName.split('/').map((s) => s.trim().replace(/ /g, '_'));
      if (parts[1]) fileNames.push(`${parts[1]}.mp3`);
      if (parts[0]) fileNames.push(`${parts[0]}.mp3`);
    } else {
      const cleanName = rawName.replace(/ /g, '_');
      if (/^[A-Za-z0-9_ -]+$/.test(rawName)) {
        fileNames.push(`${cleanName}.mp3`);
      }
    }
  }

  // 2. 官方标准代号：voice_type.mp3
  fileNames.push(`${voiceType}.mp3`);

  // 3. 中文名或常规名
  if (rawName && !rawName.includes('/')) {
    const cleanName = rawName.replace(/ /g, '_');
    fileNames.push(`${cleanName}.mp3`);
  }

  // 4. 去除 2.0 后缀的名称（如 枕边低语 2.0 -> 枕边低语.mp3）
  if (displayName) {
    const noVer = displayName.replace(/[_ ]?2\.0$/, '').replace(/ /g, '_');
    if (noVer && !fileNames.includes(`${noVer}.mp3`)) {
      fileNames.push(`${noVer}.mp3`);
    }
  }

  const unique = Array.from(new Set(fileNames));
  return unique.map((name) => `${VOLCENGINE_SAMPLE_CDN_BASE}/${encodeURIComponent(name)}`);
}

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
  /** 当前正在播放试听的 voice_type；无播放为 null */
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  /** 全局单例 Audio 实例：同一时刻弹窗内只有一个音色发声 */
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** 立即停止并清理当前试听实例，重置播放状态 */
  const stopPlayback = (): void => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.src = '';
      audioRef.current = null;
    }
    setPlayingVoice(null);
  };

  // 弹窗关闭（!open）时停止试听，防止声音在后台继续播放
  useEffect(() => {
    if (!open) stopPlayback();
  }, [open]);

  // 组件卸载时兜底清理
  useEffect(() => stopPlayback, []);

  /** 试听/暂停切换：stopPropagation 防止触发行选择 */
  const togglePreview = (
    event: ReactMouseEvent<HTMLButtonElement>,
    optionOrVoiceType: VoiceCatalogOption | string,
  ): void => {
    event.stopPropagation();
    const voiceType = typeof optionOrVoiceType === 'string' ? optionOrVoiceType : optionOrVoiceType.value;
    if (playingVoice === voiceType) {
      // 当前音色正在播放 → 暂停
      stopPlayback();
      return;
    }
    // 正在播放其他音色 → 先停掉再播当前
    stopPlayback();
    const candidateUrls = getVoiceSampleCandidates(optionOrVoiceType);
    if (candidateUrls.length === 0) {
      toast.info('该音色暂无官方试听音频');
      return;
    }

    let candidateIndex = 0;
    const audio = new Audio(candidateUrls[0]);
    audioRef.current = audio;

    const clearPlayback = (): void => {
      if (audioRef.current === audio) audioRef.current = null;
      setPlayingVoice(null);
    };

    const tryNextOrReportError = (): void => {
      candidateIndex += 1;
      if (candidateIndex < candidateUrls.length && audioRef.current === audio) {
        audio.src = candidateUrls[candidateIndex]!;
        void audio.play().catch(() => {
          tryNextOrReportError();
        });
        return;
      }
      clearPlayback();
      toast.info('该音色暂无官方试听音频');
    };

    audio.onended = clearPlayback;
    audio.onerror = () => {
      // 当前候选 URL 加载失败（如 404），自动降级尝试下一候选，全部候选穷尽后才优雅提示
      tryNextOrReportError();
    };

    setPlayingVoice(voiceType);
    void audio.play().catch(() => {
      tryNextOrReportError();
    });
  };

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
            const isPlaying = playingVoice === option.value;
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
                  className={`wf-voice-picker__preview${isPlaying ? ' wf-voice-picker__preview--playing' : ''}`}
                  aria-label={isPlaying ? `暂停试听 ${label}` : `试听 ${label}`}
                  title={isPlaying ? '暂停试听' : '试听'}
                  onClick={(event) => togglePreview(event, option)}
                >
                  {isPlaying ? (
                    <Pause size={12} aria-hidden="true" />
                  ) : (
                    <Play size={12} aria-hidden="true" />
                  )}
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
