import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FALLBACK_CATALOG,
  parseCatalogToCascade,
} from './MediaViewerComposerData.js';

/**
 * 媒体生成配置控件（模型级联 + 参数面板）**唯一真源**。
 *
 * 原实现整体内联在 `MediaViewerComposer.jsx` 里，只服务媒体面板。输入框下方的
 * 快捷方式也需要同一套「模型 / 参数」配置，因此把可复用的部分抽到这里，
 * 由两处共同消费：媒体面板（保持原有行为与 DOM 不变）与输入框快捷方式。
 *
 * 抽共享时**不新建第二套参数 UI、也不新建第二套模型选择逻辑**：
 * 级联数据仍取自 `/omnimux/model-catalog`，回落仍是 `DEFAULT_FALLBACK_CATALOG`，
 * 类名仍是 `.omx-capsule-trigger` / `.omx-popover-shell` / `.omx-cascade-panel` /
 * `.omx-params-panel`，样式仍来自 `media-viewer/styles.js`。
 */

/** 「生成方式」按钮支持的档位（快捷方式里这两条明确是视频，因此可只留视频）。 */
export const MEDIA_MODES = Object.freeze(['image', 'video']);

/**
 * 媒体生成配置状态机：模式、级联目录、当前模型/版本、图像与视频参数。
 *
 * @param {{ initialMode?: 'image' | 'video' }} [options]
 * @returns {object} 配置状态与 setter，供 `MediaConfigControls` 与提交方共同读取
 */
export function useMediaGenerationConfig({ initialMode = 'image' } = {}) {
  const [mode, setMode] = useState(MEDIA_MODES.includes(initialMode) ? initialMode : 'image');
  // 外部改配置（聊天提示词块一键填入并切模式）时，展开的浮层会挡住新值。
  // 用递增计数当「关浮层」信号，浮层状态仍留在面板内部，不提到调用方。
  const [popoverEpoch, setPopoverEpoch] = useState(0);
  const closePopovers = useCallback(() => setPopoverEpoch((n) => n + 1), []);

  const [catalogMap, setCatalogMap] = useState(() => ({
    image: parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image),
    video: parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video),
  }));

  useEffect(() => {
    let alive = true;
    async function loadCatalog() {
      try {
        const resp = await fetch('/omnimux/model-catalog');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!alive || !data || typeof data !== 'object') return;

        const nextImage = Array.isArray(data.image) && data.image.length > 0
          ? parseCatalogToCascade(data.image)
          : parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image);

        const nextVideo = Array.isArray(data.video) && data.video.length > 0
          ? parseCatalogToCascade(data.video)
          : parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video);

        setCatalogMap({ image: nextImage, video: nextVideo });
      } catch {
        // 后备真实目录平滑兜底
      }
    }
    loadCatalog();
    return () => { alive = false; };
  }, []);

  const currentCascadeList = useMemo(() => catalogMap[mode] || catalogMap.image, [catalogMap, mode]);

  const [brand, setBrand] = useState(() => currentCascadeList[0]);
  const [model, setModel] = useState(() => currentCascadeList[0]?.models?.[0]);
  const [channel, setChannel] = useState(() => currentCascadeList[0]?.models?.[0]?.channels?.[0]);
  const [hoveredBrand, setHoveredBrand] = useState(() => currentCascadeList[0]);
  const [hoveredModel, setHoveredModel] = useState(() => currentCascadeList[0]?.models?.[0]);

  useEffect(() => {
    const defaultBrand = currentCascadeList[0];
    const defaultModel = defaultBrand?.models?.[0];
    const defaultChannel = defaultModel?.channels?.[0];
    setBrand(defaultBrand);
    setModel(defaultModel);
    setChannel(defaultChannel);
    setHoveredBrand(defaultBrand);
    setHoveredModel(defaultModel);
  }, [currentCascadeList]);

  // 图像参数
  const [imageOpMode, setImageOpMode] = useState('文生图');
  const [imageAspect, setImageAspect] = useState('1:1');
  const [imageRes, setImageRes] = useState('1K');
  const [imageBatch, setImageBatch] = useState('1');

  // 视频参数
  const [videoGenMode, setVideoGenMode] = useState('文生视频');
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoRes, setVideoRes] = useState('720p');
  const [hasSound, setHasSound] = useState(true);
  const [duration, setDuration] = useState(5);

  const params = mode === 'image'
    ? {
        aspectRatio: imageAspect,
        resolution: imageRes,
        batch: imageBatch,
        operation: imageOpMode,
      }
    : {
        aspectRatio: videoAspect,
        resolution: videoRes,
        hasSound,
        duration,
        genMode: videoGenMode,
      };

  return {
    mode, setMode,
    popoverEpoch, closePopovers,
    catalogMap,
    currentCascadeList,
    brand, setBrand,
    model, setModel,
    channel, setChannel,
    hoveredBrand, setHoveredBrand,
    hoveredModel, setHoveredModel,
    imageOpMode, setImageOpMode,
    imageAspect, setImageAspect,
    imageRes, setImageRes,
    imageBatch, setImageBatch,
    videoGenMode, setVideoGenMode,
    videoAspect, setVideoAspect,
    videoRes, setVideoRes,
    hasSound, setHasSound,
    duration, setDuration,
    params,
  };
}

