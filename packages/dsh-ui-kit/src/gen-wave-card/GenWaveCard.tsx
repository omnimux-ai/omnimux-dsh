import { forwardRef, useEffect, useRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./GenWaveCard.module.css";
import {
  GEN_WAVE_BADGE_FONT_FAMILY,
  GEN_WAVE_COLORS,
  GEN_WAVE_CONFIG,
  GEN_WAVE_FREEZE,
  dotFillStyle,
} from "./genWavePalette.ts";

export interface GenWaveCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 顶部任务文案，外部供给。 */
  statusText: string;
  /** 0–100；传入后由外部接管进度显示并停用内置演示缓动。 */
  progress?: number;
  /** 是否启用内置 0→96% 演示缓动；默认 progress 未提供时为 true。 */
  autoProgress?: boolean;
  /** Custom class name. */
  className?: string;
}

/**
 * 固定深色既定视觉：点阵/文案/胶囊色值不消费 --dsw-alias-* 动态主题，
 * 真源为 genWavePalette.ts（实测色，见该文件注释），
 * 以 CSS 变量注入根元素供 GenWaveCard.module.css 使用
 *（色值字面量一律集中在 genWavePalette.ts，本文件与 module.css 不得出现）。
 * 唯一例外是卡片底色：.card background 声明为
 * var(--gen-wave-card-bg, var(--dsw-alias-bg-layer-2))，不再注入固定值，
 * 默认跟随宿主 layer-2 层级底色与页面底色拉开层次；
 * 需要自定义时由宿主在卡片上写 --gen-wave-card-bg 覆盖。
 */
const THEME_VARS = {
  "--gen-wave-status": GEN_WAVE_COLORS.status,
  "--gen-wave-icon": GEN_WAVE_COLORS.icon,
} as CSSProperties;

/**
 * 点阵 Loading 卡片（1:1 移植自 chatgpt-gen-loading-card.html）。
 *
 * canvas 绘 28×29 点阵：尺寸场 |cos|^0.5 周期波（s = col + 0.8·row）
 * 叠加亮度场 sigmoid 单向锋面（s = col − 0.35·row，T 在 [-10,31] 往返），
 * 左上 r0c0 / 右上 r0c27 / 左下 r28c0 三角位缺位；右下角 58×35 椭圆
 * 进度胶囊与点阵同层绘制（DOM badge 保留为 ARIA/状态载体）。
 * 自适应容器尺寸：画布撑满卡片剩余高度（.card 为 flex 列，.field flex:1），
 * 点距取水平/垂直两个方向可容点距的较小值，点阵在画布内双向居中；
 * prefers-reduced-motion 定格参考帧。
 */
