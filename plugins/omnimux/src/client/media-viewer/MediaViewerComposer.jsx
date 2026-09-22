import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_FALLBACK_CATALOG,
  parseCatalogToCascade,
} from './MediaViewerComposerData.js';
import { peekComposerPrefill, subscribeComposerPrefill, takeComposerPrefill } from './composer-prefill.js';

/**
 * 图像/视频生成专用输入面板 (MediaViewerComposer)
 *
 * 1. 彻底清除死数据：Prompt 默认空，无真实素材不占位；
 * 2. 动态接通执行中枢模型目录 (/omnimux/model-catalog)；
 * 3. 按钮排布：【生成方式】 ｜ 【模型】 ｜ 【参数展示】 ──► 【直连提交】；
 * 4. 1:1 复刻画布节点三级级联与参数配置面板。
 */
export function MediaViewerComposer({
  onDirectSubmit,
  initialMode = 'image',
  disabled = false,
  refThumbnails = [],
}) {
  // 提示词输入框默认空。聊天里的提示词块点「使用提示词生成」后填入一次，不自动发送。
  const handedOff = useSyncExternalStore(subscribeComposerPrefill, peekComposerPrefill, () => null);
  const [prompt, setPrompt] = useState('');

  // 模式：默认图像生成，支持图像/视频切换；提示词块按标记切换。
  const [mode, setMode] = useState(initialMode);
  const [activePopover, setActivePopover] = useState(null); // 'opMode' | 'modelCascade' | 'params'

  useEffect(() => {
    if (!handedOff) return;
    const request = takeComposerPrefill(handedOff.token);
    if (!request) return;
    setPrompt(request.prompt);
    setMode(request.kind === 'video' ? 'video' : 'image');
    setActivePopover(null);
  }, [handedOff]);

  // 模型全量目录缓存
  const [catalogMap, setCatalogMap] = useState(() => ({
    image: parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image),
    video: parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video),
  }));

  // 异步从执行中枢动态同步最新模型目录
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

        setCatalogMap({
          image: nextImage,
          video: nextVideo,
        });
      } catch (err) {
        // 后备真实目录平滑兜底
      }
    }
    loadCatalog();
    return () => { alive = false; };
  }, []);

  const currentCascadeList = useMemo(() => {
    return catalogMap[mode] || catalogMap.image;
  }, [catalogMap, mode]);

  // 当前选中模型
  const [brand, setBrand] = useState(() => currentCascadeList[0]);
  const [model, setModel] = useState(() => currentCascadeList[0]?.models?.[0]);
  const [channel, setChannel] = useState(() => currentCascadeList[0]?.models?.[0]?.channels?.[0]);

  // 级联面板悬停预览状态
  const [hoveredBrand, setHoveredBrand] = useState(() => currentCascadeList[0]);
  const [hoveredModel, setHoveredModel] = useState(() => currentCascadeList[0]?.models?.[0]);

  // 当切换模式或目录更新时，自适应校准当前选中的模型与版本
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

  // 图像参数状态
  const [imageOpMode, setImageOpMode] = useState('文生图');
  const [imageAspect, setImageAspect] = useState('1:1');
  const [imageRes, setImageRes] = useState('1K');
  const [imageBatch, setImageBatch] = useState('1');

  // 视频参数状态
  const [videoGenMode, setVideoGenMode] = useState('全能参考');
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoRes, setVideoRes] = useState('720p');
  const [hasSound, setHasSound] = useState(true);
  const [duration, setDuration] = useState(5);

  const containerRef = useRef(null);

  // 点击外部收起浮层
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const handleTogglePopover = (name) => {
    setActivePopover((prev) => (prev === name ? null : name));
  };

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    setActivePopover(null);
    setPrompt(''); // 提交后立即清空输入框

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

    onDirectSubmit?.({
      prompt: trimmed,
      kind: mode,
      model: model?.id,
      channel: channel?.id,
      params,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="omx-mv-composer-root" ref={containerRef}>
      {/* 1. 顶部参考素材缩略图 (仅在有真实参考图时渲染，绝不使用死假图) */}
      {refThumbnails && refThumbnails.length > 0 ? (
        <div className="omx-mv-ref-row">
          {refThumbnails.map((item, idx) => (
            <div key={item.id || idx} className="omx-mv-ref-thumb" title={item.title || `参考图 ${idx + 1}`}>
              <img src={item.url} alt={item.title || '参考图'} />
              <span className="omx-mv-ref-tag">@{item.label || `Image ${idx + 1}`}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* 2. 提示词输入区域 (默认空，随心输入) */}
      <div className="omx-mv-prompt-box">
        <textarea // exempt-ui01: 专用多模态提示词输入框
          className="omx-mv-prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="随心输入画面提示词，支持回车立即直连生成…"
          rows={2}
          disabled={disabled}
        />
      </div>

      {/* 3. 底部操作工具栏 (单行流不折行：生成方式 ｜ 模型 ｜ 参数展示 ──► 发送) */}
      <div className="omx-mv-toolbar-bar">
        <div className="omx-mv-toolbar-left">
          
          {/* 按钮 1：生成方式 */}
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
              <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {activePopover === 'opMode' && (
              <div className="omx-popover-shell omx-op-mode-popover" role="menu">
                <button // exempt-ui01: 图像模式选项
                  type="button"
                  className={`omx-menu-row ${mode === 'image' ? 'is-selected' : ''}`}
                  onClick={() => { setMode('image'); setActivePopover(null); }}
                >
                  <span>图像生成 (Image)</span>
                </button>
                <button // exempt-ui01: 视频模式选项
                  type="button"
                  className={`omx-menu-row ${mode === 'video' ? 'is-selected' : ''}`}
                  onClick={() => { setMode('video'); setActivePopover(null); }}
                >
                  <span>视频生成 (Video)</span>
                </button>
              </div>
            )}
          </div>

          {/* 按钮 2：模型 (1:1 动态级联模型选择) */}
          <div className="omx-popover-anchor">
            <button // exempt-ui01: 模型级联选择触发器
              id="modelCascadeTriggerBtn"
              type="button"
              className={`omx-capsule-trigger ${activePopover === 'modelCascade' ? 'is-active' : ''}`}
              onClick={() => handleTogglePopover('modelCascade')}
              title="选择模型与版本"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="6" y1="20" x2="6" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="18" y1="20" x2="18" y2="14" />
              </svg>
              <span className="omx-model-name-display">{model?.name || '选择模型'}</span>
              {channel?.name ? <span className="omx-channel-name-display">{channel.name}</span> : null}
              <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 三列级联面板：品牌 ➔ 型号 ➔ 版本渠道 */}
            {activePopover === 'modelCascade' && (
              <div className="omx-popover-shell omx-cascade-panel" role="dialog" aria-label="模型级联选择">
                {/* 第一列：品牌 */}
                <div className="omx-cascade-col omx-col-brand">
                  {currentCascadeList.map((b) => (
                    <button // exempt-ui01: 品牌磁贴按钮
                      key={b.brandId}
                      type="button"
                      className={`omx-brand-tile ${hoveredBrand?.brandId === b.brandId ? 'is-active' : ''}`}
                      onMouseEnter={() => { setHoveredBrand(b); setHoveredModel(b.models[0]); }}
                      onClick={() => { setBrand(b); setModel(b.models[0]); setChannel(b.models[0]?.channels?.[0]); }}
                    >
                      <span className="omx-brand-name">{b.brandName}</span>
                      {brand?.brandId === b.brandId && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-state-success, #10b981)" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>

                {/* 第二列：型号 */}
                <div className="omx-cascade-col omx-col-model">
                  {(hoveredBrand?.models || []).map((m) => (
                    <button // exempt-ui01: 型号卡片按钮
                      key={m.id}
                      type="button"
                      className={`omx-model-card-tile ${hoveredModel?.id === m.id ? 'is-active' : ''}`}
                      onMouseEnter={() => setHoveredModel(m)}
                      onClick={() => {
                        setBrand(hoveredBrand);
                        setModel(m);
                        setChannel(m.channels?.[0]);
                      }}
                    >
                      <div className="omx-model-card-head">
                        <span>{m.name}</span>
                        {model?.id === m.id && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-state-success, #10b981)" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="omx-model-card-desc">{m.desc}</div>
                    </button>
                  ))}
                </div>

                {/* 第三列：版本渠道 */}
                <div className="omx-cascade-col omx-col-version">
                  <div className="omx-version-title">选择版本</div>
                  {(hoveredModel?.channels || []).map((c) => (
                    <div
                      key={c.id}
                      className={`omx-version-row ${channel?.id === c.id ? 'is-active' : ''}`}
                      onClick={() => {
                        setBrand(hoveredBrand);
                        setModel(hoveredModel);
                        setChannel(c);
                        setActivePopover(null);
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
                      {channel?.id === c.id && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-label-primary)" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 细长竖线分隔符 */}
          <div className="omx-capsule-divider" />

          {/* 按钮 3：参数展示 (自适应图像与视频模态) */}
          <div className="omx-popover-anchor">
            <button // exempt-ui01: 参数面板触发器
              id="paramSummaryTriggerBtn"
              type="button"
              className={`omx-capsule-trigger ${activePopover === 'params' ? 'is-active' : ''}`}
              onClick={() => handleTogglePopover('params')}
              title="配置模型参数"
            >
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
              <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 参数配置浮层：图像 vs 视频专属配置 */}
            {activePopover === 'params' && (
              <div className="omx-popover-shell omx-params-panel" role="dialog" aria-label="模型参数配置">
                {mode === 'image' ? (
                  <>
                    {/* 图像生成方式 */}
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

                    {/* 图像比例 (网格卡片) */}
                    <div className="omx-param-group">
                      <div className="omx-param-title">比例</div>
                      <div className="omx-ratio-grid">
                        {[
                          { r: '1:1', cls: 'ratio-1-1' },
                          { r: '16:9', cls: 'ratio-16-9' },
                          { r: '9:16', cls: 'ratio-9-16' },
                          { r: '4:3', cls: 'ratio-4-3' },
                          { r: '3:4', cls: 'ratio-3-4' },
                          { r: '21:9', cls: 'ratio-21-9' },
                        ].map((item) => (
                          <div
                            key={item.r}
                            className={`omx-ratio-card ${imageAspect === item.r ? 'is-active' : ''}`}
                            onClick={() => setImageAspect(item.r)}
                          >
                            <span className={`omx-ratio-wire ${item.cls}`} />
                            <span className="omx-ratio-label">{item.r}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 图像画质与张数 */}
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
                        <div className="omx-param-title">生成张数</div>
                        <div className="omx-mode-track">
                          {['1', '2', '4'].map((cnt) => (
                            <button // exempt-ui01: 生成张数按钮
                              key={cnt}
                              type="button"
                              className={`omx-mode-pill ${imageBatch === cnt ? 'is-active' : ''}`}
                              onClick={() => setImageBatch(cnt)}
                            >
                              {cnt} 张
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 视频生成模式 */}
                    <div className="omx-param-group">
                      <div className="omx-param-title">生成模式</div>
                      <div className="omx-mode-track">
                        {['文生视频', '首帧', '首尾帧', '全能参考'].map((m) => (
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

                    {/* 视频比例 */}
                    <div className="omx-param-group">
                      <div className="omx-param-title">比例</div>
                      <div className="omx-ratio-grid">
                        {[
                          { r: '16:9', cls: 'ratio-16-9' },
                          { r: '9:16', cls: 'ratio-9-16' },
                          { r: '1:1', cls: 'ratio-1-1' },
                          { r: '4:3', cls: 'ratio-4-3' },
                          { r: '3:4', cls: 'ratio-3-4' },
                          { r: '21:9', cls: 'ratio-21-9' },
                          { r: '自适应', cls: 'ratio-auto' },
                        ].map((item) => (
                          <div
                            key={item.r}
                            className={`omx-ratio-card ${videoAspect === item.r ? 'is-active' : ''}`}
                            onClick={() => setVideoAspect(item.r)}
                          >
                            <span className={`omx-ratio-wire ${item.cls}`} />
                            <span className="omx-ratio-label">{item.r}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 视频清晰度与有声 */}
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
                        <div className="omx-param-title">有声</div>
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

                    {/* 视频时长滑块 */}
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
        </div>

        {/* 右侧：纯黑白 Ink CTA 主发送按钮 */}
        <div className="omx-mv-toolbar-right">
          <button // exempt-ui01: 纯黑白主发送按钮
            type="button"
            className="omx-send-cta-btn"
            onClick={handleSend}
            disabled={disabled || !prompt.trim()}
            title="立即直连生成 (Enter)"
            aria-label="立即直连生成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaViewerComposer;
