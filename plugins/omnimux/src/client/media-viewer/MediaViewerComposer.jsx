import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_CASCADE_MODELS } from './MediaViewerComposerData.js';

export { DEFAULT_CASCADE_MODELS };

/**
 * 图像/视频生成专用输入面板 (MediaViewerComposer)
 *
 * 遵循架构定夺：独立重写控制逻辑，100% 复用原生 UI 质感与尺寸规范。
 * 按钮排列严格遵循最高指令：【生成方式】 ｜ 【模型】 ｜ 【参数展示】 ──► 【直连提交】
 */
export function MediaViewerComposer({
  onDirectSubmit,
  initialMode = 'video',
  disabled = false,
}) {
  const [prompt, setPrompt] = useState(
    'Place both characters together in one scene, standing side by side and looking at the sky. Wide shot Add a soft light leak from the sky onto their bodies. Use @Image 3 as background. Cinematic.'
  );

  // 状态管理
  const [mode, setMode] = useState(initialMode); // 'image' | 'video'
  const [activePopover, setActivePopover] = useState(null); // 'opMode' | 'modelCascade' | 'params'

  // 模型选中状态 (初始 Seedance 2.0 旗舰版，对齐截图一)
  const [brand, setBrand] = useState(DEFAULT_CASCADE_MODELS[0]);
  const [model, setModel] = useState(DEFAULT_CASCADE_MODELS[0].models[0]);
  const [channel, setChannel] = useState(DEFAULT_CASCADE_MODELS[0].models[0].channels[0]);

  // 级联悬停预览状态
  const [hoveredBrand, setHoveredBrand] = useState(DEFAULT_CASCADE_MODELS[0]);
  const [hoveredModel, setHoveredModel] = useState(DEFAULT_CASCADE_MODELS[0].models[0]);

  // 参数配置状态 (初始对齐截图三)
  const [genMode, setGenMode] = useState('全能参考'); // '文生视频' | '首帧' | '首尾帧' | '全能参考'
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('720p');
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
    onDirectSubmit?.({
      prompt: trimmed,
      kind: mode,
      model: model.id,
      channel: channel?.id,
      params: {
        aspectRatio,
        resolution,
        hasSound,
        duration: mode === 'video' ? duration : undefined,
        genMode,
      },
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
      {/* 1. 顶部参考素材缩略图 */}
      <div className="omx-mv-ref-row">
        <div className="omx-mv-ref-thumb" title="主角 1 参考图">
          <img
            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80"
            alt="主角 1"
          />
          <span className="omx-mv-ref-tag">@Image 1</span>
        </div>
        <div className="omx-mv-ref-thumb" title="主角 2 参考图">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80"
            alt="主角 2"
          />
          <span className="omx-mv-ref-tag">@Image 2</span>
        </div>
        <div className="omx-mv-ref-thumb" title="背景环境参考图">
          <img
            src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&auto=format&fit=crop&q=80"
            alt="背景 3"
          />
          <span className="omx-mv-ref-tag">@Image 3</span>
        </div>
      </div>

      {/* 2. 提示词输入区域 */}
      <div className="omx-mv-prompt-box">
        <textarea // exempt-ui01: 专用多模态提示词输入框
          className="omx-mv-prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入画面描述、分镜提示词或使用 @ 引用参考素材…"
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>{mode === 'video' ? '视频生成' : '图像生成'}</span>
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

          {/* 按钮 2：模型 (1:1 复刻截图一：Seedance 2.0 旗舰版) */}
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
              <span className="omx-model-name-display">{model.name}</span>
              <span className="omx-channel-name-display">{channel?.name}</span>
              <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 截图二：1:1 像素级三列级联模型面板 (品牌 ➔ 型号 ➔ 选择版本) */}
            {activePopover === 'modelCascade' && (
              <div className="omx-popover-shell omx-cascade-panel" role="dialog" aria-label="模型级联选择">
                {/* 第一列：品牌 */}
                <div className="omx-cascade-col omx-col-brand">
                  {DEFAULT_CASCADE_MODELS.map((b) => (
                    <button // exempt-ui01: 品牌磁贴按钮
                      key={b.brandId}
                      type="button"
                      className={`omx-brand-tile ${hoveredBrand.brandId === b.brandId ? 'is-active' : ''}`}
                      onMouseEnter={() => { setHoveredBrand(b); setHoveredModel(b.models[0]); }}
                      onClick={() => { setBrand(b); setModel(b.models[0]); setChannel(b.models[0].channels[0]); }}
                    >
                      <span className="omx-brand-name">{b.brandName}</span>
                      {brand.brandId === b.brandId && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-state-success, #10b981)" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>

                {/* 第二列：型号 */}
                <div className="omx-cascade-col omx-col-model">
                  {(hoveredBrand.models || []).map((m) => (
                    <button // exempt-ui01: 型号卡片按钮
                      key={m.id}
                      type="button"
                      className={`omx-model-card-tile ${hoveredModel.id === m.id ? 'is-active' : ''}`}
                      onMouseEnter={() => setHoveredModel(m)}
                      onClick={() => {
                        setBrand(hoveredBrand);
                        setModel(m);
                        setChannel(m.channels[0]);
                      }}
                    >
                      <div className="omx-model-card-head">
                        <span>{m.name}</span>
                        {model.id === m.id && (
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
                  {(hoveredModel.channels || []).map((c) => (
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

          {/* 按钮 3：参数展示 (1:1 复刻截图一：全能参考 · 比例框 · 720P · 时钟图标 5s) */}
          <div className="omx-popover-anchor">
            <button // exempt-ui01: 参数面板触发器
              id="paramSummaryTriggerBtn"
              type="button"
              className={`omx-capsule-trigger ${activePopover === 'params' ? 'is-active' : ''}`}
              onClick={() => handleTogglePopover('params')}
              title="配置模型参数"
            >
              <span>{genMode}</span>
              <span className="omx-dot">·</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="12" rx="2" />
              </svg>
              <span className="omx-dot">·</span>
              <span>{resolution.toUpperCase()}</span>
              <span className="omx-dot">·</span>
              <span className="omx-param-duration-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{duration}s</span>
              </span>
              <svg className="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 截图三：1:1 像素级模型参数配置面板 */}
            {activePopover === 'params' && (
              <div className="omx-popover-shell omx-params-panel" role="dialog" aria-label="模型参数配置">
                {/* 1. 生成模式 */}
                <div className="omx-param-group">
                  <div className="omx-param-title">生成模式</div>
                  <div className="omx-mode-track">
                    {['文生视频', '首帧', '首尾帧', '全能参考'].map((m) => (
                      <button // exempt-ui01: 生成模式切换分段按钮
                        key={m}
                        type="button"
                        className={`omx-mode-pill ${genMode === m ? 'is-active' : ''}`}
                        onClick={() => setGenMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 比例 (7 列网格卡片) */}
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
                        className={`omx-ratio-card ${aspectRatio === item.r ? 'is-active' : ''}`}
                        onClick={() => setAspectRatio(item.r)}
                      >
                        <span className={`omx-ratio-wire ${item.cls}`} />
                        <span className="omx-ratio-label">{item.r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. 清晰度与有声 */}
                <div className="omx-clarity-sound-row">
                  <div className="omx-param-subcol omx-subcol-clarity">
                    <div className="omx-param-title">清晰度</div>
                    <div className="omx-mode-track">
                      {['480p', '720p', '1080p', '4k'].map((res) => (
                        <button // exempt-ui01: 清晰度切换按钮
                          key={res}
                          type="button"
                          className={`omx-mode-pill ${resolution === res ? 'is-active' : ''}`}
                          onClick={() => setResolution(res)}
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

                {/* 4. 时长滑块 (4s - 15s) */}
                <div className="omx-param-group">
                  <div className="omx-duration-header">
                    <span className="omx-param-title">时长</span>
                    <span className="omx-duration-val-text">{duration}s</span>
                  </div>
                  <input // exempt-ui01: 时长原生滑块控件
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
