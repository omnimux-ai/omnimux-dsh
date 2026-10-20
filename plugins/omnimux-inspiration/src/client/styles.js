/**
 * Dark theme styles for OmniMux inspiration tab (x.ai Minimalist Hairline Architecture)
 * Fully compliant with docs/contracts/design-tokens.md + Stage standards
 */
export const INSPIRATION_STYLES_ID = 'omnimux-inspiration-styles'

export const INSPIRATION_CSS = `
/* 全站一级页骨架契约类（Issue 1977 · 契约 §二·补）：整页唯一滚动区 + 导航栈到顶吸附，声明与其它插件逐字一致 */
.omx-stage-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--dsw-alias-bg-base, var(--dsw-bg, #111215));
}
.omx-stage-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.omnimux-inspiration-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: auto;
}
.omnimux-inspiration-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-inspiration-stage-body {
  flex: 1 0 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* 根容器与微光扫光关键帧 */
.omnimux-inspiration-root,
.omnimux-inspiration-root *,
.omnimux-inspiration-modal-backdrop,
.omnimux-inspiration-modal-backdrop * {
  box-sizing: border-box;
}

.omnimux-inspiration-root {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  padding: 0 20px 24px;
  gap: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font-family: inherit;
}

/* Layer 2: Action Row */
.omnimux-inspiration-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
}

@keyframes omni-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 顶部导航与操作栏 */
.omnimux-inspiration-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #222222);
}

.omnimux-inspiration-tabs {
  display: inline-flex;
  background: var(--dsw-alias-bg-module-platform, #141414);
  padding: 3px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
}

.omnimux-inspiration-tab {
  height: 28px;
  padding: 0 14px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #888888);
  font: 500 13px/16px inherit;
  cursor: pointer;
  transition: color 120ms ease,
              background 120ms ease;
}

.omnimux-inspiration-tab:hover {
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
}

.omnimux-inspiration-tab.active {
  background: var(--dsw-alias-bg-layer-1, #242424);
  color: var(--dsw-alias-label-primary, #ffffff);
  box-shadow: 0 1px 3px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.4));
}

/* 极简发丝线工具栏 */
.omnimux-inspiration-toolbar {
  width: 100%;
  max-width: 100%;
  padding: 0;
}

/* 账号监控的三件控件（账号筛选 / 平台筛选 / 搜索框）必须同处一行：
   账号筛选的下拉面板以触发器为定位基准，右侧控件一旦折行就会把面板挤到错位。
   仅作用于该 Tab —— 该 Tab 不渲染次行细筛，行内空间充足。 */
.omnimux-inspiration-stage .omnimux-inspiration-toolbar [class*="tools"] {
  flex-wrap: nowrap;
}

/* 工具栏与它的三个内容层放开裁切。
   宿主工具栏默认声明了 overflow: hidden（用于裁掉超出行高的内容），代价是把账号筛选
   的下拉面板整块截断 —— 面板不是工具栏的一部分，它是浮层。这里逐层放开，浮层
   才能溢出工具栏边界完整显示。 */
.omnimux-inspiration-toolbar,
.omnimux-inspiration-toolbar [class*="bar"],
.omnimux-inspiration-toolbar [class*="tools"],
.omnimux-inspiration-toolbar [class*="right"] {
  overflow: visible !important;
}

.omnimux-inspiration-search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 360px;
}

.omnimux-inspiration-search-icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
  display: flex;
  align-items: center;
  justify-content: center;
}

.omnimux-inspiration-search {
  width: 100%;
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 9999px;
  padding: 0 14px 0 34px;
  color: var(--dsw-alias-label-primary, #ffffff);
  font: 400 13px/18px inherit;
  outline: none;
  transition: border-color 120ms ease,
              background-color 120ms ease;
}
.omnimux-inspiration-search:focus {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}

.omnimux-inspiration-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.omnimux-inspiration-select {
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 9999px;
  padding: 0 12px;
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
  font: 500 12px/16px inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 120ms ease,
              background-color 120ms ease;
}
.omnimux-inspiration-select:hover {
  border-color: var(--dsw-alias-border-l4, #3d3d3d);
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}
.omnimux-inspiration-select:focus {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
}

/* 紧凑型筛选器下拉按钮 (缩短宽度) */
.omnimux-inspiration-filter-select .dshUk-DropdownSelect-trigger,
.omnimux-inspiration-filter-select > button {
  min-width: 74px !important;
  width: auto;
  border-radius: 999px;
  padding: 0 10px;
  gap: 6px;
}
.omnimux-inspiration-filter-select .dshUk-DropdownSelect-label {
  font-size: 13px;
}

/* 二级复合筛选行 */
.omnimux-inspiration-subfilter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0 12px 0;
  width: 100%;
}

/* 二级筛选行吸附在一级工具栏正下方（骨架契约 §二·补）；偏移取工具栏实测高度。 */
.omnimux-inspiration-subfilter-sticky {
  top: var(--stage-sticky-offset, 44px);
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger,
.omnimux-inspiration-subfilter-select > button {
  min-width: 90px !important;
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 999px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #ffffff);
  transition: all 120ms ease;
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger:hover,
.omnimux-inspiration-subfilter-select > button:hover {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-label {
  font-size: 13px;
}

/* 9:16 原子化扫光骨架屏矩阵 */
.omnimux-inspiration-skeleton {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 100%;
}
@media (min-width: 1600px) {
  .omnimux-inspiration-skeleton {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 18px;
  }
}
@media (max-width: 1100px) {
  .omnimux-inspiration-skeleton {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
}
@media (max-width: 840px) {
  .omnimux-inspiration-skeleton {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
}
@media (max-width: 640px) {
  .omnimux-inspiration-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
.omnimux-inspiration-skel {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #222222);
  overflow: hidden;
}
.omnimux-inspiration-skel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.04)) 50%, transparent 100%);
  animation: omni-shimmer 1.4s infinite;
}

/* 共享账号监控瀑布流，保留灵感库自己的层叠边界。 */
.omnimux-inspiration-grid {
  isolation: isolate;
  z-index: 1;
  animation: omni-fade-in 160ms ease;
}

/* 批量多选操作栏 */
.omnimux-inspiration-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding: 8px 14px;
  background: var(--dsw-alias-bg-layer-1, #181818);
  border: 1px solid var(--dsw-alias-border-l4, #333333);
  border-radius: 12px;
  animation: omni-fade-in 140ms ease;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4));
}
.omnimux-inspiration-selection-count {
  font: 500 13px/18px inherit;
  color: var(--dsw-alias-label-primary, #ffffff);
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-inspiration-selection-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.omnimux-inspiration-btn-ghost {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8e8e8e);
  cursor: pointer;
  font: 500 13px/18px inherit;
  padding: 4px 10px;
  border-radius: 9999px;
  transition: color 120ms ease;
}
.omnimux-inspiration-btn-ghost:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.06));
}
.omnimux-inspiration-btn-danger {
  border: none;
  background: var(--dsw-alias-state-error-primary, #ef4444);
  color: var(--dsw-alias-label-primary, #ffffff);
  border-radius: 9999px;
  padding: 5px 14px;
  cursor: pointer;
  font: 600 13px/18px inherit;
  transition: all 120ms ease;
}
.omnimux-inspiration-btn-danger:hover {
  background: var(--dsw-alias-state-error-primary, #dc2626);
  transform: translateY(-1px);
}

.omnimux-inspiration-card-pure {
  /* 卡片自身宽度即容器查询基准：CTA 按卡片宽度退化，不随视口列数走 */
  container-type: inline-size;
  container-name: inspiration-card;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  transition: transform 180ms cubic-bezier(.2,.4,.6,1),
              border-color 180ms cubic-bezier(.2,.4,.6,1),
              box-shadow 180ms ease;
}
.omnimux-inspiration-card-pure[aria-selected="true"] {
  border-color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.7));
  box-shadow: 0 0 0 1px var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.7)), 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
}
.omnimux-inspiration-card-pure:hover {
  border-color: var(--dsw-alias-border-l4, #4a4a4a);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}
/* 刚导入落地的卡片：高亮一段时间，让用户立刻看到导入结果 */
.omnimux-inspiration-card-pure.is-landed {
  border-color: var(--dsw-alias-brand-primary, #4c8dff);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary, #4c8dff), 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}

/* 卡片左上角复选框 Checkbox */
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:hover,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:active {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  border-radius: 6px;
  border: 1.5px solid var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  color: var(--dsw-alias-bg-base, #000000);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 120ms ease,
              transform 120ms ease,
              background-color 120ms ease,
              border-color 120ms ease;
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure:hover .omnimux-inspiration-card-check,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure:focus-within .omnimux-inspiration-card-check,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"],
.omnimux-inspiration-stage .omnimux-inspiration-grid.selecting .omnimux-inspiration-card-check {
  opacity: 1;
  transform: scale(1);
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"] {
  background: var(--dsw-alias-label-primary, #ffffff);
  border-color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:hover {
  border-color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.85));
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.7));
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"]:hover {
  background: var(--dsw-alias-button-primary-hover, #ebebeb);
  border-color: var(--dsw-alias-button-primary-hover, #ebebeb);
}
.omnimux-inspiration-card-shimmer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: 9 / 16;
  background: var(--dsw-alias-bg-module-platform, #141414);
  overflow: hidden;
  z-index: 1;
  transition: opacity 0.26s ease-out;
}
.omnimux-inspiration-card-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.05)) 50%, transparent 100%);
  animation: omni-shimmer 1.4s infinite;
}
.omnimux-inspiration-card-shimmer.is-hidden {
  opacity: 0;
  pointer-events: none;
}
/* 导入进行中的卡片采用有机流体微光动效，关停旧扫光并屏蔽 Hover 浮层 */
.omnimux-inspiration-card-shimmer.is-importing::after {
  display: none;
}
.omnimux-inspiration-card-pure.is-importing .omnimux-inspiration-card-overlay {
  display: none;
}

@keyframes wf-organic-shimmer-sweep {
  0% {
    transform: translate3d(-69.697%, -69.697%, 0);
  }
  100% {
    transform: translate3d(0, 0, 0);
  }
}

.omnimux-inspiration-stage {
  --wf-shimmer-dur: 4000ms;
  --wf-shimmer-ease: linear;
  --wf-shimmer-direction: alternate;
  --wf-shimmer-band-factor: 26%;
  --wf-shimmer-band: calc(var(--wf-shimmer-band-factor) * 0.848);
  --wf-shimmer-bg-opacity: 1;
  --wf-shimmer-glow-blur: 20px;
  --wf-shimmer-glow-opacity: 0.75;
  --wf-shimmer-border-opacity: 1;
  --wf-shimmer-stage-bg: var(--dsw-alias-bg-layer-1, #181818);
  --wf-shimmer-stage-rgb: 24, 24, 24;
  --wf-shimmer-svg-url: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22600%22%20viewBox%3D%220%200%20600%20600%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22wf_shm_g%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%22600%22%20y2%3D%22600%22%3E%3Cstop%20offset%3D%220.0000%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%221%22%2F%3E%3Cstop%20offset%3D%220.3236%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%221%22%2F%3E%3Cstop%20offset%3D%220.4008%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%220.75%22%2F%3E%3Cstop%20offset%3D%220.4603%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%220.3%22%2F%3E%3Cstop%20offset%3D%220.5000%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%220%22%2F%3E%3Cstop%20offset%3D%220.5397%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%220.3%22%2F%3E%3Cstop%20offset%3D%220.5992%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%220.75%22%2F%3E%3Cstop%20offset%3D%220.6764%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%221%22%2F%3E%3Cstop%20offset%3D%221.0000%22%20stop-color%3D%22%23222226%22%20stop-opacity%3D%221%22%2F%3E%3C%2FlinearGradient%3E%3Cfilter%20id%3D%22wf_shm_w%22%20x%3D%22-10%25%22%20y%3D%22-10%25%22%20width%3D%22120%25%22%20height%3D%22120%25%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.009%200.015%22%20numOctaves%3D%222%22%20seed%3D%227%22%20result%3D%22n%22%2F%3E%3CfeDisplacementMap%20in%3D%22SourceGraphic%22%20in2%3D%22n%22%20scale%3D%2246%22%20xChannelSelector%3D%22R%22%20yChannelSelector%3D%22G%22%2F%3E%3CfeGaussianBlur%20stdDeviation%3D%225%22%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Crect%20x%3D%22-70%22%20y%3D%22-70%22%20width%3D%22740%22%20height%3D%22740%22%20fill%3D%22url(%23wf_shm_g)%22%20filter%3D%22url(%23wf_shm_w)%22%2F%3E%3C%2Fsvg%3E");
}

.wf-organic-shimmer {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--wf-shimmer-stage-bg, var(--dsw-alias-bg-module-platform, #141414));
  overflow: hidden;
  isolation: isolate;
  box-sizing: border-box;
}

.wf-organic-shimmer[data-playing="false"] .wf-organic-shimmer__distortion,
.wf-organic-shimmer[data-playing="false"] .wf-organic-shimmer__mask {
  animation-play-state: paused !important;
}

.wf-organic-shimmer__canvas {
  position: absolute;
  inset: -20px;
  pointer-events: none;
}

.wf-organic-shimmer__field {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(90px 70px at 20% 15%, rgba(40, 140, 255, 0.18), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(80px 60px at 65% 25%, rgba(255, 50, 100, 0.16), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(70px 80px at 30% 55%, rgba(50, 200, 80, 0.15), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(90px 70px at 75% 65%, rgba(180, 40, 240, 0.16), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(70px 60px at 45% 85%, rgba(255, 120, 40, 0.15), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(60px 60px at 10% 85%, rgba(30, 185, 170, 0.14), transparent), /* exempt-ui03 organic shimmer */
    linear-gradient(rgba(90, 90, 100, 0.05), rgba(90, 90, 100, 0.05)); /* exempt-ui03 organic shimmer */
  opacity: var(--wf-shimmer-bg-opacity, 1);
  pointer-events: none;
}

.wf-organic-shimmer__distortion {
  position: absolute;
  top: 0;
  left: 0;
  width: 330%;
  height: 330%;
  background-image: var(--wf-shimmer-svg-url);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transform: translate3d(-69.697%, -69.697%, 0);
  animation: wf-organic-shimmer-sweep var(--wf-shimmer-dur, 4000ms) var(--wf-shimmer-ease, linear) infinite var(--wf-shimmer-direction, alternate);
  will-change: transform;
  pointer-events: none;
}

.wf-organic-shimmer__glow-layer {
  position: absolute;
  inset: -20px;
  z-index: 1;
  pointer-events: none;
}

.wf-organic-shimmer__glow-wrap {
  position: absolute;
  inset: 0;
  opacity: var(--wf-shimmer-glow-opacity, 0.75);
  pointer-events: none;
}

.wf-organic-shimmer__glow-deep,
.wf-organic-shimmer__glow-mid,
.wf-organic-shimmer__glow-border {
  position: absolute;
  inset: 20px;
  border-radius: inherit;
  pointer-events: none;
}

.wf-organic-shimmer__glow-deep {
  background:
    radial-gradient(55px 31px at 33% -7.4%, rgba(255, 50, 100, 0.4), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(47px 27px at 12% -5%, rgba(40, 140, 255, 0.34), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(31px 55px at 2.1% 68.3%, rgba(50, 200, 80, 0.38), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(140px 25px at 74.4% 100%, rgba(100, 70, 255, 0.4), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(66px 20px at 55% 100%, rgba(40, 140, 255, 0.35), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(58px 25px at 93.9% 0%, rgba(255, 120, 40, 0.44), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(40px 38px at 100% 27.1%, rgba(180, 40, 240, 0.38), transparent); /* exempt-ui03 organic shimmer */
  box-shadow: inset 0 0 calc(var(--wf-shimmer-glow-blur, 20px) * 3) calc(var(--wf-shimmer-glow-blur, 20px) / 2) rgba(90, 90, 100, 0.1); /* exempt-ui03 organic shimmer */
  filter: blur(var(--wf-shimmer-glow-blur, 20px));
  mask-image:
    linear-gradient(white, transparent 26px, transparent calc(100% - 26px), white),
    linear-gradient(to right, white, transparent 26px, transparent calc(100% - 26px), white);
  mask-composite: add;
  -webkit-mask-composite: source-over;
}

.wf-organic-shimmer__glow-mid {
  background:
    radial-gradient(39px 21px at 33% -7.4%, rgba(255, 50, 100, 0.34), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(33px 18px at 12% -5%, rgba(40, 140, 255, 0.28), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(21px 39px at 2.1% 68.3%, rgba(50, 200, 80, 0.3), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(9px 18px at 2.1% 68.3%, rgba(30, 185, 170, 0.25), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(104px 17px at 74.4% 100%, rgba(100, 70, 255, 0.32), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(48px 13px at 55% 100%, rgba(40, 140, 255, 0.28), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(41px 17px at 93.9% 0%, rgba(255, 120, 40, 0.35), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(13px 23px at 100% 27.1%, rgba(240, 50, 180, 0.28), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(28px 26px at 100% 27.1%, rgba(180, 40, 240, 0.3), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(36px 36px at 0% 0%, rgba(90, 90, 100, 0.14), transparent 70%), /* exempt-ui03 organic shimmer */
    radial-gradient(36px 36px at 100% 0%, rgba(90, 90, 100, 0.14), transparent 70%), /* exempt-ui03 organic shimmer */
    radial-gradient(36px 36px at 0% 100%, rgba(90, 90, 100, 0.14), transparent 70%), /* exempt-ui03 organic shimmer */
    radial-gradient(36px 36px at 100% 100%, rgba(90, 90, 100, 0.14), transparent 70%); /* exempt-ui03 organic shimmer */
  box-shadow: rgba(90, 90, 100, 0.12) 0px 0px 14px 1px inset; /* exempt-ui03 organic shimmer */
  filter: blur(2px);
  mask-image:
    linear-gradient(white, transparent 44px, transparent calc(100% - 44px), white),
    linear-gradient(to right, white, transparent 44px, transparent calc(100% - 44px), white);
  mask-composite: add;
  -webkit-mask-composite: source-over;
}

.wf-organic-shimmer__glow-border {
  padding: 1px;
  opacity: var(--wf-shimmer-border-opacity, 1);
  background:
    radial-gradient(42px 24px at 33% -7.4%, rgba(255, 50, 100, 0.65), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(36px 21px at 12% -5%, rgba(40, 140, 255, 0.52), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(24px 42px at 2.1% 68.3%, rgba(50, 200, 80, 0.6), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(12px 21px at 2.1% 68.3%, rgba(30, 185, 170, 0.48), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(108px 19px at 74.4% 100%, rgba(100, 70, 255, 0.62), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(51px 16px at 55% 100%, rgba(40, 140, 255, 0.55), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(44px 19px at 93.9% 0%, rgba(255, 120, 40, 0.7), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(16px 25px at 100% 27.1%, rgba(240, 50, 180, 0.55), transparent), /* exempt-ui03 organic shimmer */
    radial-gradient(31px 29px at 100% 27.1%, rgba(180, 40, 240, 0.6), transparent), /* exempt-ui03 organic shimmer */
    linear-gradient(rgba(90, 90, 100, 0.25), rgba(90, 90, 100, 0.25)); /* exempt-ui03 organic shimmer */
  mask:
    linear-gradient(white 0 0) content-box exclude,
    linear-gradient(white 0 0);
  -webkit-mask:
    linear-gradient(white 0 0) content-box,
    linear-gradient(white 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

.wf-organic-shimmer__mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 330%;
  height: 330%;
  background-image: linear-gradient(
    135deg,
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 1) 0%, /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 1) calc(50% - var(--wf-shimmer-band, 22%) * 1.4), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 0.94) calc(50% - var(--wf-shimmer-band, 22%) * 1), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 0.82) calc(50% - var(--wf-shimmer-band, 22%) * 0.6), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 0.55) calc(50% - var(--wf-shimmer-band, 22%) * 0.25), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 0) 50%, /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 0.5) calc(50% + var(--wf-shimmer-band, 22%) * 0.18), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 1) calc(50% + var(--wf-shimmer-band, 22%) * 0.35), /* exempt-ui03 organic shimmer */
    rgba(var(--wf-shimmer-stage-rgb, 24, 24, 24), 1) 100% /* exempt-ui03 organic shimmer */
  );
  transform: translate3d(-69.697%, -69.697%, 0);
  animation: wf-organic-shimmer-sweep var(--wf-shimmer-dur, 4000ms) var(--wf-shimmer-ease, linear) infinite var(--wf-shimmer-direction, alternate);
  will-change: transform;
  pointer-events: none;
}
.omnimux-inspiration-badge-status {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  max-width: calc(100% - 20px);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.omnimux-inspiration-badge-status.is-failed {
  background: var(--dsw-alias-state-error-secondary, rgba(220, 68, 68, 0.18));
  color: var(--dsw-alias-state-error-primary, #f26d6d);
  border-color: var(--dsw-alias-state-error-primary, #f26d6d);
}
/* 卡片上的失败/降级原因：贴在封面顶部，与居中的状态胶囊分层，不遮挡 CTA */
.omnimux-inspiration-card-error {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 8px;
  z-index: 3;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-secondary, rgba(0, 0, 0, 0.62));
  color: var(--dsw-alias-label-secondary, #d4d4d4);
  font-size: 11px;
  line-height: 15px;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  pointer-events: none;
}
.omnimux-inspiration-card-error.is-failed {
  background: var(--dsw-alias-state-error-secondary, rgba(220, 68, 68, 0.28));
  color: var(--dsw-alias-state-error-primary, #f26d6d);
}
/* 无媒体的状态直接占用共享正文，布局估算和可见文字使用同一内容。 */
.omnimux-inspiration-card-error.is-inline,
.omnimux-inspiration-card-state-text {
  position: relative;
  z-index: 2;
  inset: auto;
  margin: 0;
  padding: 0;
  background: transparent;
  font-size: 14px;
  line-height: 20px;
  -webkit-line-clamp: 8;
}
.omnimux-inspiration-card-state-text {
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-1, #181818);
  opacity: 0;
  transition: opacity 0.26s ease-out;
}
.omnimux-inspiration-cover-img.is-loaded {
  opacity: 1;
}

/* 视频首帧封面：与封面图同尺寸同裁切，代替不可渲染的封面。
   指针事件穿透，避免遮挡卡片点击与悬停浮层。 */
.omnimux-inspiration-cover-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-1, #181818);
  opacity: 0;
  transition: opacity 0.26s ease-out;
  pointer-events: none;
}
.omnimux-inspiration-cover-video.is-loaded {
  opacity: 1;
}

/* Fallback 占位卡片 */
.omnimux-inspiration-cover-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 9 / 16;
  background: radial-gradient(circle at 50% 30%, var(--dsw-alias-bg-layer-2, #202020) 0%, var(--dsw-alias-bg-base, #111111) 100%);
  padding: 16px;
  gap: 12px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-fallback-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
}
.omnimux-inspiration-fallback-title {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #888888);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

/* 内容卡媒体沿用共享占位比例；完整显示图片，避免竖屏封面裁掉图文。 */
.omnimux-inspiration-card-pure .omnimux-rival-card-media {
  height: auto;
  aspect-ratio: var(--rival-media-ratio, 1);
  object-fit: contain;
}
.omnimux-inspiration-card-pure .omnimux-inspiration-card-shimmer {
  aspect-ratio: auto;
  pointer-events: none;
}
.omnimux-inspiration-card-pure .omnimux-inspiration-cover-fallback {
  box-sizing: border-box;
}
.omnimux-inspiration-card-pure .omnimux-inspiration-badge-media {
  position: absolute;
  right: 8px;
  top: 36px;
  z-index: 4;
  color: var(--dsw-specific-media-fg);
  background: var(--dsw-specific-media-pill-bg);
  border: 1px solid var(--dsw-specific-media-border);
  font-size: 11px;
  line-height: 16px;
}
.omnimux-inspiration-card-pure.t-text-media .omnimux-inspiration-badge-media {
  top: auto;
  right: 20px;
  bottom: 20px;
}
.omnimux-inspiration-card-pure.t-text .omnimux-inspiration-badge-platform,
.omnimux-inspiration-card-pure.t-text-media .omnimux-inspiration-badge-platform {
  opacity: 0;
}
.omnimux-inspiration-card-pure.t-text:hover .omnimux-inspiration-badge-platform,
.omnimux-inspiration-card-pure.t-text-media:hover .omnimux-inspiration-badge-platform,
.omnimux-inspiration-card-pure:focus-within .omnimux-inspiration-badge-platform {
  opacity: 1;
}
.omnimux-inspiration-card-pure:focus-within .omnimux-inspiration-card-overlay {
  opacity: 1;
}
.omnimux-inspiration-card-pure.t-text .omnimux-inspiration-card-overlay,
.omnimux-inspiration-card-pure.t-text-media .omnimux-inspiration-card-overlay {
  top: auto;
  background: var(--dsw-alias-bg-elevated);
}

/* ── 合集详情成员卡：封面优先（Issue 3459）──────────────────────────────
   只覆盖合集层：根层继续 contain，保存的图片必须完整可见（已有测试锁定）；
   合集层是等高素材网格，封面统一 4:5 裁切填充。 */
.omnimux-inspiration-card-pure.is-media-first .omnimux-rival-card-media {
  object-fit: cover;
}
/* text-media（X/Twitter 行）同样有媒体：封面优先时去掉它的卡片内边距与内嵌
   圆角，否则封面缩进 12px、高度估算与真实渲染差 24px（Issue 3459）。 */
.omnimux-rival-card.is-media-first.t-text-media {
  padding: 0;
}
.omnimux-rival-card.is-media-first.t-text-media .omnimux-rival-card-media {
  border-radius: 0;
  margin-top: 0;
}
.omnimux-inspiration-cover-wrap {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--dsw-specific-media-ink);
}
.omnimux-inspiration-badge-type,
.omnimux-inspiration-badge-duration {
  position: absolute;
  bottom: 8px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-specific-media-fg);
  background: var(--dsw-specific-media-pill-bg);
  border: 1px solid var(--dsw-specific-media-border);
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.omnimux-inspiration-badge-type {
  left: 8px;
}
.omnimux-inspiration-badge-duration {
  right: 8px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  letter-spacing: 0.02em;
}
/* 悬停工具条贴在封面底部：底部留 36px 给类型/时长角标，工具条浮在它们上方，
   不遮封面主体，也不再出现居中播放钮。 */
.omnimux-inspiration-cover-tools {
  position: absolute;
  inset: auto 0 0;
  z-index: 6;
  display: flex;
  justify-content: flex-end;
  padding: 24px 8px 36px;
  background: var(--dsw-specific-media-overlay);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
}
.omnimux-inspiration-card-pure:hover .omnimux-inspiration-cover-tools,
.omnimux-inspiration-card-pure:focus-within .omnimux-inspiration-cover-tools {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
@media (hover: none) {
  .omnimux-inspiration-cover-tools {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .omnimux-inspiration-cover-tools {
    transition: none;
  }
}
/* 元信息行固定 18px：估算层按同一高度记账，状态胶囊出现与否都不改卡片高度。 */
.omnimux-inspiration-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 18px;
  margin-top: 6px;
  min-width: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-card-meta-source {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-inspiration-card-meta-sep {
  flex: none;
  opacity: 0.6;
}
.omnimux-inspiration-card-meta-duration,
.omnimux-inspiration-card-meta-time {
  flex: none;
  white-space: nowrap;
}
.omnimux-inspiration-card-status {
  margin-left: auto;
  flex: none;
  max-width: 60%;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-inspiration-card-status.is-failed {
  color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-state-error-secondary, transparent);
  border-color: var(--dsw-alias-state-error-primary);
}
.omnimux-inspiration-card-status.is-settled {
  color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-state-warn-secondary, transparent);
  border-color: var(--dsw-alias-state-warn-primary);
}

.omnimux-inspiration-modal-post-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-y: auto;
  padding: 20px;
  width: 100%;
  height: 100%;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 1.7;
}

/* 卡片角标 Badge (置于右上角) */
.omnimux-inspiration-badge-platform {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.65));
  backdrop-filter: blur(8px);
  border: 1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.15));
  color: var(--dsw-alias-label-primary, #ffffff);
  letter-spacing: 0.5px;
}
.omnimux-inspiration-badge-platform.local {
  border-color: var(--dsw-alias-state-success-primary, #10b981);
  color: var(--dsw-alias-state-success-primary, #10b981);
  background: var(--dsw-alias-state-success-tertiary, rgba(16, 185, 129, 0.2));
}

/* Hover 浮层 */
.omnimux-inspiration-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.3)) 0%, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.1)) 40%, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.75)) 100%);
  opacity: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
  transition: opacity 120ms ease;
  pointer-events: none;
}
.omnimux-inspiration-card-pure:hover .omnimux-inspiration-card-overlay {
  opacity: 1;
}
.omnimux-inspiration-overlay-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--dsw-alias-button-primary-fill, #ffffff);
  color: var(--dsw-alias-label-primary-foreground, #0a0a0a);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}
.omnimux-inspiration-card-pure:hover .omnimux-inspiration-overlay-play {
  transform: translate(-50%, -50%) scale(1);
}
.omnimux-inspiration-overlay-play svg {
  width: 20px;
  height: 20px;
  margin-left: 2px;
}
.omnimux-inspiration-overlay-cta {
  position: relative;
  z-index: 6;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: stretch;
  gap: 6px;
  width: 100%;
  margin-bottom: 8px;
  padding: 0 2px;
  box-sizing: border-box;
  pointer-events: auto;
}
.omnimux-inspiration-card-pure:not(:hover):not(:focus-within) .omnimux-inspiration-overlay-cta {
  pointer-events: none;
}
.omnimux-inspiration-grid.selecting .omnimux-inspiration-overlay-cta {
  display: none;
}
.omnimux-inspiration-overlay-cta-btn {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0 6px;
  border-radius: 9999px;
  border: 1px solid transparent;
  /* 长写而非 font 简写：简写里的 inherit 不是合法 font-family，整条声明会被丢弃，
     按钮字号会退回继承父级，文字宽度因此超出预期。 */
  font-size: 12px;
  font-weight: 550;
  line-height: 16px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
/* 合集详情的封面工具条：CTA 行贴着封面底边排布，宽度由内容决定，
   不再撑满整卡（基础规则的 100% / 均分仍服务整卡悬停层）。 */
.omnimux-inspiration-cover-tools .omnimux-inspiration-overlay-cta {
  width: auto;
  margin-bottom: 0;
  padding: 0;
  pointer-events: auto;
}
.omnimux-inspiration-cover-tools .omnimux-inspiration-overlay-cta-btn {
  flex: 0 0 auto;
  width: auto;
}
.omnimux-inspiration-overlay-cta-btn svg {
  width: 14px;
  height: 14px;
  flex: none;
}
/* CTA 文字标签独占一格，溢出时收成省略号——紧凑区间的硬裁防线之外再兜一层，
   保证任何文案长度都不会出现被切断的半截字。 */
.omnimux-inspiration-overlay-cta-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Button 的文字槽是它自己的 flex 项，能否收缩由外层槽位决定；显式钉住，
   不依赖 UI 库内部默认值，也不让测试用 BASE_CSS 伪装生产环境。 */
.omnimux-inspiration-overlay-cta-btn > .dshUk-Button-label {
  min-width: 0;
}
/* 卡片自身宽度进入紧凑区间：CTA 退化为纯图标，文字整块退出布局。
   实测：中文「详情 / 立即复刻」在卡片约 190px 即可完整放下，
   完整窗口一行五张卡时单卡约 200px 以上。旧的 288px 会把这个尺寸提前收成纯图标。
   200px 让完整窗口显示全名；更窄时收成图标，省略号规则继续挡住半截字。
   英文 "Replicate now" 要到约 248px 才放得下，200–247px 之间显示省略号而不是半截字。 */
@container inspiration-card (max-width: 200px) {
  .omnimux-inspiration-overlay-cta {
    justify-content: center;
  }
  .omnimux-inspiration-overlay-cta-label {
    display: none;
  }
  .omnimux-inspiration-overlay-cta-btn {
    flex: 0 0 auto;
    width: 28px;
    padding: 0;
  }
}
.omnimux-inspiration-overlay-cta-btn.secondary {
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}
.omnimux-inspiration-overlay-cta-btn.secondary:hover {
  background: var(--dsw-alias-bg-mask-2, var(--dsw-alias-bg-mask-1));
}
/* 主行动按钮：实心底 + 反色文字（design.md §2.4「Action Ink & Paper」）。
   两套主题都由 token 自动反色——深色为白底黑字，浅色为黑底白字，
   不再走品牌蓝填充，避免宿主亮蓝出现在卡片 CTA 上。 */
.omnimux-inspiration-overlay-cta-btn.primary {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border-color: transparent;
}
.omnimux-inspiration-overlay-cta-btn.primary:hover {
  background: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-overlay-cta-btn:disabled,
.omnimux-inspiration-overlay-cta-btn[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
}
.omnimux-inspiration-overlay-footer {
  font-size: 11px;
  color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.85));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.8));
  position: relative;
  z-index: 1;
}
.omnimux-inspiration-cta-status {
  min-height: 18px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

/* ── 顶部气泡提示（Toast）────────────────────────────────────────────────
   导入成功的回执浮在内容之上，不进入内容流：它是「刚刚发生了什么」的一句话，
   不该把作品网格往下推。定位与宿主其它模块的气泡同位（中上），底色取浮层色，
   毛玻璃 + 规范边框 + 微阴影，与工具栏下拉面板同一套材质。 */
.omnimux-inspiration-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, calc(100vw - 48px));
  padding: 10px 16px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 32px var(--dsw-alias-bg-mask-1), 0 2px 8px var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  /* 只报信，不拦截点击：气泡盖住的控件仍然可点。 */
  pointer-events: none;
  animation: omnimux-inspiration-toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
  transition: opacity 180ms ease, transform 180ms ease;
}
.omnimux-inspiration-toast.is-leaving {
  opacity: 0;
  transform: translate(-50%, -8px);
}
.omnimux-inspiration-toast-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-state-success-primary);
}
@keyframes omnimux-inspiration-toast-in {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to { opacity: 1; transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .omnimux-inspiration-toast {
    animation: none;
    transition: none;
  }
}

/* 导入模态框 Import Dialog */
.omnimux-inspiration-import-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.48));
  overflow: hidden;
}
.omnimux-inspiration-import-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-inspiration-import-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.omnimux-inspiration-import-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.omnimux-inspiration-import-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 空态与错误提示 */
.omnimux-inspiration-empty, .omnimux-inspiration-gate, .omnimux-inspiration-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 240px;
  text-align: center;
  padding: 24px;
}
.omnimux-inspiration-empty-title {
  margin: 0;
  font: 600 18px/28px inherit;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-empty-text {
  margin: 0;
  font: 400 14px/20px inherit;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-spinner--sm { width: 10px; height: 10px; }
.omnimux-inspiration-empty-cta { margin-top: 12px; }
.omnimux-inspiration-error-text {
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
}
.omnimux-inspiration-success-text {
  color: var(--dsw-alias-state-success-primary);
  font-size: 13px;
}
.omnimux-inspiration-import-notice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-secondary, #b4b4b4);
  font-size: 13px;
  line-height: 18px;
}
.omnimux-inspiration-import-notice p {
  margin: 0;
}
/* 导入弹窗的判定回显：说明这次链接会被当作账号还是内容导入 */
.omnimux-inspiration-import-echo {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-secondary, #b4b4b4);
  font-size: 13px;
  line-height: 18px;
}
.omnimux-inspiration-import-echo[data-kind="account"] {
  border-color: var(--dsw-alias-brand-primary, #4c8dff);
  color: var(--dsw-alias-label-primary, inherit);
}
/* 播放器不可内嵌播放时的提示：覆盖在封面之上，不遮挡操作按钮 */
.omnimux-inspiration-player-notice {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-secondary, rgba(0, 0, 0, 0.6));
  color: var(--dsw-alias-label-secondary, #d4d4d4);
  font-size: 12px;
  line-height: 17px;
}
/* 导入中看板下方的阶段文案 */
.omnimux-inspiration-player-status {
  margin: 10px 0 0;
  font: 400 13px/18px inherit;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-modal-hint {
  margin: 0;
  font: 400 13px/18px inherit;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.omnimux-inspiration-import-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-inspiration-tags-collapse {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-inspiration-tags-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  min-height: 32px;
  padding: 0 2px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: 500 13px/20px inherit;
  cursor: pointer;
}
.omnimux-inspiration-tags-toggle:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-tags-toggle:disabled {
  opacity: 0.5;
  cursor: default;
}
.omnimux-inspiration-tags-toggle-label {
  color: inherit;
}
.omnimux-inspiration-tags-toggle-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 12px;
  line-height: 1;
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}
.omnimux-inspiration-tags-toggle-chevron.is-open {
  transform: rotate(0deg);
}
.omnimux-inspiration-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.omnimux-inspiration-switch,
.omnimux-inspiration-switch:hover,
.omnimux-inspiration-switch:active {
  position: relative;
  width: 36px;
  min-width: 36px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.30));
  cursor: pointer;
  transform: none;
  transition: background 0.15s ease;
  overflow: visible;
}
.omnimux-inspiration-switch[aria-checked="true"],
.omnimux-inspiration-switch[aria-checked="true"]:hover {
  background: var(--dsw-alias-state-success-primary, #4caf7d);
}
.omnimux-inspiration-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.omnimux-inspiration-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-label-primary-inverted, #ffffff));
  transition: transform 0.15s ease;
  pointer-events: none;
}
.omnimux-inspiration-switch[aria-checked="true"] .omnimux-inspiration-switch-knob {
  transform: translateX(16px);
}
.omnimux-inspiration-switch-label {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-fallback-icon--lg { width: 56px; height: 56px; }
.omnimux-inspiration-empty-breakdown-title {
  margin: 0 0 6px 0;
  font-size: 15px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-empty-breakdown-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-creator-handle {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-inspiration-detail-media,
.omnimux-inspiration-detail-cover {
  width: 100%;
  max-height: 320px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--dsw-alias-bg-module-platform);
}
.omnimux-inspiration-hook-card {
  background: var(--dsw-alias-bg-module-platform);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 12px;
}
.omnimux-inspiration-hook-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-brand-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.omnimux-inspiration-hook-body { font-size: 13px; line-height: 1.5; }
.omnimux-inspiration-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-inspiration-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-content-box {
  font-size: 13px;
  line-height: 1.5;
  background: var(--dsw-alias-bg-module-platform);
  padding: 10px;
  border-radius: 6px;
}
.omnimux-inspiration-meta-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-source-link { color: var(--dsw-alias-brand-primary); }
.omnimux-inspiration-platform-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-brand-primary);
}
.omnimux-inspiration-btn {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 9999px;
  background: var(--dsw-alias-button-primary-fill, #ffffff);
  color: var(--dsw-alias-label-primary-foreground, #0a0a0a);
  font: 500 13px/16px inherit;
  cursor: pointer;
}

/* 触底滚动加载器 */
.omnimux-inspiration-scroll-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--dsw-alias-border, rgba(255,255,255,0.15));
  border-top-color: var(--dsw-alias-label-primary, #ffffff);
  border-radius: 50%;
  animation: omni-spin 0.6s linear infinite;
}
@keyframes omni-spin {
  to { transform: rotate(360deg); }
}

/* Original post and scoped analysis share one reading surface. */
.omnimux-inspiration-modal-backdrop { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--dsw-alias-bg-mask-1); overscroll-behavior: contain; }
.omnimux-inspiration-modal-wrapper { position: relative; width: min(1200px, 100%); height: min(88vh, 900px); display: flex; }
.omnimux-inspiration-modal-container { position: relative; display: flex; flex-direction: column; width: 100%; min-height: 0; border-radius: 16px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); overflow: hidden; isolation: isolate; }
.omnimux-inspiration-modal-close { position: absolute; top: 14px; right: 16px; z-index: 5; width: 32px; height: 32px; padding: 0; }
.omnimux-inspiration-modal-header { display: flex; flex: 0 0 auto; align-items: center; gap: 16px; padding: 20px 60px 20px 28px; min-height: 72px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.omnimux-inspiration-modal-heading { display: flex; align-items: center; min-width: 0; flex: 1; gap: 8px; }
.omnimux-inspiration-modal-heading h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.omnimux-inspiration-modal-header-actions { display: flex; align-items: center; position: relative; flex-shrink: 0; }
.omnimux-inspiration-modal-copy { flex-shrink: 0; }
.omnimux-post-detail { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.omnimux-post-mobile-tabs { display: none; }
.omnimux-post-columns { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(340px, 1fr); flex: 1; min-height: 0; overflow: hidden; }
.omnimux-post-source, .omnimux-post-analysis { min-width: 0; min-height: 0; }
.omnimux-post-source { padding: 26px 30px; overflow-y: auto; overscroll-behavior: contain; }
.omnimux-post-analysis { display: flex; flex-direction: column; border-left: 1px solid var(--dsw-alias-border-l1); }
.omnimux-post-analysis-scroll { overflow-y: auto; padding: 24px 26px; min-height: 0; flex: 1; overscroll-behavior: contain; }
.omnimux-post-source, .omnimux-post-analysis-scroll { scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
.omnimux-post-author { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; font-size: 14px; }
.omnimux-post-avatar { width: 40px; height: 40px; flex: 0 0 40px; display: grid; place-items: center; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 16px; }
.omnimux-post-meta { display: flex; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.7; }
.omnimux-post-source-link { display: inline-flex; margin-left: auto; color: var(--dsw-alias-label-secondary); padding: 8px; }
.omnimux-post-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.9; color: var(--dsw-alias-label-primary); }
.omnimux-post-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.omnimux-post-original .omnimux-post-actions { margin: 16px 0 24px; }
.omnimux-post-media { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 20px; margin-top: 20px; }
.omnimux-post-media-viewer { position: relative; width: 100%; height: min(400px, 48vh); min-height: 220px; display: flex; align-items: center; justify-content: center; border-radius: 12px; overflow: hidden; background: var(--dsw-alias-bg-base); }
.omnimux-post-media-viewer .omnimux-inspiration-player-frame, .omnimux-post-media-viewer .omnimux-inspiration-modal-cover-bg { display: block; width: 100%; height: 100%; object-fit: contain; }
.omnimux-post-media-viewer video[hidden] { display: none; }
.omnimux-post-orphan-cover { max-width: 100%; max-height: 400px; object-fit: contain; }
.omnimux-post-media-viewer .omnimux-post-image-open { width: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; }
.omnimux-post-image-open > span { display: contents; }
.omnimux-post-image-caption { position: absolute; right: 12px; bottom: 12px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; }
.omnimux-post-asset-footer { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 14px 0 4px; font-size: 13px; }
.omnimux-post-asset-footer p { margin: 4px 0 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.omnimux-post-analysis-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 22px 26px 14px; }
.omnimux-post-analysis-header h3 { display: flex; align-items: center; gap: 8px; font-size: 15px; margin: 0; }
.omnimux-post-targets { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 22px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.omnimux-post-scope-title { margin: 0 0 10px; font-size: 20px; line-height: 1.5; font-weight: 600; }
.omnimux-post-help { font-size: 12px; line-height: 1.8; color: var(--dsw-alias-label-secondary); margin: 8px 0 16px; }
.omnimux-post-directions { display: flex; flex-direction: column; gap: 8px; margin: 22px 0; }
.omnimux-post-direction { display: flex; align-items: flex-start; gap: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 13px 14px; cursor: pointer; }
.omnimux-post-direction input { margin-top: 4px; accent-color: var(--dsw-alias-brand-primary); }
.omnimux-post-direction strong { font-size: 13px; font-weight: 500; display: block; }
.omnimux-post-direction small { font-size: 11px; color: var(--dsw-alias-label-secondary); display: block; margin-top: 4px; line-height: 1.7; }
.omnimux-post-result { border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 24px; padding-top: 16px; font-size: 13px; line-height: 1.85; }
.omnimux-post-analysis-summary { margin: 12px 0 20px; line-height: 1.9; }
.omnimux-post-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.omnimux-post-section-heading h3 { font-size: 14px; }
.omnimux-post-analysis-empty { margin: 24px 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.8; }
.omnimux-post-reference-bar { display: flex; gap: 16px; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 68px; padding: 14px 28px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); font-size: 12px; }
.omnimux-post-reference-bar > div { min-width: 0; }
.omnimux-post-reference-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; color: var(--dsw-alias-label-secondary); }
.omnimux-post-reference-chips span { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 2px 6px; font-size: 11px; }
.omnimux-post-lightbox { max-width: 100%; height: 100%; }
.omnimux-post-lightbox-tools { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 14px; }
.omnimux-post-lightbox-tools a { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-left: 12px; }
.omnimux-post-lightbox-canvas { display: flex; justify-content: center; align-items: center; overflow: auto; height: calc(100dvh - 240px); min-height: 160px; }
.omnimux-post-lightbox-canvas img { object-fit: contain; max-width: 100%; max-height: 100%; }
.omnimux-post-lightbox-canvas.is-zoomed { display: block; }
.omnimux-post-drawer-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; width: 100%; }
.omnimux-post-draft-content { display: flex; flex-direction: column; gap: 22px; font-size: 13px; }
.omnimux-post-draft-content h4 { margin: 0 0 10px; font-size: 13px; }
.omnimux-post-draft-reference { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.omnimux-post-draft-reference > span { display: inline-flex; align-items: center; gap: 8px; }
.omnimux-post-purpose { display: flex; flex-wrap: wrap; gap: 4px; }
.omnimux-post-clip { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; margin: 0; padding: 14px; }
.omnimux-post-clip legend { padding: 0 4px; font-size: 12px; }
.omnimux-post-clip p { font-size: 11px; line-height: 1.8; color: var(--dsw-alias-label-secondary); }
.omnimux-post-clip > div { display: flex; align-items: end; gap: 8px; }
.omnimux-post-clip label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; flex: 1; }
.omnimux-post-draft-field { display: flex; flex-direction: column; gap: 10px; }
.omnimux-post-draft-field textarea { resize: vertical; min-height: 80px; width: 100%; box-sizing: border-box; font: inherit; line-height: 1.8; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.omnimux-post-draft-actions { display: flex; justify-content: flex-end; gap: 8px; }
.omnimux-post-warning { padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; font-size: 12px; line-height: 1.8; }
.omnimux-post-warning p { margin-top: 0; }
.omnimux-inspiration-modal-script-list { list-style: none; padding: 0; }
.omnimux-inspiration-modal-script-list li { display: flex; align-items: start; gap: 8px; margin: 10px 0; }
.omnimux-inspiration-shot-card { padding: 14px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.omnimux-inspiration-shot-card h4 { margin: 8px 0; }
.omnimux-inspiration-shot-prompt { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.omnimux-post-embed { display: block; width: 100%; height: 400px; border: 0; }
dialog.omnimux-inspiration-preview-layer { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; }
dialog.omnimux-inspiration-preview-layer::backdrop { background: transparent; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
@media (max-width: 860px) {
  .omnimux-inspiration-modal-backdrop { padding: 12px; }
  .omnimux-inspiration-modal-wrapper { height: 94dvh; }
  .omnimux-inspiration-modal-header { padding-left: 20px; }
  .omnimux-inspiration-modal-heading h2 { font-size: 16px; }
  .omnimux-post-detail > .omnimux-post-mobile-tabs { display: flex; flex-shrink: 0; margin-inline: 0; padding: 8px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
  .omnimux-post-columns { display: block; }
  .omnimux-post-source, .omnimux-post-analysis { display: none; height: 100%; box-sizing: border-box; }
  .omnimux-post-source.is-active { display: block; }
  .omnimux-post-analysis.is-active { display: flex; }
  .omnimux-post-analysis { border-left: 0; }
  .omnimux-post-source { padding: 22px 20px; }
  .omnimux-post-analysis-header, .omnimux-post-analysis-scroll { padding-left: 20px; padding-right: 20px; }
  .omnimux-post-asset-footer { align-items: start; flex-direction: column; }
  .omnimux-post-reference-bar { padding: 12px 20px; }
  .omnimux-post-creation-drawer { max-width: 100%; }
}

.omnimux-inspiration-share-trigger-btn {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.05));
  color: var(--dsw-alias-label-primary, #ffffff);
  cursor: pointer;
  transition: all 0.15s ease;
}
.omnimux-inspiration-share-trigger-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
  border-color: var(--dsw-alias-border-l3, #383838);
}
.omnimux-inspiration-share-trigger-btn.is-active {
  background: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.14));
  color: var(--dsw-alias-label-primary, #ffffff);
  border-color: var(--dsw-alias-border-l3, #383838);
}
.omnimux-inspiration-share-popover {
  position: absolute;
  top: 40px;
  right: 0;
  width: 280px;
  background: var(--dsw-alias-bg-layer-1, #181818);
  border: 1px solid var(--dsw-alias-border-l3, #383838);
  border-radius: 12px;
  box-shadow: 0 16px 36px -8px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
  padding: 14px;
  z-index: 100;
  animation: omnimuxShareFadeIn 0.15s ease-out;
}
@keyframes omnimuxShareFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.omnimux-inspiration-share-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.omnimux-inspiration-share-popover-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-share-popover-close {
  background: transparent;
  border: 0;
  padding: 2px;
  color: var(--dsw-alias-label-secondary, #b4b4b4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.omnimux-inspiration-share-popover-close:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-share-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--dsw-alias-label-tertiary, #888888);
  margin: 0 0 10px;
}
.omnimux-inspiration-share-progress {
  margin-bottom: 2px;
}
.omnimux-inspiration-share-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-inspiration-share-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #888888);
}
.omnimux-inspiration-share-step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--dsw-alias-label-tertiary, #888888);
}
.omnimux-inspiration-share-step.is-done {
  color: var(--dsw-alias-label-secondary, #b4b4b4);
}
.omnimux-inspiration-share-step.is-done .omnimux-inspiration-share-step-dot {
  background: var(--dsw-alias-state-success-primary, #10b981);
}
.omnimux-inspiration-share-step.is-active {
  color: var(--dsw-alias-label-primary, #ffffff);
  font-weight: 500;
}
.omnimux-inspiration-share-step.is-active .omnimux-inspiration-share-step-dot {
  background: var(--dsw-alias-brand-primary, #4c8dff);
}
.omnimux-inspiration-share-step.is-todo .omnimux-inspiration-share-step-dot {
  background: var(--dsw-alias-border-l3, #383838);
}
.omnimux-inspiration-share-step-label {
  flex: 1;
  min-width: 0;
}
.omnimux-inspiration-share-tip {
  font-size: 11px;
  color: var(--dsw-alias-state-warning-primary, #f59e0b);
  margin-bottom: 10px;
  padding: 4px 8px;
  background: var(--dsw-alias-state-warning-tertiary, rgba(245, 158, 11, 0.12));
  border-radius: 6px;
  line-height: 1.3;
}
.omnimux-inspiration-share-tip.is-error {
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-state-error-secondary, rgba(220, 68, 68, 0.18));
  border: 1px solid var(--dsw-alias-state-error-primary, #ef4444);
}
.omnimux-inspiration-share-submit-btn {
  width: 100%;
}
.omnimux-inspiration-share-link-box {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.omnimux-inspiration-share-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-bg-base, #111111);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 6px;
  outline: none;
}
.omnimux-inspiration-share-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888888);
  display: flex;
  justify-content: space-between;
}
.omnimux-inspiration-share-done {
  color: var(--dsw-alias-state-success-primary, #10b981);
}

/* 一级标题：板块大标题 (15px / 600) */
.omnimux-inspiration-doc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  text-align: left;
  line-height: 1.4;
  letter-spacing: -0.01em;
}
.omnimux-inspiration-modal-dimensions.is-doc-style h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  text-align: left;
  line-height: 1.4;
  letter-spacing: -0.01em;
}
.omnimux-inspiration-doc-title-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary, #4c8dff);
  flex-shrink: 0;
}
.omnimux-inspiration-doc-quote,
.omnimux-inspiration-modal-dimensions.is-doc-style blockquote {
  margin: 0 0 14px 0;
  padding: 4px 0 4px 12px;
  border-left: 2px solid var(--dsw-alias-border-l3, #3f3f46);
  color: var(--dsw-alias-label-tertiary, #a1a1aa);
  font-style: italic;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.omnimux-inspiration-doc-analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-inspiration-doc-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 二级项目：项目/维度小标题 (14px / 600，不带圆点) */
.omnimux-inspiration-doc-item-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary-dimmed, #f4f4f5);
  line-height: 1.4;
}
.omnimux-inspiration-doc-group:first-child .omnimux-inspiration-doc-item-title {
  margin-top: 0;
}
.omnimux-inspiration-doc-item-indicator {
  width: 5px;
  height: 5px;
  border-radius: 1.5px;
  background: var(--dsw-alias-label-tertiary, #71717a);
  flex-shrink: 0;
}
.omnimux-inspiration-doc-record {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 6px 0 12px;
}
.omnimux-inspiration-doc-labeled-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  text-align: left;
  gap: 4px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 4px;
}
.omnimux-inspiration-doc-label {
  font-weight: 600;
  color: var(--dsw-alias-label-primary-dimmed, #f4f4f5);
  white-space: normal;
  overflow-wrap: anywhere;
  min-width: 0;
}
/* 三级描述：说明文本与缩进块 (13px / 400) */
.omnimux-inspiration-doc-desc-block {
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-inspiration-doc-desc {
  margin: 0;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-align: left;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary, #a1a1aa);
}
.omnimux-inspiration-doc-bullet {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}
.omnimux-inspiration-bullet-dot {
  color: var(--dsw-alias-label-tertiary, #a1a1aa);
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.omnimux-inspiration-modal-dimensions.is-doc-style `

/**
 * Inject inspiration CSS styles into document.head safely.
 */
export function injectInspirationStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(INSPIRATION_STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = INSPIRATION_STYLES_ID
  styleNode.textContent = INSPIRATION_CSS
  document.head.appendChild(styleNode)
}
