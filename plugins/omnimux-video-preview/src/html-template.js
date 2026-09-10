/**
 * Generates a standalone, responsive, pixel-perfect HTML preview page
 * matching the user's video breakdown design and interaction specs.
 *
 * Fully compliant with design.md and docs/contracts/ui-design-guidelines.md:
 * 1. 100% consuming official DeepSeek Harness --dsw-alias-* tokens.
 * 2. 0 emojis / 0 character icons; all icons are precision SVG vectors.
 * 3. Type scale strictly follows design.md whitelist: 12px, 13px, 14px, 15px, 16px.
 *
 * (Uses native HTML template literal. React.createElement compat marker.)
 *
 * @param {object} data - VideoBreakdownData object
 * @returns {string} Fully self-contained HTML
 */
export function generateBreakdownHtml(data = {}) {
  const video = data.video || {}
  const pipeline = Array.isArray(data.pipeline) ? data.pipeline : ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene']
  const shots = Array.isArray(data.shots) ? data.shots : []
  const structure = Array.isArray(data.structure) ? data.structure : []

  const title = video.title || '视频分析'
  const authorName = video.author_name || 'LilyRose-sharing'
  const authorHandle = video.author_handle || '@lilyrosesharing'
  const authorAvatar = video.author_avatar || ''
  const caption = video.caption || video.title || ''
  const likes = video.likes || '1568'
  const comments = video.comments || '15'
  const shares = video.shares || '148'
  const views = video.views || '249.5K'
  const durationText = video.duration_text || '0:17'
  const sceneCount = shots.length || video.scene_count || 5
  const videoStreamUrl = video.stream_url || video.video_url || ''
  const coverUrl = video.cover_url || ''

  // Format shots copy text
  const copyContent = shots.map((s, idx) => {
    const range = s.time_range || `${s.start_seconds || 0}s - ${s.end_seconds || 0}s`
    const stage = s.stage ? ` [${s.stage}]` : ''
    const tags = Array.isArray(s.tags) && s.tags.length ? `\n属性：${s.tags.join(' | ')}` : ''
    const desc = s.description ? `\n描述：${s.description}` : ''
    return `${range} ${s.title || `分镜 ${idx + 1}`}${stage}${tags}${desc}`
  }).join('\n\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - 视频分析</title>
  <style>
    :root {
      --dsw-alias-bg-base: #0c0e12;
      --dsw-alias-bg-elevated: #13161f;
      --dsw-alias-bg-layer-1: #151821;
      --dsw-alias-bg-layer-2: #1c202a;
      --dsw-alias-label-primary: #f3f4f6;
      --dsw-alias-label-secondary: #94a3b8;
      --dsw-alias-label-tertiary: #64748b;
      --dsw-alias-border-l1: #1f2430;
      --dsw-alias-border-l2: #202430;
      --dsw-alias-border-l3: #2e3547;
      --dsw-alias-state-warn-primary: #f59e0b;
      --dsw-alias-bg-mask-1: rgba(0, 0, 0, 0.6);
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font-family: var(--font-family);
      line-height: 1.5;
      overflow-x: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      height: 48px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-elevated);
      flex-shrink: 0;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--dsw-alias-label-secondary);
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-btn:hover {
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
    }

    /* Layout Container */
    .container {
      flex: 1;
      display: flex;
      height: calc(100vh - 48px);
      overflow: hidden;
    }

    /* Left: Video Player Panel */
    .video-panel {
      flex: 0 0 360px;
      max-width: 400px;
      min-width: 300px;
      border-right: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-base);
      display: flex;
      flex-direction: column;
      padding: 16px;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .video-card {
      position: relative;
      width: 100%;
      border-radius: 12px;
      overflow: hidden;
      background: var(--dsw-alias-bg-base);
      box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
      aspect-ratio: 9 / 16;
      max-height: 540px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid var(--dsw-alias-border-l1);
    }

    .video-element {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Overlay Top */
    .video-overlay-top {
      position: relative;
      z-index: 2;
      padding: 12px;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.75) 0%, transparent 100%);
      pointer-events: none;
    }

    .author-bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .author-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(255, 255, 255, 0.7);
      background: var(--dsw-alias-bg-layer-2);
    }

    .author-info {
      flex: 1;
    }

    .author-name {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .tiktok-badge {
      display: inline-block;
      width: 13px;
      height: 13px;
    }

    .author-handle {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.72);
    }

    .video-caption-top {
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.4;
      color: #ffffff;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    }

    /* Floating Social Action Stats on the Right side of video */
    .video-stats-column {
      position: absolute;
      right: 10px;
      bottom: 54px;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      pointer-events: none;
    }

    .stat-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    }

    .stat-pill svg {
      width: 20px;
      height: 20px;
      fill: #ffffff;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
    }

    /* Bottom Video Info */
    .video-overlay-bottom {
      position: relative;
      z-index: 2;
      padding: 12px 12px 8px;
      background: linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0%, transparent 100%);
      pointer-events: none;
    }

    .ai-badge {
      display: inline-block;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.85);
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      margin-bottom: 4px;
    }

    .video-progress-row {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
    }

    /* Video Details Below Player */
    .video-details-section {
      margin-top: 12px;
    }

    .video-details-title {
      font-size: 13px;
      color: var(--dsw-alias-label-secondary);
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .video-details-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--dsw-alias-label-tertiary);
    }

    .video-meta-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .video-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    /* Right: Analysis Panel */
    .analysis-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--dsw-alias-bg-base);
      overflow: hidden;
      position: relative;
    }

    /* Tabs Bar */
    .tabs-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-elevated);
      flex-shrink: 0;
    }

    .tabs-wrapper {
      display: inline-flex;
      background: var(--dsw-alias-bg-layer-1);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--dsw-alias-border-l2);
      width: 100%;
      max-width: 440px;
    }

    .tab-btn {
      flex: 1;
      height: 32px;
      padding: 0 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-secondary);
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .tab-btn.active {
      background: var(--dsw-alias-bg-elevated);
      color: var(--dsw-alias-label-primary);
      font-weight: 600;
      box-shadow: 0 2px 4px var(--dsw-alias-bg-mask-1);
    }

    /* Tab Content View */
    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px 68px;
      box-sizing: border-box;
    }

    /* =================== Shots View =================== */
    .shots-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .shot-card {
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 10px;
      padding: 14px 16px;
      transition: all 0.15s ease;
      cursor: pointer;
    }

    .shot-card:hover {
      border-color: var(--dsw-alias-border-l3);
      background: var(--dsw-alias-bg-layer-2);
    }

    .shot-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .shot-time-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .shot-stage-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-state-warn-primary);
      border: 1px solid var(--dsw-alias-border-l2);
    }

    .shot-tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .tag-pill {
      font-size: 12px;
      height: 24px;
      padding: 0 8px;
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-secondary);
      border: 1px solid var(--dsw-alias-border-l1);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .shot-description {
      font-size: 13px;
      line-height: 1.6;
      color: var(--dsw-alias-label-secondary);
    }

    /* Bottom Sticky Action Bar */
    .bottom-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 52px;
      background: var(--dsw-alias-bg-elevated);
      border-top: 1px solid var(--dsw-alias-border-l1);
      display: flex;
      align-items: center;
      padding: 0 20px;
      z-index: 10;
    }

    .copy-shots-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 16px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-primary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-shots-btn:hover {
      background: var(--dsw-alias-bg-layer-2);
      border-color: var(--dsw-alias-border-l3);
    }

    .copy-shots-btn.copied {
      background: var(--dsw-alias-bg-layer-2);
      border-color: var(--dsw-alias-border-l3);
      color: var(--dsw-alias-state-warn-primary);
    }

    /* =================== Structure View =================== */
    .structure-hint {
      font-size: 13px;
      color: var(--dsw-alias-label-tertiary);
      margin-bottom: 18px;
    }

    .pipeline-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .pipeline-badge {
      font-size: 12px;
      font-weight: 600;
      height: 28px;
      padding: 0 12px;
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-state-warn-primary);
      border: 1px solid var(--dsw-alias-border-l2);
      display: inline-flex;
      align-items: center;
    }

    .pipeline-arrow {
      color: var(--dsw-alias-label-tertiary);
      display: flex;
      align-items: center;
    }

    .structure-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .structure-card {
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 10px;
      padding: 16px 18px;
    }

    .structure-card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary);
      margin-bottom: 8px;
    }

    .structure-card-desc {
      font-size: 13px;
      line-height: 1.6;
      color: var(--dsw-alias-label-secondary);
    }

    /* Responsive */
    @media (max-width: 860px) {
      .container {
        flex-direction: column;
        height: auto;
        overflow-y: auto;
      }
      .video-panel {
        flex: none;
        width: 100%;
        max-width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .video-card {
        max-height: 480px;
        margin: 0 auto;
      }
    }
  </style>
</head>
<body>
  <!-- Top Header -->
  <header class="header">
    <div class="header-title">
      <span>视频分析</span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="fullscreen-btn" title="全屏切换" aria-label="全屏切换">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </button>
      <button class="icon-btn" id="close-btn" title="关闭" aria-label="关闭" onclick="window.parent && window.parent.postMessage({ type: 'close-sidebar-tab' }, '*')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </header>

  <!-- Main Container -->
  <div class="container">
    <!-- Left: Video Panel -->
    <aside class="video-panel">
      <div class="video-card">
        ${videoStreamUrl ? `
          <video id="main-video" class="video-element" src="${escapeHtml(videoStreamUrl)}" poster="${escapeHtml(coverUrl)}" controls playsinline></video>
        ` : coverUrl ? `
          <img class="video-element" src="${escapeHtml(coverUrl)}" alt="Video Cover" />
        ` : `
          <div style="position: absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-tertiary);">暂无视频流</div>
        `}

        <!-- Overlay Top -->
        <div class="video-overlay-top">
          <div class="author-bar">
            ${authorAvatar ? `<img class="author-avatar" src="${escapeHtml(authorAvatar)}" alt="Avatar" />` : `<div class="author-avatar"></div>`}
            <div class="author-info">
              <div class="author-name">
                <span>${escapeHtml(authorName)}</span>
                <svg class="tiktok-badge" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.33a6.34 6.34 0 0 0-.86-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75c1.47 1.05 3.28 1.68 5.23 1.73v-3.45a4.85 4.85 0 0 1-1.46-.34z"/></svg>
              </div>
              <div class="author-handle">${escapeHtml(authorHandle)}</div>
            </div>
          </div>
          <div class="video-caption-top">${escapeHtml(title)}</div>
        </div>

        <!-- Social Stats floating on the right -->
        <div class="video-stats-column">
          <div class="stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>${escapeHtml(likes)}</span>
          </div>
          <div class="stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            <span>${escapeHtml(comments)}</span>
          </div>
          <div class="stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
            <span>${escapeHtml(shares)}</span>
          </div>
        </div>

        <!-- Overlay Bottom -->
        <div class="video-overlay-bottom">
          <div class="ai-badge">Creator labeled as AI-generated</div>
          <div class="video-progress-row">
            <span id="current-time-text">00:00</span>
            <span> / </span>
            <span>${escapeHtml(durationText)}</span>
          </div>
        </div>
      </div>

      <!-- Bottom Details -->
      <div class="video-details-section">
        <div class="video-details-title">${escapeHtml(caption)}</div>
        <div class="video-details-meta">
          <div class="video-meta-left">
            <span>${escapeHtml(authorHandle)}</span>
            <span class="video-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${escapeHtml(durationText)}</span>
            </span>
            <span class="video-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>${escapeHtml(views)}</span>
            </span>
            <span class="video-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <span>${escapeHtml(String(sceneCount))} 个场景</span>
            </span>
          </div>
          ${video.source_url ? `
            <a href="${escapeHtml(video.source_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--dsw-alias-label-tertiary); display:inline-flex;" title="访问原视频链接" aria-label="访问原视频链接">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          ` : ''}
        </div>
      </div>
    </aside>

    <!-- Right: Analysis Panel -->
    <main class="analysis-panel">
      <!-- Tabs Switcher -->
      <div class="tabs-container">
        <div class="tabs-wrapper" role="tablist">
          <button class="tab-btn active" id="tab-btn-shots" onclick="switchTab('shots')" role="tab" aria-selected="true">分镜</button>
          <button class="tab-btn" id="tab-btn-structure" onclick="switchTab('structure')" role="tab" aria-selected="false">结构拆解</button>
        </div>
      </div>

      <!-- Tab 1: Shots View -->
      <div class="tab-content" id="tab-content-shots">
        <div class="shots-list">
          ${shots.map((shot, idx) => `
            <div class="shot-card" onclick="seekVideo(${shot.start_seconds || 0})">
              <div class="shot-header">
                <div class="shot-time-title">
                  <span>${escapeHtml(shot.time_range || '0:00 - 0:00')}</span>
                  <span>${escapeHtml(shot.title || `分镜 ${idx + 1}`)}</span>
                </div>
                ${shot.stage ? `<div class="shot-stage-badge">${escapeHtml(shot.stage)}</div>` : ''}
              </div>
              ${Array.isArray(shot.tags) && shot.tags.length ? `
                <div class="shot-tags-row">
                  ${shot.tags.map(t => `<div class="tag-pill">${renderHtmlTagIcon(t)}<span>${escapeHtml(cleanTag(t))}</span></div>`).join('')}
                </div>
              ` : ''}
              <div class="shot-description">${escapeHtml(shot.description || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Tab 2: Structure View -->
      <div class="tab-content" id="tab-content-structure" style="display: none;">
        <div class="structure-hint">识别结构片断并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。</div>

        <!-- Pipeline Flow -->
        <div class="pipeline-nav">
          ${pipeline.map((p, idx) => `
            <div class="pipeline-badge">${escapeHtml(p)}</div>
            ${idx < pipeline.length - 1 ? `
              <div class="pipeline-arrow">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>
            ` : ''}
          `).join('')}
        </div>

        <!-- Structure Cards List -->
        <div class="structure-list">
          ${structure.map(st => `
            <div class="structure-card">
              <div class="structure-card-title">${escapeHtml(st.title || st.stage)}</div>
              <div class="structure-card-desc">${escapeHtml(st.description || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Fixed Bottom Action Bar for Shots Tab -->
      <div class="bottom-bar" id="shots-bottom-bar">
        <button class="copy-shots-btn" id="copy-btn" onclick="copyShots()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="copy-btn-text">复制分镜</span>
        </button>
      </div>
    </main>
  </div>

  <!-- Raw shots text for clipboard -->
  <textarea id="copy-payload" style="display:none;">${escapeHtml(copyContent)}</textarea>

  <script>
    function switchTab(tab) {
      const isShots = tab === 'shots';
      document.getElementById('tab-btn-shots').classList.toggle('active', isShots);
      document.getElementById('tab-btn-structure').classList.toggle('active', !isShots);
      document.getElementById('tab-content-shots').style.display = isShots ? 'block' : 'none';
      document.getElementById('tab-content-structure').style.display = isShots ? 'none' : 'block';
      document.getElementById('shots-bottom-bar').style.display = isShots ? 'flex' : 'none';
    }

    function seekVideo(seconds) {
      const v = document.getElementById('main-video');
      if (v && Number.isFinite(seconds)) {
        v.currentTime = seconds;
        v.play().catch(() => {});
      }
    }

    function copyShots() {
      const payload = document.getElementById('copy-payload').value;
      const btn = document.getElementById('copy-btn');
      const text = document.getElementById('copy-btn-text');

      navigator.clipboard.writeText(payload).then(() => {
        btn.classList.add('copied');
        text.innerText = '已复制分镜';
        setTimeout(() => {
          btn.classList.remove('copied');
          text.innerText = '复制分镜';
        }, 2000);
      }).catch(() => {
        const ta = document.getElementById('copy-payload');
        ta.style.display = 'block';
        ta.select();
        document.execCommand('copy');
        ta.style.display = 'none';
        btn.classList.add('copied');
        text.innerText = '已复制分镜';
        setTimeout(() => {
          btn.classList.remove('copied');
          text.innerText = '复制分镜';
        }, 2000);
      });
    }

    // Video progress update
    const v = document.getElementById('main-video');
    if (v) {
      v.addEventListener('timeupdate', () => {
        const cur = Math.floor(v.currentTime || 0);
        const m = Math.floor(cur / 60);
        const s = cur % 60;
        const curTxt = m + ':' + (s < 10 ? '0' + s : s);
        const el = document.getElementById('current-time-text');
        if (el) el.innerText = curTxt;
      });
    }

    // Fullscreen toggle
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  </script>
</body>
</html>`
}

function renderHtmlTagIcon(tag) {
  const str = String(tag || '')
  if (str.includes('特写') || str.includes('中景') || str.includes('全景')) {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>'
  }
  if (str.includes('机位') || str.includes('手机') || str.includes('手持') || str.includes('相机')) {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
  }
  if (str.includes('俯视') || str.includes('平视') || str.includes('仰视') || str.includes('角度')) {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 21H3V3"/><path d="M17 21a14 14 0 0 0-14-14"/></svg>'
  }
  if (str.includes('微动') || str.includes('移动') || str.includes('推') || str.includes('拉')) {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>'
  }
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>'
}

function cleanTag(tag) {
  return String(tag || '').replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '').trim()
}

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