const ChevronIcon = () => (
  <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
    <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = ({ size = 14, stroke = 'var(--dsw-alias-state-success, #10b981)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** 模型级联触发器 + 三列级联面板（品牌 → 型号 → 版本渠道）。 */
export function MediaModelCascade({ config, open, onToggle, onPicked }) {
  const {
    currentCascadeList, brand, setBrand, model, setModel, channel, setChannel,
    hoveredBrand, setHoveredBrand, hoveredModel, setHoveredModel,
  } = config;

  const pickChannel = useCallback((targetBrand, targetModel, targetChannel) => {
    setBrand(targetBrand);
    setModel(targetModel);
    setChannel(targetChannel);
    if (typeof onPicked === 'function') {
      onPicked({ brand: targetBrand || null, model: targetModel || null, channel: targetChannel || null });
    }
  }, [onPicked, setBrand, setChannel, setModel]);

  return (
    <div className="omx-popover-anchor">
      <button // exempt-ui01: 模型级联选择触发器
        id="modelCascadeTriggerBtn"
        type="button"
        className={`omx-capsule-trigger ${open ? 'is-active' : ''}`}
        onClick={onToggle}
        title={`${model?.name || '选择模型'}${channel?.name ? ` · ${channel.name}` : ''}`}
        aria-label={`模型：${model?.name || '选择模型'}${channel?.name ? ` · ${channel.name}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="6" y1="20" x2="6" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="18" y1="20" x2="18" y2="14" />
        </svg>
        <span className="omx-model-name-display">{model?.name || '选择模型'}</span>
        {channel?.name ? <span className="omx-channel-name-display">{channel.name}</span> : null}
        <ChevronIcon />
      </button>

      {open && (
        <div className="omx-popover-shell omx-cascade-panel" role="dialog" aria-label="模型级联选择">
          <div className="omx-cascade-col omx-col-brand">
            {currentCascadeList.map((b) => (
              <button // exempt-ui01: 品牌磁贴按钮
                key={b.brandId}
                type="button"
                className={`omx-brand-tile ${hoveredBrand?.brandId === b.brandId ? 'is-active' : ''}`}
                onMouseEnter={() => { setHoveredBrand(b); setHoveredModel(b.models[0]); }}
                onFocus={() => { setHoveredBrand(b); setHoveredModel(b.models[0]); }}
                onClick={() => pickChannel(b, b.models[0], b.models[0]?.channels?.[0])}
              >
                <span className="omx-brand-name">{b.brandName}</span>
                {brand?.brandId === b.brandId && <CheckIcon />}
              </button>
            ))}
          </div>

          <div className="omx-cascade-col omx-col-model">
            {(hoveredBrand?.models || []).map((m) => (
              <button // exempt-ui01: 型号卡片按钮
                key={m.id}
                type="button"
                className={`omx-model-card-tile ${hoveredModel?.id === m.id ? 'is-active' : ''}`}
                onMouseEnter={() => setHoveredModel(m)}
                onFocus={() => setHoveredModel(m)}
                onClick={() => pickChannel(hoveredBrand, m, m.channels?.[0])}
              >
                <div className="omx-model-card-head">
                  <span>{m.name}</span>
                  {model?.id === m.id && <CheckIcon />}
                </div>
                <div className="omx-model-card-desc">{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="omx-cascade-col omx-col-version">
            <div className="omx-version-title">选择版本</div>
            {(hoveredModel?.channels || []).map((c) => (
              <button // exempt-ui01: 模型版本选择按钮
                type="button"
                aria-pressed={channel?.id === c.id}
                key={c.id}
                className={`omx-version-row ${channel?.id === c.id ? 'is-active' : ''}`}
                onClick={() => {
                  pickChannel(hoveredBrand, hoveredModel, c);
                  onToggle();
                }}
              >
                <div className="omx-version-info">
                  <span className="omx-version-name">{c.name}</span>
                  <span className="omx-version-pts">{c.price}</span>
                  {c.ratio && <span className="omx-version-badge">{c.ratio}</span>}
                  {c.discount && <span className="omx-version-badge">{c.discount}</span>}
                  <span className="omx-version-tag">{c.tag}</span>
                  <span className="omx-version-tag">{c.billing}</span>
                </div>
                {channel?.id === c.id && <CheckIcon size={15} stroke="var(--dsw-alias-label-primary)" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 参数触发器 + 参数面板（生成模式 / 比例 / 清晰度 / 有声 / 时长 / 张数）。 */
export function MediaParamsPanel({ config, open, onToggle }) {
  const { mode } = config;
  const {
    imageOpMode, setImageOpMode, imageAspect, setImageAspect, imageRes, setImageRes, imageBatch, setImageBatch,
  } = config;
  const {
    videoGenMode, setVideoGenMode, videoAspect, setVideoAspect, videoRes, setVideoRes,
    hasSound, setHasSound, duration, setDuration,
  } = config;

  const parameterSummary = mode === 'image'
    ? `${imageOpMode} · ${imageAspect} · ${imageRes} · ${imageBatch}张`
    : `${videoGenMode} · ${videoAspect} · ${videoRes} · ${hasSound ? '有声' : '无声'} · ${duration}s`;
  const parameterLabel = `配置模型参数：${parameterSummary}`;

  const IMAGE_RATIOS = [
    { r: '1:1', cls: 'ratio-1-1' },
    { r: '16:9', cls: 'ratio-16-9' },
    { r: '9:16', cls: 'ratio-9-16' },
    { r: '4:3', cls: 'ratio-4-3' },
    { r: '3:4', cls: 'ratio-3-4' },
    { r: '21:9', cls: 'ratio-21-9' },
  ];
  const VIDEO_RATIOS = [
    { r: '16:9', cls: 'ratio-16-9' },
    { r: '9:16', cls: 'ratio-9-16' },
    { r: '1:1', cls: 'ratio-1-1' },
    { r: '4:3', cls: 'ratio-4-3' },
    { r: '3:4', cls: 'ratio-3-4' },
    { r: '21:9', cls: 'ratio-21-9' },
    { r: '自适应', cls: 'ratio-auto' },
  ];

  return (
    <div className="omx-popover-anchor">
      <button // exempt-ui01: 参数面板触发器
        id="paramSummaryTriggerBtn"
        type="button"
        className={`omx-capsule-trigger ${open ? 'is-active' : ''}`}
        onClick={onToggle}
        title={parameterLabel}
        aria-label={parameterLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="omx-param-compact-label" aria-hidden="true">参数</span>
        {mode === 'image' ? (
          <>
            <span>{imageAspect}</span>
            <span className="omx-dot">·</span>
            <span>{imageRes}</span>
            <span className="omx-dot">·</span>
            <span>{imageBatch}张</span>
          </>
        ) : (
          <>
            <span>{videoGenMode}</span>
            <span className="omx-dot">·</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="6" width="18" height="12" rx="2" />
            </svg>
            <span className="omx-dot">·</span>
            <span>{videoRes.toUpperCase()}</span>
            <span className="omx-dot">·</span>
            <span className="omx-param-duration-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{duration}s</span>
            </span>
          </>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div className="omx-popover-shell omx-params-panel" role="dialog" aria-label="模型参数配置">
          {mode === 'image' ? (
            <>
              <div className="omx-param-group">
                <div className="omx-param-title">生成方式</div>
                <div className="omx-mode-track">
                  {['文生图', '图生图', '多图参考'].map((op) => (
                    <button // exempt-ui01: 图像生成方式按钮
                      key={op}
                      type="button"
                      className={`omx-mode-pill ${imageOpMode === op ? 'is-active' : ''}`}
                      onClick={() => setImageOpMode(op)}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              <div className="omx-param-group">
                <div className="omx-param-title">比例</div>
                <div className="omx-ratio-grid">
                  {IMAGE_RATIOS.map((item) => (
                    <button // exempt-ui01: 图像比例选择按钮
                      type="button"
                      aria-pressed={imageAspect === item.r}
                      key={item.r}
                      className={`omx-ratio-card ${imageAspect === item.r ? 'is-active' : ''}`}
                      onClick={() => setImageAspect(item.r)}
                    >
                      <span className="omx-ratio-wire-box">
                        <span className={`omx-ratio-wire ${item.cls}`} />
                      </span>
                      <span className="omx-ratio-label">{item.r}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="omx-clarity-sound-row">
                <div className="omx-param-subcol omx-subcol-clarity">
                  <div className="omx-param-title">清晰度</div>
                  <div className="omx-mode-track">
                    {['1K', '2K', '4K'].map((res) => (
                      <button // exempt-ui01: 图像清晰度按钮
                        key={res}
                        type="button"
                        className={`omx-mode-pill ${imageRes === res ? 'is-active' : ''}`}
                        onClick={() => setImageRes(res)}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="omx-param-subcol omx-subcol-sound">
                  <div className="omx-param-title">张数</div>
                  <div className="omx-mode-track">
                    {['1', '2', '4'].map((cnt) => (
                      <button // exempt-ui01: 生成张数按钮
                        key={cnt}
                        type="button"
                        className={`omx-mode-pill ${imageBatch === cnt ? 'is-active' : ''}`}
                        onClick={() => setImageBatch(cnt)}
                      >
                        {cnt}张
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="omx-param-group">
                <div className="omx-param-title">生成方式</div>
                <div className="omx-mode-track">
                  {['文生视频', '首帧', '首尾帧', '全能参考', '视频编辑'].map((m) => (
                    <button // exempt-ui01: 视频生成模式按钮
                      key={m}
                      type="button"
                      className={`omx-mode-pill ${videoGenMode === m ? 'is-active' : ''}`}
                      onClick={() => setVideoGenMode(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="omx-param-group">
                <div className="omx-param-title">比例</div>
                <div className="omx-ratio-grid">
                  {VIDEO_RATIOS.map((item) => (
                    <button // exempt-ui01: 视频比例选择按钮
                      type="button"
                      aria-pressed={videoAspect === item.r}
                      key={item.r}
                      className={`omx-ratio-card ${videoAspect === item.r ? 'is-active' : ''}`}
                      onClick={() => setVideoAspect(item.r)}
                    >
                      <span className="omx-ratio-wire-box">
                        <span className={`omx-ratio-wire ${item.cls}`} />
                      </span>
                      <span className="omx-ratio-label">{item.r}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="omx-clarity-sound-row">
                <div className="omx-param-subcol omx-subcol-clarity">
                  <div className="omx-param-title">清晰度</div>
                  <div className="omx-mode-track">
                    {['480p', '720p', '1080p', '4k'].map((res) => (
                      <button // exempt-ui01: 视频清晰度按钮
                        key={res}
                        type="button"
                        className={`omx-mode-pill ${videoRes === res ? 'is-active' : ''}`}
                        onClick={() => setVideoRes(res)}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="omx-param-subcol omx-subcol-sound">
                  <div className="omx-param-title">声音</div>
                  <div className="omx-mode-track">
                    <button // exempt-ui01: 有声开启按钮
                      type="button"
                      className={`omx-mode-pill ${hasSound ? 'is-active' : ''}`}
                      onClick={() => setHasSound(true)}
                    >
                      <span className="omx-inline-flex-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                        <span>有声</span>
                      </span>
                    </button>
                    <button // exempt-ui01: 无声开启按钮
                      type="button"
                      className={`omx-mode-pill ${!hasSound ? 'is-active' : ''}`}
                      onClick={() => setHasSound(false)}
                    >
                      <span className="omx-inline-flex-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                        <span>无声</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="omx-param-group">
                <div className="omx-duration-header">
                  <span className="omx-param-title">时长</span>
                  <span className="omx-duration-val-text">{duration}s</span>
                </div>
                <input // exempt-ui01: 视频时长原生滑块
                  type="range"
                  min="4"
                  max="15"
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="omx-duration-range-input"
                />
                <div className="omx-duration-limits">
                  <span>4s</span>
                  <span>15s</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 模型与参数两个按钮的合成控件：单行流不折行（模型 ｜ 参数）。
 *
 * 生成方式（图像/视频）默认不渲染：输入框下方的两条快捷方式明确是视频，
 * 显示一个必然为「视频生成」的切换器只会增加噪声；媒体面板仍按原样显示它。
 *
 * 模型回执（`.omx-media-config-summary`）默认**不渲染**：媒体面板原本没有这个节点，
 * 抽共享时不得给它新增可见节点；只有输入框下方的快捷方式消费方显式要它。
 *
 * @param {{
 *   config: object,
 *   showModeSwitch?: boolean,
 *   showModelSummary?: boolean,
 *   compact?: boolean, // 输入框使用可滚动、自适应参数布局；默认面板不启用
 *   onModelChange?: (selection: object) => void,
 * }} props
 */
export function MediaConfigControls({ config, showModeSwitch = true, showModelSummary = false, compact = false, onModelChange }) {
  const [activePopover, setActivePopover] = useState(null);
  const containerRef = useRef(null);

  // 调用方（媒体面板的一键填入）切换模式时同步收起浮层，浮层状态仍由本组件独占。
  const popoverEpoch = config && config.popoverEpoch;
  useEffect(() => {
    if (popoverEpoch === undefined) return;
    setActivePopover(null);
  }, [popoverEpoch]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const panel = containerRef.current?.querySelector('[role="dialog"], [role="menu"]');
      if (!panel) return;
      panel.parentElement?.querySelector('button')?.focus();
      setActivePopover(null);
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleTogglePopover = (name) => {
    setActivePopover((prev) => (prev === name ? null : name));
  };

  const handleModelPicked = useCallback((selection) => {
    if (typeof onModelChange === 'function') onModelChange(selection);
  }, [onModelChange]);

  const { mode, setMode, model, channel } = config;

  return (
    <div className={`omx-media-config-controls${compact ? ' omx-media-config-controls--compact' : ''}`} ref={containerRef}>
      {showModeSwitch && (
        <div className="omx-popover-anchor">
          <button // exempt-ui01: 生成方式切换触发器
            id="opModeTriggerBtn"
            type="button"
            className={`omx-capsule-trigger ${activePopover === 'opMode' ? 'is-active' : ''}`}
            onClick={() => handleTogglePopover('opMode')}
            title="切换生成方式"
          >
            {mode === 'image' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
            <span>{mode === 'image' ? '图像生成' : '视频生成'}</span>
            <ChevronIcon />
          </button>

          {activePopover === 'opMode' && (
            <div className="omx-popover-shell omx-op-mode-popover" role="menu">
              <button // exempt-ui01: 图像模式选项
                type="button"
                className={`omx-menu-row ${mode === 'image' ? 'is-selected' : ''}`}
                onClick={() => { setMode('image'); setActivePopover(null); }}
              >
                <span>图像生成</span>
              </button>
              <button // exempt-ui01: 视频模式选项
                type="button"
                className={`omx-menu-row ${mode === 'video' ? 'is-selected' : ''}`}
                onClick={() => { setMode('video'); setActivePopover(null); }}
              >
                <span>视频生成</span>
              </button>
            </div>
          )}
        </div>
      )}

      <MediaModelCascade
        config={config}
        open={activePopover === 'modelCascade'}
        onToggle={() => handleTogglePopover('modelCascade')}
        onPicked={handleModelPicked}
      />

      <div className="omx-capsule-divider" />

      <MediaParamsPanel
        config={config}
        open={activePopover === 'params'}
        onToggle={() => handleTogglePopover('params')}
      />

      {/* 当前模型与版本在快捷方式里是对外唯一的可读回执（免去打开面板确认）；
          媒体面板不渲染它，保持抽取前的零新增节点。 */}
      {showModelSummary ? (
        <span className="omx-media-config-summary" data-omx-media-config-summary="true">
          {model?.name || '选择模型'}{channel?.name ? ` · ${channel.name}` : ''}
        </span>
      ) : null}
    </div>
  );
}

export default MediaConfigControls;
