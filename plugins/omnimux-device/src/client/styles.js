const STYLE_ID = 'omnimux-device-styles'

export function injectDeviceStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    /* ==========================================================================
       OmniMux Device UI 生产级样式规范
       1. 黑色：100% DSH 原生纯粹曜石黑底 (#111113) 与中性纯灰黑卡片 (#18181b / #212124)
       2. 紫色：品牌极光紫 (#7961f2)，唯一替代原系统蓝色（焦点微光、高亮胶囊）
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
      /* 设备状态语义色（此前 JSX 引用但从未定义，补齐） */
      --omx-status-green: var(--dsw-alias-status-success, #10b981);
      --omx-status-amber: var(--dsw-alias-status-warning, #f59e0b);
      --omx-status-rose: var(--dsw-alias-state-error-primary, #f43f5e);
    }

    /* 顶部导航选项卡栏 (32px 基准，单行流) */
    .omx-stage-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.07));
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
      color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.70));
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
      color: #ffffff;
      font-weight: 600;
      border-color: var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
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
      background: #ffffff;
      color: #111113;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
    }
    .omx-btn-ink:hover {
      background: rgba(255, 255, 255, 0.90);
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
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
    }
    .omx-btn-subtle:hover {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border-color: rgba(255, 255, 255, 0.22);
    }
    .omx-btn-subtle:active { transform: scale(0.96); }

    /* 品牌极光紫标识徽章 */
    .omx-badge-violet {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(121, 97, 242, 0.12);
      color: #7961f2;
      border: 1px solid rgba(121, 97, 242, 0.25);
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
    .omx-phone-state.ready { color: var(--omx-status-green); background: color-mix(in srgb, var(--omx-status-green) 12%, transparent); }
    .omx-phone-state.warm { color: var(--omx-status-amber); background: color-mix(in srgb, var(--omx-status-amber) 12%, transparent); }
    .omx-phone-state.error { color: var(--omx-status-rose); background: color-mix(in srgb, var(--omx-status-rose) 12%, transparent); }
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
    .omx-phone-dot.ready { background: var(--omx-status-green); }
    .omx-phone-dot.warm { background: var(--omx-status-amber); }
    .omx-phone-dot.error { background: var(--omx-status-rose); }
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

    /* 极光紫输入框焦点态 */
    .omx-input {
      height: 32px;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      border-radius: 8px;
      color: #ffffff;
      padding: 0 12px;
      font-size: 13px;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
      box-sizing: border-box;
    }
    .omx-input:focus {
      border-color: #7961f2;
      box-shadow: 0 0 0 2px rgba(121, 97, 242, 0.25);
    }

    /* 弹窗与抽屉 */
    .omx-drawer-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
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
      animation: slideDrawer 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideDrawer {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
  `
  document.head.appendChild(style)
}
