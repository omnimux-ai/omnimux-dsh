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
      background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 20px 20px;
      color: var(--dsw-alias-label-primary, #ffffff);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 13px;
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

    /* 卡片网格 (12px 圆角与纯灰黑底) */
    .omx-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .omx-fleet-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.07));
      border-radius: 12px;
      padding: 16px;
      transition: border-color 150ms ease, transform 150ms ease;
      cursor: pointer;
    }
    .omx-fleet-card:hover {
      border-color: rgba(255, 255, 255, 0.22);
      transform: translateY(-1px);
    }

    .omx-mock-screen-box {
      height: 180px;
      background: #000000;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 12px;
      position: relative;
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
