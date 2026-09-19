const STYLE_ID = 'omnimux-device-styles'

export function injectDeviceStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    /* ==========================================================================
       OmniMux Device UI 生产级样式规范
       1. 黑色：100% DSH 原生纯粹曜石黑底与中性纯灰黑卡片
       2. 紫色：品牌极光紫（官方品牌 Token），唯一替代原系统蓝色（焦点微光、高亮胶囊）
       3. 按钮：纯白底黑字 Ink CTA，严禁高饱和彩色通胀
       4. 控件几何：基准高度 32px，圆角 8px，卡片圆角 12px
       ========================================================================== */

    .omnimux-device-stage {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background-color: var(--dsw-alias-bg-base, #111113);
      background-image: radial-gradient(var(--dsw-static-white-38, rgba(255, 255, 255, 0.05)) 1px, transparent 1px);
      background-size: 20px 20px;
      color: var(--dsw-alias-label-primary, #ffffff);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 13px;
    }

    /* 顶部全局连接状态条 (Banner) */
    .omx-global-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 24px;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      font-size: 12px;
      flex-shrink: 0;
    }
    .omx-banner-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .omx-banner-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--dsw-alias-state-warn-primary);
      box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 50%, transparent);
      flex-shrink: 0;
    }
    .omx-banner-text {
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
    }
    .omx-banner-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* 顶部导航选项卡栏 (32px 基准，单行流) */
    .omx-stage-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      background: var(--dsw-alias-bg-base, #111113);
      flex-shrink: 0;
      flex-wrap: nowrap;
    }

    .omx-stage-tab-btn {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 120ms ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      box-sizing: border-box;
    }
    .omx-stage-tab-btn:hover {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-stage-tab-btn.active {
      background: var(--dsw-alias-bg-layer-2, #212124);
      color: var(--dsw-alias-label-primary, #ffffff);
      font-weight: 600;
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
    }

    .omx-stage-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    /* 标准 32px 控件按钮体系 */
    .omx-btn-ink {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      background: var(--dsw-alias-label-primary, #ffffff);
      color: var(--dsw-alias-bg-base, #111113);
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
      white-space: nowrap;
    }
    .omx-btn-ink:hover {
      background: var(--dsw-static-white-38, rgba(255, 255, 255, 0.90));
      transform: translateY(-1px);
    }
    .omx-btn-ink:active { transform: scale(0.96); }

    .omx-btn-subtle {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      color: var(--dsw-alias-label-primary, #ffffff);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
      white-space: nowrap;
    }
    .omx-btn-subtle:hover {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.22));
    }
    .omx-btn-subtle:active { transform: scale(0.96); }

    .omx-btn-sm {
      height: 26px;
      padding: 0 10px;
      font-size: 12px;
      border-radius: 6px;
    }

    /* 品牌极光紫标识徽章 */
    .omx-badge-violet {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
      color: var(--dsw-alias-brand-primary);
      border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent);
    }

    /* 真机网格：卡片即手机，竖屏真机比例 */
    .omx-phone-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 18px;
    }

    .omx-phone-card {
      cursor: pointer;
      transition: transform 150ms ease;
    }
    .omx-phone-card:hover { transform: translateY(-2px); }
    .omx-phone-card:hover .omx-phone-frame { border-color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45)); }

    /* 钛金属外壳 */
    .omx-phone-frame {
      aspect-ratio: 9 / 19.5;
      border-radius: 24px;
      background: linear-gradient(160deg, var(--dsw-alias-bg-layer-2, #212124) 0%, var(--dsw-alias-bg-base, #111113) 55%, var(--dsw-alias-bg-layer-1, #18181b) 100%);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      padding: 5px;
      box-sizing: border-box;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 20px rgba(0, 0, 0, 0.45); /* exempt-ui03: 真机钛边框高光与整机投影特化 */
      transition: border-color 150ms ease;
    }

    /* 纯黑屏幕（顶部灵动岛 + 状态栏 + 内容 + Home 指示条） */
    .omx-phone-screen {
      position: relative;
      height: 100%;
      border-radius: 19px;
      overflow: hidden;
      background: linear-gradient(180deg, var(--dsw-alias-bg-base, #111113) 0%, #000000 38%, #000000 100%); /* exempt-ui03: 物理真机纯黑息屏质感特化 */
      border: 1px solid rgba(0, 0, 0, 0.9); /* exempt-ui03: 屏幕内凹收边特化 */
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    .omx-phone-island {
      position: absolute;
      top: 7px;
      left: 50%;
      transform: translateX(-50%);
      width: 34%;
      height: 12px;
      border-radius: 999px;
      background: var(--dsw-alias-bg-base, #111113);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
    }
    .omx-phone-statusbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px 0;
      font-size: 10px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-phone-battery { display: flex; align-items: center; gap: 3px; }
    .omx-phone-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 8px;
    }
    .omx-phone-account {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-phone-state {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .omx-phone-state.ready { color: var(--dsw-alias-status-success); background: color-mix(in srgb, var(--dsw-alias-status-success) 12%, transparent); }
    .omx-phone-state.warm { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); }
    .omx-phone-state.error { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
    .omx-phone-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 0 14px 8px;
    }
    .omx-phone-port {
      align-self: flex-start;
      font-size: 9px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
    }
    .omx-phone-home {
      width: 36%;
      height: 3px;
      border-radius: 999px;
      background: var(--dsw-static-white-38, rgba(255, 255, 255, 0.35));
    }

    /* 机下图注：状态点 + 编号/机型 + 代理延迟 */
    .omx-phone-caption {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 8px;
      font-size: 11px;
      flex-wrap: nowrap;
    }
    .omx-phone-caption strong { font-size: 12px; color: var(--dsw-alias-label-primary, #ffffff); white-space: nowrap; }
    .omx-phone-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
    .omx-phone-dot.ready { background: var(--dsw-alias-status-success); }
    .omx-phone-dot.warm { background: var(--dsw-alias-state-warn-primary); }
    .omx-phone-dot.error { background: var(--dsw-alias-state-error-primary); }
    .omx-phone-model {
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      font-family: var(--font-mono, monospace);
      font-size: 10px;
      white-space: nowrap;
    }
    .omx-phone-proxy {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 3px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      font-size: 10px;
      min-width: 0;
    }
    .omx-phone-proxy span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 通用区块容器 (Card Container) */
    .omx-section-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .omx-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 12px;
    }
    .omx-section-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
      margin: 0;
    }
    .omx-section-desc {
      font-size: 12px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      margin-top: 4px;
    }

    /* 排期视图：日历 / 列表切换 */
    .omx-schedule-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .omx-view-toggle {
      display: inline-flex;
      background: var(--dsw-alias-bg-layer-2, #212124);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 8px;
      padding: 2px;
    }
    .omx-view-toggle-btn {
      height: 28px;
      padding: 0 12px;
      border: none;
      background: transparent;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 120ms ease;
    }
    .omx-view-toggle-btn.active {
      background: var(--dsw-alias-bg-elevated, #1c1c1f);
      color: var(--dsw-alias-label-primary, #ffffff);
      font-weight: 600;
    }

    /* 排期周日历 (7 列网格) */
    .omx-week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 8px;
      overflow: hidden;
      background: var(--dsw-alias-bg-base, #111113);
    }
    .omx-day-col {
      border-right: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      min-height: 280px;
      display: flex;
      flex-direction: column;
    }
    .omx-day-col:last-child {
      border-right: none;
    }
    .omx-day-head {
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      background: var(--dsw-alias-bg-layer-2, #212124);
      font-size: 11px;
      font-weight: 600;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
    }
    .omx-day-add-btn {
      background: transparent;
      border: none;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .omx-day-add-btn:hover {
      color: var(--dsw-alias-label-primary, #ffffff);
      background: var(--dsw-alias-bg-layer-1, #18181b);
    }
    .omx-day-body {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .omx-schedule-card {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
    }
    .omx-schedule-card-time {
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      font-size: 10px;
      margin-bottom: 2px;
    }
    .omx-schedule-card-acc {
      color: var(--dsw-alias-label-primary, #ffffff);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 4px;
    }
    .omx-schedule-card-tag {
      font-size: 10px;
      color: var(--dsw-alias-status-success);
    }

    /* 排期新建表单 (内联卡片) */
    .omx-inline-form {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .omx-form-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .omx-form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 140px;
    }
    .omx-form-label {
      font-size: 11px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
    }

    /* 素材页工具条 */
    .omx-content-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .omx-search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      max-width: 320px;
    }
    .omx-content-stats {
      font-size: 12px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
    }

    /* 通用空状态卡片 (Empty State) */
    .omx-empty-box {
      padding: 48px 24px;
      text-align: center;
      border: 1px dashed var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 12px;
      background: var(--dsw-alias-bg-base, #111113);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .omx-empty-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
      margin: 0;
    }
    .omx-empty-desc {
      font-size: 13px;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
      max-width: 440px;
      line-height: 1.5;
      margin: 0;
    }

    /* 审计与列表表格 */
    .omx-data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .omx-data-table th {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      font-weight: 500;
    }
    .omx-data-table td {
      padding: 12px;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      color: var(--dsw-alias-label-primary, #ffffff);
    }

    /* 极光紫输入框焦点态 */
    .omx-input {
      height: 32px;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      border-radius: 8px;
      color: var(--dsw-alias-label-primary, #ffffff);
      padding: 0 12px;
      font-size: 13px;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
      box-sizing: border-box;
      width: 100%;
    }
    .omx-input:focus {
      border-color: var(--dsw-alias-brand-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent);
    }

    /* 居中大弹窗系统 (Modal Dialog) */
    .omx-modal-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.70); /* exempt-ui03: 居中弹层全局遮罩暗化特化 */
      backdrop-filter: blur(8px);
      z-index: 300;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
    }
    .omx-modal-mask.active {
      display: flex;
    }
    .omx-modal-dialog {
      background: var(--dsw-alias-bg-elevated, #1c1c1f);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      border-radius: 16px;
      width: min(680px, 100%);
      max-height: 88vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); /* exempt-ui03: 弹窗环境光投影特化 */
    }
    .omx-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
    }
    .omx-modal-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
      margin: 0;
    }
    .omx-modal-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .omx-modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border-radius: 0 0 16px 16px;
    }

    /* 接入向导步进器 (Steps) */
    .omx-steps-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .omx-step-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .omx-step-card.active {
      border-color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
    }
    .omx-step-num {
      font-size: 11px;
      font-weight: 700;
      color: var(--dsw-alias-brand-primary);
    }
    .omx-step-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
    }

    /* 签名方案双选卡片 */
    .omx-options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .omx-option-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 10px;
      padding: 14px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: all 120ms ease;
    }
    .omx-option-card:hover {
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.22));
    }
    .omx-option-card.active {
      border-color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
    }
    .omx-option-badge {
      align-self: flex-start;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--dsw-alias-status-success);
      color: var(--dsw-alias-bg-base, #111113);
    }
    .omx-option-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-option-desc {
      font-size: 11px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      line-height: 1.4;
    }

    /* 接入准备清单 (Checklist) */
    .omx-checklist {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .omx-checklist-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 12px;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
    }

    /* AI 权限白名单双栏卡片 */
    .omx-whitelist-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .omx-whitelist-col {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .omx-whitelist-col.allowed {
      border-left: 3px solid var(--dsw-alias-status-success);
    }
    .omx-whitelist-col.forbidden {
      border-left: 3px solid var(--dsw-alias-state-error-primary);
    }
    .omx-whitelist-head {
      font-size: 13px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
      margin-bottom: 4px;
    }
    .omx-whitelist-item {
      font-size: 11px;
      line-height: 1.5;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
      display: flex;
      gap: 6px;
    }

    /* 养号策略卡片网格 */
    .omx-warmup-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 12px;
      margin-bottom: 16px;
    }
    .omx-warmup-card {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      padding: 14px;
      border-radius: 8px;
    }
    .omx-warmup-label {
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      font-size: 11px;
    }
    .omx-warmup-value {
      font-size: 15px;
      font-weight: 700;
      color: var(--dsw-alias-label-primary, #ffffff);
      margin-top: 4px;
    }

    /* 侧边抽屉 */
    .omx-drawer-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65); /* exempt-ui03: 抽屉全局遮罩暗化特化 */
      backdrop-filter: blur(6px);
      z-index: 200;
      display: none;
      justify-content: flex-end;
    }
    .omx-drawer-mask.active { display: flex; }

    .omx-drawer-panel {
      width: 460px;
      height: 100%;
      background: var(--dsw-alias-bg-elevated, #1c1c1f);
      border-left: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-sizing: border-box;
      animation: slideDrawer 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .omx-drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .omx-drawer-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-drawer-meta {
      font-size: 10px;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      margin-top: 2px;
    }
    .omx-drawer-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .omx-drawer-success-line {
      font-size: 11px;
      color: var(--dsw-alias-status-success);
    }
    .omx-drawer-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
      margin-bottom: 6px;
    }
    .omx-drawer-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07));
      font-size: 11px;
      color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.70));
    }
    .omx-drawer-row:last-child {
      border-bottom: none;
    }
    .omx-drawer-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    /* 悬浮 Toast */
    .omx-toast-float {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--dsw-alias-bg-elevated, #1c1c1f);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      color: var(--dsw-alias-label-primary, #ffffff);
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); /* exempt-ui03: 浮动提示阴影 */
    }

    @keyframes slideDrawer {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
  `
  document.head.appendChild(style)
}