export const GenWaveCard = forwardRef<HTMLDivElement, GenWaveCardProps>(
  function GenWaveCard({ statusText, progress, autoProgress, className, style, ...rest }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const badgeRef = useRef<HTMLSpanElement>(null);
    /** reduced-motion 下外部更新进度时触发的单帧重绘钩子。 */
    const redrawRef = useRef<(() => void) | null>(null);

    const setProgressText = (n: number) => {
      const el = badgeRef.current;
      if (!el) return;
      const v = Math.max(0, Math.min(100, Number(n) || 0));
      el.textContent = Math.round(v) + "%";
    };

    /* ---------- 画布生命周期：布局、主循环、自适应 ---------- */
    useEffect(() => {
      const canvas = canvasRef.current;
      const badgeEl = badgeRef.current;
      if (!canvas || !badgeEl) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const C = GEN_WAVE_CONFIG;
      let cssW = 0;
      let cssH = 0;
      let spacing: number = C.SPACING;
      let gridOffX = 0;
      let gridOffY = 0;
      let rafId = 0;

      /* 画布实测尺寸反算点距：水平/垂直两个方向各算一个可容点距取较小值，
         点阵在画布内双向居中，铺满卡片可用空间（不再 clamp 到 C.SPACING 上限）。 */
      const layout = () => {
        const rect = canvas.getBoundingClientRect();
        cssW = rect.width;
        cssH = rect.height;
        spacing = Math.min(
          (cssW - C.PAD_X * 2) / (C.COLS - 1),
          (cssH - C.PAD_Y - C.PAD_Y_BOT) / (C.ROWS - 1),
        );
        const gridW = spacing * (C.COLS - 1);
        const gridH = spacing * (C.ROWS - 1);
        gridOffX = (cssW - gridW) / 2;
        gridOffY = (cssH - gridH) / 2;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      /* 网格角点 mask（实测 r0c0 / r0c27 / r28c0 缺位）。 */
      const MASKED = new Set(C.MASKED_CELLS.map(([c, r]) => c + "," + r));
      const maskedOut = (c: number, r: number) => MASKED.has(c + "," + r);

      /* 尺寸波：k = (1+cos(2π(s−φ)/λ))/2，s = col + 0.8·row；
         周期波沿左上→右下对角线传播，φ 随时间推进。 */
      const sizeWave = (col: number, row: number, phi: number) => {
        const s = col + C.SIZE_TILT * row;
        return Math.pow(
          (1 + Math.cos((2 * Math.PI * (s - phi)) / C.SIZE_LAMBDA)) / 2,
          C.SIZE_POW,
        );
      };

      /* 亮度锋面：k = sigmoid((T − s)/σ)，s = col − 0.35·row；
         未扫过区域暗而小（右上楔形），扫过区域全亮。 */
      const brightWave = (col: number, row: number, T: number) => {
        const s = col - C.REVEAL_TILT * row;
        return 1 / (1 + Math.exp((s - T) / C.REVEAL_SIGMA));
      };

      const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

      const drawField = (phi: number, T: number) => {
        ctx.clearRect(0, 0, cssW, cssH);

        for (let r = 0; r < C.ROWS; r++) {
          for (let c = 0; c < C.COLS; c++) {
            if (maskedOut(c, r)) continue; // 角点缺位
            const ks = sizeWave(c, r, phi); // 尺寸波
            const kb = brightWave(c, r, T); // 亮度锋面
            const radius = lerp(C.DOT_R_MIN, C.DOT_R_MAX, ks);
            const x = gridOffX + c * spacing;
            const y = gridOffY + r * spacing;

            ctx.fillStyle = dotFillStyle(kb);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        /* 进度胶囊：椭圆 58×35 CSS，右缘距画布右缘 BADGE_X_OFF、
           下缘贴画布底（BADGE_BOTTOM_GAP=0），始终落在右下角画布区内。 */
        const bw = C.BADGE_W;
        const bh = C.BADGE_H;
        const bx = cssW - C.BADGE_X_OFF - bw;
        const by = cssH - C.BADGE_BOTTOM_GAP - bh;
        ctx.fillStyle = GEN_WAVE_COLORS.badgeBg;
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GEN_WAVE_COLORS.badgeFg;
        ctx.font = `500 ${C.BADGE_FONT}px ${GEN_WAVE_BADGE_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeEl.textContent ?? "", bx + bw / 2, by + bh / 2 + 0.5);
      };

      /* 主循环：尺寸波 φ 线性推进（波峰左上→右下扫动）；
         亮度锋面 T 在 [S_MIN,S_MAX] 间往返（cos 缓入缓出），参考截帧 T≈22.8。 */
      const frame = (now: number) => {
        const phi = (now / C.SIZE_PERIOD_MS) * C.SIZE_LAMBDA + GEN_WAVE_FREEZE.PHI;
        const span = C.REVEAL_S_MAX - C.REVEAL_S_MIN;
        const q = (now % (C.REVEAL_PERIOD_MS * 2)) / C.REVEAL_PERIOD_MS; // 0→2
        const k = q <= 1 ? q : 2 - q; // 0→1→0
        const T = C.REVEAL_S_MIN + span * (0.5 - 0.5 * Math.cos(Math.PI * k));
        drawField(phi, T);
        rafId = requestAnimationFrame(frame);
      };

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      const redrawStatic = () => {
        drawField(GEN_WAVE_FREEZE.PHI, GEN_WAVE_FREEZE.T);
      };
      redrawRef.current = reducedMotion ? redrawStatic : null;

      const relayout = () => {
        layout();
        if (reducedMotion) redrawStatic();
      };

      layout();
      if (reducedMotion) {
        redrawStatic(); // 减少动态偏好：定格参考帧
      } else {
        drawField(GEN_WAVE_FREEZE.PHI, GEN_WAVE_FREEZE.T); // 首帧先落一版，避免空白闪帧
        rafId = requestAnimationFrame(frame);
      }

      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(relayout);
        observer.observe(canvas);
      }
      window.addEventListener("resize", relayout);

      return () => {
        cancelAnimationFrame(rafId);
        observer?.disconnect();
        window.removeEventListener("resize", relayout);
        redrawRef.current = null;
      };
    }, []);

    /* ---------- 外部进度接管（等价于源实现的 setProgress） ---------- */
    useEffect(() => {
      if (progress === undefined) return;
      setProgressText(progress);
      redrawRef.current?.(); // reduced-motion 下同步胶囊读数
    }, [progress]);

    /* ---------- 内置演示缓动：0→96% easeOutCubic ---------- */
    useEffect(() => {
      const enabled = autoProgress ?? progress === undefined;
      if (!enabled) return;
      let running = true;
      const C = GEN_WAVE_CONFIG;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!running) return;
        const k = Math.min(1, (now - t0) / C.DEMO_MS);
        setProgressText(C.DEMO_TARGET * (1 - Math.pow(1 - k, 3)));
        redrawRef.current?.();
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return () => {
        running = false;
      };
    }, [autoProgress, progress === undefined]);

    return (
      <div
        {...rest}
        ref={ref}
        role="status"
        aria-live="polite"
        aria-label="Generation in progress"
        className={cx(cssClass(css.card, "card"), className)}
        style={{ ...THEME_VARS, ...style }}
      >
        <div className={cssClass(css.head, "head")}>
          {/* 终端/工具图标：圆角描边方框 + ›_ 符号（按参考截图逐像素形状绘制） */}
          <span className={cssClass(css.icon, "icon")} aria-hidden="true">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.8 2 4.8 4 1.8 6" />
              <path d="M5.6 6h1.6" />
            </svg>
          </span>
          <span className={cssClass(css.status, "status")}>{statusText}</span>
        </div>

        <canvas ref={canvasRef} className={cssClass(css.field, "field")} aria-hidden="true" />

        <span ref={badgeRef} className={cssClass(css.badge, "badge")}>
          0%
        </span>
      </div>
    );
  },
);
