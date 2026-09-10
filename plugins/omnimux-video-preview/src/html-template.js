/**
 * Generates a standalone, responsive, pixel-perfect HTML preview page
 * matching the user's video breakdown design and interaction specs.
 *
 * (Uses native HTML template string for export preview. React.createElement compat marker.)
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
  const sceneCount = shots.length || video.scene_count || 7
  const videoStreamUrl = video.stream_url || video.video_url || ''
  const coverUrl = video.cover_url || ''

  // Format shots copy text
  const copyContent = shots.map((s, idx) => {
    const range = s.time_range || `${s.start_seconds || 0}s - ${s.end_seconds || 0}s`
    const stage = s.stage ? ` [${s.stage}]` : ''
    const tags = Array.isArray(s.tags) && s.tags.length ? `\n镜头属性：${s.tags.join(' | ')}` : ''
    const desc = s.description ? `\n画面描述：${s.description}` : ''
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
      --bg-base: #0c0e12;
      --bg-surface: #14171f;
      --bg-surface-elevated: #1a1e29;
      --bg-card: #161922;
      --border-subtle: #232734;
      --border-strong: #2e3547;
      --text-primary: #f3f4f6;
      --text-secondary: #9ca3af;
      --text-muted: #6b7280;
      --accent-amber: #f59e0b;
      --accent-amber-bg: rgba(245, 158, 11, 0.12);
      --accent-amber-border: rgba(245, 158, 11, 0.28);
      --accent-blue: #3b82f6;
      --accent-blue-bg: rgba(59, 130, 246, 0.12);
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-family);
      line-height: 1.5;
      overflow-x: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      height: 52px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      flex-shrink: 0;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.2px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-btn:hover {
      background: var(--bg-surface-elevated);
      color: #fff;
    }

    /* Layout Container */
    .container {
      flex: 1;
      display: flex;
      height: calc(100vh - 52px);
      overflow: hidden;
    }

    /* Left: Video Player Panel */
    .video-panel {
      flex: 0 0 380px;
      max-width: 440px;
      min-width: 320px;
      border-right: 1px solid var(--border-subtle);
      background: #090b0e;
      display: flex;
      flex-direction: column;
      padding: 18px;
      overflow-y: auto;
    }

    .video-card {
      position: relative;
      width: 100%;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: #000;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
      aspect-ratio: 9 / 16;
      max-height: 640px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .video-element {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Overlay Info */
    .video-overlay-top {
      position: relative;
      z-index: 2;
      padding: 14px 14px;
      background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%);
    }

    .author-bar {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .author-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid rgba(255,255,255,0.8);
      background: #222;
    }

    .author-info {
      flex: 1;
    }

    .author-name {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tiktok-badge {
      display: inline-block;
      width: 14px;
      height: 14px;
    }

    .author-handle {
      font-size: 12px;
      color: rgba(255,255,255,0.75);
    }

    .video-caption-top {
      margin-top: 10px;
      font-size: 13px;
      line-height: 1.4;
      color: #fff;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }

    /* Floating Social Action Stats on the Right side of video */
    .video-stats-column {
      position: absolute;
      right: 12px;
      bottom: 70px;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }

    .stat-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    }

    .stat-pill svg {
      width: 26px;
      height: 26px;
      fill: #fff;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
    }

    /* Bottom Video Info */
    .video-overlay-bottom {
      position: relative;
      z-index: 2;
      padding: 16px 14px 12px;
      background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
    }

    .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: rgba(255,255,255,0.85);
      margin-bottom: 8px;
      background: rgba(0,0,0,0.3);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.15);
    }

    .video-progress-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: rgba(255,255,255,0.8);
      margin-top: 6px;
    }

    .play-btn-mini {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    /* Video Details Below Player */
    .video-details-section {
      margin-top: 14px;
      padding: 0 4px;
    }

    .video-details-title {
      font-size: 13px;
      color: #e2e8f0;
      line-height: 1.45;
      margin-bottom: 8px;
    }

    .video-details-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
    }

    .video-meta-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Right: Analysis Panel */
    .analysis-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
      overflow: hidden;
    }

    /* Tabs Bar */
    .tabs-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 24px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      flex-shrink: 0;
    }

    .tabs-wrapper {
      display: inline-flex;
      background: #0f1218;
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      width: 100%;
      max-width: 500px;
    }

    .tab-btn {
      flex: 1;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }

    .tab-btn.active {
      background: var(--bg-surface-elevated);
      color: #fff;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }

    /* Tab Content View */
    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px 28px 80px;
    }

    /* =================== Shots View =================== */
    .shots-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .shot-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px 18px;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .shot-card:hover {
      border-color: var(--border-strong);
      background: #191d28;
    }

    .shot-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .shot-time-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .shot-stage-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
      background: var(--accent-amber-bg);
      color: var(--accent-amber);
      border: 1px solid var(--accent-amber-border);
      letter-spacing: 0.3px;
    }

    .shot-tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .tag-pill {
      font-size: 11.5px;
      padding: 3px 10px;
      border-radius: 6px;
      background: #1f2430;
      color: #cbd5e1;
      border: 1px solid #2d3445;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .shot-description {
      font-size: 13.5px;
      line-height: 1.6;
      color: #cbd5e1;
    }

    /* Bottom Sticky Action Bar */
    .bottom-bar {
      position: absolute;
      bottom: 0;
      right: 0;
      left: 380px;
      height: 60px;
      background: rgba(18, 21, 28, 0.94);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 28px;
      z-index: 10;
    }

    .copy-shots-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid var(--border-strong);
      color: #e2e8f0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-shots-btn:hover {
      background: var(--bg-surface-elevated);
      color: #fff;
      border-color: #475569;
    }

    .copy-shots-btn.copied {
      background: #065f46;
      color: #a7f3d0;
      border-color: #059669;
    }

    /* =================== Structure View =================== */
    .structure-hint {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    .pipeline-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .pipeline-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 5px 14px;
      border-radius: 20px;
      background: var(--accent-amber-bg);
      color: var(--accent-amber);
      border: 1px solid var(--accent-amber-border);
    }

    .pipeline-arrow {
      color: var(--text-muted);
      font-size: 13px;
    }

    .structure-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .structure-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 18px 20px;
    }

    .structure-card-title {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }

    .structure-card-desc {
      font-size: 13.5px;
      line-height: 1.6;
      color: #cbd5e1;
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
        border-bottom: 1px solid var(--border-subtle);
      }
      .video-card {
        max-height: 480px;
        margin: 0 auto;
      }
      .bottom-bar {
        left: 0;
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </button>
      <button class="icon-btn" id="close-btn" title="关闭" aria-label="关闭" onclick="window.parent && window.parent.postMessage({ type: 'close-sidebar-tab' }, '*')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
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
          <div style="position: absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#555;">暂无视频流</div>
        `}

        <!-- Overlay Top -->
        <div class="video-overlay-top">
          <div class="author-bar">
            ${authorAvatar ? `<img class="author-avatar" src="${escapeHtml(authorAvatar)}" alt="Avatar" />` : `<div class="author-avatar"></div>`}
            <div class="author-info">
              <div class="author-name">
                <span>${escapeHtml(authorName)}</span>
                <svg class="tiktok-badge" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.33a6.34 6.34 0 0 0-.86-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75c1.47 1.05 3.28 1.68 5.23 1.73v-3.45a4.85 4.85 0 0 1-1.46-.34z"/></svg>
              </div>
              <div class="author-handle">${escapeHtml(authorHandle)}</div>
            </div>
          </div>
          <div class="video-caption-top">${escapeHtml(title)}</div>
        </div>

        <!-- Social Stats floating on the right -->
        <div class="video-stats-column">
          <div class="stat-pill">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>${escapeHtml(likes)}</span>
          </div>
          <div class="stat-pill">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            <span>${escapeHtml(comments)}</span>
          </div>
          <div class="stat-pill">
            <svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
            <span>${escapeHtml(shares)}</span>
          </div>
        </div>

        <!-- Overlay Bottom -->
        <div class="video-overlay-bottom">
          <div class="ai-badge">Creator labeled as AI-generated</div>
          <div class="video-progress-row">
            <span id="current-time-text">00:00</span>
            <span>/</span>
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
            <span>⏱ ${escapeHtml(durationText)}</span>
            <span>👁 ${escapeHtml(views)}</span>
            <span>${escapeHtml(String(sceneCount))}个场景</span>
          </div>
          ${video.source_url ? `
            <a href="${escapeHtml(video.source_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--text-muted);" title="打开外链">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
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
          <button class="tab-btn active" id="tab-btn-shots" onclick="switchTab('shots')">分镜</button>
          <button class="tab-btn" id="tab-btn-structure" onclick="switchTab('structure')">结构拆解</button>
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
                  ${shot.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}
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
            <span class="pipeline-badge">${escapeHtml(p)}</span>
            ${idx < pipeline.length - 1 ? `<span class="pipeline-arrow">→</span>` : ''}
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
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
        // fallback
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

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
