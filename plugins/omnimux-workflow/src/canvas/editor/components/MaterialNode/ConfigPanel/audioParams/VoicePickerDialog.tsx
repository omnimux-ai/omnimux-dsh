/**
 * VoicePickerDialog — 音色选择弹窗（Issue #735 / T04；Issue #771 试听接入）。
 *
 * 结构（基于现网 CustomModal；Issue #3058 UI polish 附录：
 *   min(480px, calc(100vw-48px)) / ≤70vh / 15vh 顶部锚定 / 16px 圆角）：
 *   Header  标题「选择音色」+ X 关闭（CustomModal 内建）
 *   Search  「搜索音色...」即时模糊搜索（中文名 / 拼音全拼 / 首字母 /
 *           voice_type / 场景 / 标签，逻辑见 voicePickerModel）
 *   Filters 语言 / 口音 / 性别 / 场景 四维紧凑下拉，选项由 meta 动态聚合，
 *           AND 关系，空值即「全部」
 *   List    热门置顶（hot_order 1–10 → 热门标签 → 目录原序）；行内 ▶ 试听
 *           Issue #3058：原生 Audio 对象按序消费 hub 下发的 meta.preview
 *           候选（primary 置顶，前端不拼 URL），仅 verified-file 行渲染播放键；
 *           每个 attempt 独立 Audio element（error 无 URL 身份，旧 attempt
 *           迟到 error/rejection 由 attempt 令牌短路，不误算新候选）；
 *           单例播放（同时只有一个音色发声），播放中切 ⏸ 可停止；
 *           全部候选失败兜底 Toast「试听暂不可用，请稍后重试。」，
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
  isOfficialVoicePreviewPlayable,
  resolveVoiceLabel,
  voicePreviewCandidates,
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
  /** 当前正在播放试听的 voice_type；无播放为 null */
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  /** 当前有效 attempt 的 Audio 实例：同一时刻弹窗内只有一个音色发声 */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 当前请求创建的全部 attempt element：停止/切换/卸载时逐一清理。 */
  const elementsRef = useRef<Set<HTMLAudioElement>>(new Set());
  /**
   * 试听请求令牌：每次开始/停止试听递增。旧请求的 error/play rejection 回调
   * 携带过期令牌，落在此判定上被丢弃——绝不覆盖新试听的状态或重复 Toast。
   */
  const requestTokenRef = useRef(0);

  /** 立即停止并清理当前试听的所有 attempt 实例，重置播放状态；同时使在途回调令牌全部作废 */
  const stopPlayback = (): void => {
    requestTokenRef.current += 1;
    for (const audio of elementsRef.current) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
      audio.src = '';
    }
    elementsRef.current.clear();
    audioRef.current = null;
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
    option: VoiceCatalogOption,
  ): void => {
    event.stopPropagation();
    const voiceType = option.value;
    if (playingVoice === voiceType) {
      // 当前音色正在播放 → 停止并归零（非断点续播语义）
      stopPlayback();
      return;
    }
    // 正在播放其他音色 → 先停掉再播当前
    stopPlayback();

    // Issue #3058：候选项只读 hub preview DTO，前端不拼 URL、不猜别名。
    // 播放资格门放在 seam 本身：未验证行没有播放键，但点击路径之外的
    // 任何调用方/陈旧路径也不许对未验证音色发起候选探测。
    if (!isOfficialVoicePreviewPlayable(option)) return;
    const candidateUrls = voicePreviewCandidates(option);
    if (candidateUrls.length === 0) return;

    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;
    /** 本请求创建的全部 attempt element：停止/切换/卸载逐一清理。 */
    const attemptElements = new Set<HTMLAudioElement>();
    elementsRef.current = attemptElements;
    /** attempt 下标 → 对应 element：穷尽清理时定位到失败的 element。 */
    const attemptAudios: HTMLAudioElement[] = [];
    /** 本请求内已结算过失败的候选下标：onerror 与 play().catch 同一候选只推进一次 */
    const settledCandidates = new Set<number>();
    /** 最新发起（仍在结算中）的候选下标 */
    let armedAttempt = -1;

    /** 旧请求回调一律拒绝处理 */
    const isCurrent = (): boolean => requestToken === requestTokenRef.current;
    /**
     * 回调仍归属当前有效 attempt 的判据：旧 attempt（或旧请求）迟到的
     * error/rejection 先经此短路，绝不结算或清理新 attempt。
     */
    const isCurrentAttempt = (attemptIndex: number): boolean =>
      isCurrent() && attemptIndex === armedAttempt && !settledCandidates.has(attemptIndex);

    /**
     * OCR closure F3：请求终态（ended / 穷尽失败 / NotAllowedError）释放
     * 该请求全部 attempt element——pause、归零、摘监听、清 src、清集合。
     * 早先失败的 attempt 不再滞留 elementsRef；清理发生在当前请求的闭包里，
     * 请求令牌守卫不变：新请求的 attemptElements 是另一个集合，旧请求的
     * 清理触不到新试听的 element。
     */
    const releaseRequestElements = (): void => {
      for (const attempt of attemptElements) {
        attempt.pause();
        attempt.currentTime = 0;
        attempt.onended = null;
        attempt.onerror = null;
        attempt.src = '';
      }
      attemptElements.clear();
      if (elementsRef.current === attemptElements) elementsRef.current.clear();
    };

    /**
     * 当前 attempt 结束试听：释放本请求全部 attempt element（含已回退的
     * 旧 element）再回空闲，不留仍在播放或挂起回调的孤儿 element；
     * ref 丢失判断前先比对自己的 element。
     */
    const clearPlayback = (audio: HTMLAudioElement): void => {
      releaseRequestElements();
      if (audioRef.current === audio) audioRef.current = null;
      setPlayingVoice(null);
    };

    const reportFailure = (audio: HTMLAudioElement): void => {
      if (!isCurrent()) return;
      clearPlayback(audio);
      toast.info('试听暂不可用，请稍后重试。');
    };

    /**
     * 每次 attempt 使用独立原生 Audio element 并闭包自己的下标：
     * error 事件不携带 URL 身份，复用同一 element 换 src 时旧候选的迟到
     * error 会被误算到新候选（Sol 规格轴 HIGH #1）；独立 element 让 error
     * 天然只能来自自己的那次 attempt，加上 attempt 令牌双重短路。
     */
    const playCandidate = (attemptIndex: number): void => {
      const audio = new Audio();
      audio.src = candidateUrls[attemptIndex]!;
      attemptElements.add(audio);
      attemptAudios[attemptIndex] = audio;
      armedAttempt = attemptIndex;
      audioRef.current = audio;
      audio.onended = () => {
        if (!isCurrentAttempt(attemptIndex)) return;
        settledCandidates.add(attemptIndex);
        clearPlayback(audio);
      };
      audio.onerror = () => {
        // 该候选 URL 加载失败（如 404），自动降级尝试下一候选，穷尽后才提示
        candidateFailed(attemptIndex);
      };
      void audio.play().catch((error: unknown) => {
        if (!isCurrentAttempt(attemptIndex)) return;
        if ((error as { name?: string } | null)?.name === 'NotAllowedError') {
          // 自动播放策略拒绝 ≠ 文件不存在：不轮换候选，如实提示一次。
          settledCandidates.add(attemptIndex);
          reportFailure(audio);
          return;
        }
        candidateFailed(attemptIndex);
      });
    };

    const tryNextOrReportError = (index: number): void => {
      if (!isCurrent()) return;
      const nextIndex = armedAttempt + 1;
      if (nextIndex < candidateUrls.length) {
        playCandidate(nextIndex);
        return;
      }
      const audio = attemptAudios[index];
      if (audio) reportFailure(audio);
    };

    /** 当前候选已失败且仅此一次结算：onerror 与 play rejection 不双推进 */
    const candidateFailed = (index: number): void => {
      if (!isCurrentAttempt(index)) return;
      settledCandidates.add(index);
      tryNextOrReportError(index);
    };

    setPlayingVoice(voiceType);
    playCandidate(0);
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

  // Issue #3058（PM copy fix）：菜单首项 label 逐字「全部」，触发器经
  // CustomSelect.triggerLabel 维持维度名，不新增组件。
  const dimensionOptions = (
    dimensionLabel: string,
    values: ReadonlyArray<string>,
  ): Array<{ value: string; label: string; triggerLabel?: string }> => [
    { value: '', label: '全部', triggerLabel: dimensionLabel },
    ...values.map((item) => ({ value: item, label: item })),
  ];
  const genderOptions = [
    { value: '', label: '全部', triggerLabel: '性别' },
    ...facets.genders.map((key) => ({ value: key, label: VOICE_GENDER_LABELS[key] ?? key })),
  ];

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      title="选择音色"
      width="min(480px, calc(100vw - 48px))"
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
        <Search size={16} aria-hidden="true" />
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
            const isPlaying = playingVoice === option.value;
            // Issue #3058：仅 hub 已验证 preview 才渲染播放键；未验证行保留选择但无死键。
            const canPreview = isOfficialVoicePreviewPlayable(option);
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
                  // Issue #3058 Sol 复核：只处理落在行本体（currentTarget）的按键。
                  // 事件从子元素（试听 button）冒泡时交给原生处理——否则行的
                  // preventDefault 会吞掉 button Enter→click / Space→keyup 的
                  // 原生激活，且 onSelect 误选音色（试听不得改变当前生成音色）。
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelect(option.value);
                }}
              >
                {canPreview ? (
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
                ) : null}
                <span className="wf-voice-picker__row-main">
                  <span className="wf-voice-picker__row-name">{label}</span>
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
