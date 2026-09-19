const STYLE_ID = 'omnimux-device-styles'

export function injectDeviceStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .omnimux-device-stage {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--dsw-alias-bg-base, #111113);
      color: var(--dsw-alias-label-primary, #ffffff);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
    }

    .omx-stage-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      background: var(--dsw-alias-bg-primary, #16181d);
      flex-shrink: 0;
    }

    .omx-stage-tab-btn {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.72));
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .omx-stage-tab-btn:hover {
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-stage-tab-btn.active {
      background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.1));
      color: #ffffff;
      font-weight: 600;
      border-color: var(--dsw-alias-border-l2, rgba(255,255,255,0.15));
    }

    .omx-stage-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    .omx-grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .omx-card {
      background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04));
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      border-radius: 12px;
      padding: 16px;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .omx-card:hover {
      border-color: var(--dsw-alias-border-l3, rgba(255,255,255,0.25));
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
      transform: translateY(-1px);
    }

    /* 32px 控件高基准与 Ink CTA */
    .omx-btn-ink {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      background: #ffffff;
      color: #000000;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .omx-btn-ink:hover { background: #e2e8f0; }

    .omx-btn-subtle {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.05));
      color: var(--dsw-alias-label-primary, #ffffff);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .omx-btn-subtle:hover {
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.08));
      border-color: var(--dsw-alias-border-l3, rgba(255,255,255,0.25));
    }
  `
  document.head.appendChild(style)
}
