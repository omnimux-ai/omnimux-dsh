/**
 * GenWaveCard 视觉参数与色值常量。
 *
 * 真源：omnimux-dsh/chatgpt-gen-loading-card.html（1:1 像素实测复刻实现）。
 * 以下数值为参考截图（510×492 逻辑视口，2x DPR）逐帧实测反推结果，
 * 本组件为深色既定视觉（固定暗色卡片），故色值不消费 --dsw-alias-* 动态主题，
 * 而是封装为本文件常量；由于 kit-export 门禁禁止 .tsx / .module.css 中出现
 * hex 与 rgb( 字面量，色值集中在此 .ts 文件并以 CSS 变量形式注入卡片根元素。
 * 唯一例外是卡片底色：实测底色与页面底同色（无层次差），已改为 .card
 * 样式声明 var(--gen-wave-card-bg, var(--dsw-alias-bg-layer-2)) 跟随
 * 宿主层级底色，故本文件不再提供卡片底色常量。
 */

export const GEN_WAVE_CONFIG = {
  COLS: 28, // 点阵列数（实测）
  ROWS: 29, // 点阵行数（实测）
  SPACING: 13.3333, // 原始参考实现点距(px)（实测 26.67@2x）；现仅作首帧占位，layout 按画布实测宽高双向反算点距铺满卡片
  PAD_X: 1, // 点阵左右留白（每边距画布边缘 1px）
  PAD_Y: 2.5, // 点阵顶部留白（首行点心距画布上缘 2.5px）
  PAD_Y_BOT: 9.5, // 底部留白加大：让进度胶囊完整落在画布内
  DOT_R_MIN: 1.15, // 波谷点半径(px)（实测直径 ~4.6@2x）
  DOT_R_MAX: 3.25, // 波峰点半径(px)（实测直径 ~13@2x）
  /* 尺寸场（周期波）：s = col + 0.8·row，λ≈26 列，波峰沿对角线扫动 */
  SIZE_LAMBDA: 28.0, // 尺寸波波长（列单位，拟合直径矩阵）
  SIZE_TILT: 0.8, // 尺寸波相位斜率 s=col+0.8·row
  SIZE_POW: 0.5, // 波形指数：|cos|^→ 平顶宽谷（拟合实测）
  SIZE_PERIOD_MS: 5200, // 尺寸波平移一个波长耗时
  /* 亮度场（单向 reveal 锋面）：s_b = col − 0.35·row，sigmoid 软边；
     参考截帧 T_b≈22.8（右上楔形 cols≈24–27 未点亮） */
  REVEAL_TILT: 0.35, // 亮度锋面相位斜率
  REVEAL_SIGMA: 0.5, // 锋面软边（列单位）
  REVEAL_PERIOD_MS: 8600, // 锋面往返扫掠耗时（31 → −10 → 31）
  REVEAL_S_MAX: 31,
  REVEAL_S_MIN: -10,
  /* 实测缺点的角位（网格自身裁角）：左上 r0c0、右上 r0c27、左下 r28c0 */
  MASKED_CELLS: [
    [0, 0],
    [27, 0],
    [0, 28],
  ] as const,
  BADGE_X_OFF: 10, // 胶囊右缘距画布右缘（实测 x403.5 贴点阵右缘外 6px→画布内 326）
  BADGE_W: 58, // 胶囊宽(px)（实测 115@2x）
  BADGE_H: 35, // 胶囊高(px)（实测 71@2x）
  BADGE_BOTTOM_GAP: 0, // 胶囊下缘贴画布底（实测 y432 = 画布底 y432）
  BADGE_FONT: 23, // 胶囊字号(px)（实测字形 ~44@2x）
  DEMO_TARGET: 96, // 演示进度缓动的目标百分比
  DEMO_MS: 12000, // 演示进度爬升到目标的时长
} as const;

/** 参考截帧定格参数：尺寸波相位 φ=10.5、亮度锋面 T=22.5（reduced-motion / 首帧）。 */
export const GEN_WAVE_FREEZE = { PHI: 10.5, T: 22.5 } as const;

/** 卡片色值（参考截图实测均值，固定深色视觉；卡片底色除外——见文件头注释）。 */
export const GEN_WAVE_COLORS = {
  /** 任务文案颜色（字形墨色实测均值 ~174-182）。 */
  status: "#b6b6b8",
  /** 图标描边与内 ›_ 符号色（实测 ~205）。 */
  icon: "#cdcdcd",
  /** 进度胶囊底（实测 33,33,33）。 */
  badgeBg: "rgb(33,33,33)",
  /** 进度百分比墨色（实测均值 ~218-226）。 */
  badgeFg: "rgb(226,226,226)",
  /** 暗点 --dot-dim（实测 ~62）。 */
  dimRgb: [62, 62, 62],
  /** 亮点 --dot-lit（实测 ~224）。 */
  litRgb: [224, 224, 224],
} as const;

export const GEN_WAVE_BADGE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif';

/** 按亮度系数 k∈[0,1] 在暗点/亮点实测色之间插值，返回 canvas fillStyle。 */
export function dotFillStyle(k: number): string {
  const [dr, dg, db] = GEN_WAVE_COLORS.dimRgb;
  const [lr, lg, lb] = GEN_WAVE_COLORS.litRgb;
  const r = Math.round(dr + (lr - dr) * k);
  const g = Math.round(dg + (lg - dg) * k);
  const b = Math.round(db + (lb - db) * k);
  return `rgb(${r},${g},${b})`;
}
