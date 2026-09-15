/**
 * @file plugins/omnimux-market/src/client/plaza/pixel-avatar-constants.js
 * 像素头像（Pixel Art Avatar）的调色板与像素几何数据。
 *
 * 本模块是纯数据真源（无逻辑、无副作用），被 pixel-avatar.js 消费。
 * 这里是设计规范里「常量/数据文件」的豁免位：像素艺术必须使用固定调色板与固定像素坐标，
 * 不能改用主题 Token——同一张头像要在 <img src="data:…"> 的独立 SVG 文档里渲染，
 * 那里没有宿主 CSS 变量上下文；且皮肤/发色属于角色美术配色，不是 UI 语义色。
 * 因此本文件按规范以数据表形式集中收口，逻辑文件 pixel-avatar.js 内不出现任何裸色值。
 */

/** 像素网格边长：16x16 是复古 8-bit 头像的经典规格。 */
export const PIXEL_AVATAR_GRID = 16

/** 默认渲染尺寸（CSS 像素）。16x16 网格放大到 96 为 6 倍整数缩放，像素边界最锐利。 */
export const PIXEL_AVATAR_DEFAULT_RENDER_SIZE = 96

/** 肤色：base 底色、shade 耳廓/颈部/下颌阴影、blush 腮红。 */
export const PIXEL_AVATAR_SKIN_TONES = [
  { base: '#f8dcc0', shade: '#e3b899', blush: '#efa394' },
  { base: '#f2cda6', shade: '#d9ab84', blush: '#e5998d' },
  { base: '#e6b98c', shade: '#c99a6c', blush: '#d98679' },
  { base: '#d3a171', shade: '#b48454', blush: '#c97668' },
  { base: '#bb8355', shade: '#9b6740', blush: '#b06a58' },
  { base: '#96603a', shade: '#774924', blush: '#8f5340' },
  { base: '#6f4529', shade: '#553219', blush: '#6d4030' },
]

/** 发色：base 主色、shade 暗部、highlight 高光。 */
export const PIXEL_AVATAR_HAIR_COLORS = [
  { base: '#33303a', shade: '#211f27', highlight: '#4d4a58' },
  { base: '#4a3526', shade: '#33241a', highlight: '#6d563c' },
  { base: '#7c4a28', shade: '#5c351b', highlight: '#a76d3c' },
  { base: '#d9ab4c', shade: '#b4882f', highlight: '#f2d07c' },
  { base: '#a8442c', shade: '#832f1e', highlight: '#cd6b4a' },
  { base: '#9aa2ab', shade: '#767d86', highlight: '#c6ccd3' },
  { base: '#e9e7e2', shade: '#c2bfb9', highlight: '#ffffff' },
  { base: '#3d5fa8', shade: '#2c4680', highlight: '#6f8dd2' },
  { base: '#8a5ab0', shade: '#6a4190', highlight: '#ac81d0' },
  { base: '#3f8f6a', shade: '#2d6b4e', highlight: '#66b58e' },
  { base: '#c85a8a', shade: '#a03f6b', highlight: '#e28fb4' },
]

/** 服装配色：base 主体、shade 侧缘与下摆、collar 领口。帽子也会从这份配色里取色。 */
export const PIXEL_AVATAR_CLOTHING = [
  { base: '#3b5b8c', shade: '#2c4570', collar: '#e8eef7' },
  { base: '#2f8f8a', shade: '#206e6a', collar: '#eaf6f5' },
  { base: '#b8443c', shade: '#8f322c', collar: '#f8ece9' },
  { base: '#d9a03c', shade: '#b07d26', collar: '#fdf3e0' },
  { base: '#3f7d52', shade: '#2d5f3c', collar: '#ecf5ee' },
  { base: '#6b4f9e', shade: '#513a7a', collar: '#f0ecf8' },
  { base: '#4c5566', shade: '#383f4d', collar: '#eef1f5' },
  { base: '#d4708f', shade: '#b05470', collar: '#fdeef3' },
  { base: '#7a8b3f', shade: '#5d6b2c', collar: '#f5f8e9' },
  { base: '#7a5a3f', shade: '#5d422c', collar: '#f7f0e9' },
  { base: '#3f8fb0', shade: '#2c6c88', collar: '#eaf5fa' },
  { base: '#d97a3c', shade: '#ad5c26', collar: '#fdf0e6' },
]

/** 背景：柔和谐调的低饱和底色，accent 用于点缀像素。 */
export const PIXEL_AVATAR_BACKGROUNDS = [
  { base: '#eef2f7', accent: '#dbe3ee' },
  { base: '#f7f0e8', accent: '#ebdfd2' },
  { base: '#eaf4ee', accent: '#d7e8df' },
  { base: '#f4ecf6', accent: '#e5d7ea' },
  { base: '#eaf3f8', accent: '#d5e6f1' },
  { base: '#fdf3de', accent: '#f1e2c3' },
  { base: '#f8ecf1', accent: '#ecd8e2' },
  { base: '#eff1e5', accent: '#dee2ce' },
  { base: '#edeff7', accent: '#d9ddf0' },
  { base: '#f1f5ea', accent: '#e0e9d2' },
]

/** 眼睛配色：瞳孔与高光。 */
export const PIXEL_AVATAR_EYE_COLORS = [
  { eye: '#2b2f3a', glint: '#ffffff' },
  { eye: '#43301f', glint: '#fdf6e3' },
  { eye: '#2f4a63', glint: '#eaf4ff' },
  { eye: '#3c2b3f', glint: '#f6e9f7' },
  { eye: '#26402f', glint: '#ecf7ee' },
]

/** 配件与细节色。 */
export const PIXEL_AVATAR_ACCESSORY_COLORS = {
  frame: '#3a3f4a',
  lens: '#2b3040',
  gold: '#e7b73f',
}

/** 咧嘴笑露出的牙齿像素。 */
export const PIXEL_AVATAR_TOOTH_COLOR = '#fdfdfd'

/**
 * 发型（含帽子）几何：坐标为像素网格，[x0, x1, y] 表示该行 x0..x1 的横向游程。
 * base 主体、shade 暗部、highlight 高光、brim 帽檐/帽边、hair 帽下露出的头发（始终用发色绘制）。
 * hat 为 true 时 base/shade/highlight/brim 改用帽子配色。
 */
export const PIXEL_AVATAR_HAIR_STYLES = {
  short: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 4, 5], [11, 11, 5], [4, 4, 6], [11, 11, 6]],
    shade: [[4, 4, 4], [11, 11, 4], [4, 4, 5], [11, 11, 5], [4, 4, 6], [11, 11, 6], [5, 5, 2], [10, 10, 2]],
    highlight: [[6, 7, 3]],
  },
  buzz: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4]],
    shade: [[5, 5, 3], [10, 10, 3], [4, 4, 4], [11, 11, 4], [4, 4, 5], [11, 11, 5]],
    highlight: [[7, 8, 2]],
  },
  slick: {
    base: [[7, 8, 1], [6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 4, 5], [11, 11, 5]],
    shade: [[4, 4, 4], [11, 11, 4], [7, 7, 2], [7, 7, 3], [7, 7, 4]],
    highlight: [[6, 8, 1], [5, 6, 2]],
  },
  curly: {
    base: [[6, 7, 1], [9, 10, 1], [5, 6, 2], [8, 11, 2], [4, 5, 3], [9, 11, 3], [4, 11, 4], [3, 4, 5], [11, 12, 5], [3, 4, 6], [11, 12, 6]],
    shade: [[3, 3, 5], [3, 3, 6], [12, 12, 5], [12, 12, 6], [4, 4, 4]],
    highlight: [[6, 7, 1]],
  },
  bangs: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 11, 5], [4, 5, 6], [7, 8, 6], [10, 11, 6]],
    shade: [[4, 4, 4], [11, 11, 4], [4, 4, 5], [11, 11, 5], [4, 4, 6], [11, 11, 6]],
    highlight: [[6, 8, 3]],
  },
  long: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 11, 5], [4, 5, 6], [7, 8, 6], [10, 11, 6], [3, 3, 7], [3, 3, 8], [3, 3, 9], [3, 3, 10], [12, 12, 7], [12, 12, 8], [12, 12, 9], [12, 12, 10]],
    shade: [[3, 3, 7], [3, 3, 8], [3, 3, 9], [3, 3, 10], [12, 12, 7], [12, 12, 8], [12, 12, 9], [12, 12, 10], [4, 4, 5], [11, 11, 5]],
    highlight: [[6, 8, 3]],
  },
  ponytail: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 4, 5], [11, 11, 5], [12, 13, 4], [13, 14, 5], [13, 14, 6], [12, 12, 7]],
    shade: [[13, 13, 5], [13, 13, 6], [12, 12, 7], [4, 4, 4], [11, 11, 4]],
    highlight: [[6, 8, 3], [12, 13, 4]],
  },
  bun: {
    base: [[6, 9, 2], [5, 10, 3], [4, 11, 4], [4, 4, 5], [11, 11, 5], [6, 9, 0], [7, 8, 1]],
    shade: [[7, 7, 1], [6, 6, 0], [9, 9, 0], [4, 4, 4], [11, 11, 4]],
    highlight: [[7, 8, 0]],
  },
  mohawk: {
    base: [[7, 8, 0], [7, 8, 1], [6, 9, 2], [6, 9, 3]],
    shade: [[6, 6, 2], [6, 6, 3], [9, 9, 2], [9, 9, 3], [4, 5, 4], [10, 11, 4]],
    highlight: [[7, 7, 0]],
  },
  cap: {
    hat: true,
    base: [[6, 9, 1], [5, 10, 2], [4, 11, 3]],
    shade: [[4, 4, 3], [11, 11, 3], [5, 5, 2], [10, 10, 2]],
    highlight: [[6, 8, 1]],
    brim: [[3, 12, 4]],
    hair: [[4, 4, 5], [11, 11, 5], [5, 10, 5]],
  },
  beanie: {
    hat: true,
    base: [[6, 9, 0], [5, 10, 1], [4, 11, 2]],
    shade: [[4, 4, 2], [11, 11, 2]],
    highlight: [[6, 8, 0]],
    brim: [[4, 11, 3]],
    hair: [[4, 11, 4], [4, 4, 5], [11, 11, 5]],
  },
  bucket: {
    hat: true,
    base: [[5, 10, 1], [4, 11, 2]],
    shade: [[4, 4, 2], [11, 11, 2]],
    highlight: [[6, 9, 1]],
    brim: [[2, 13, 3]],
    hair: [[4, 11, 4], [4, 4, 5], [11, 11, 5]],
  },
}

/**
 * 眼睛与微表情：[x0, x1, y] 用瞳孔色绘制，pixel 用 [x, y] 单像素，glint 用高光色绘制。
 * 左右眼各占 2 像素宽（x=5..6 与 x=9..10），行 y=7..8。
 */
export const PIXEL_AVATAR_EYE_STYLES = {
  round: {
    eye: [[5, 6, 7], [5, 6, 8], [9, 10, 7], [9, 10, 8]],
    glint: [[5, 7], [9, 7]],
  },
  happy: {
    pixel: [[5, 8], [6, 7], [9, 7], [10, 8]],
  },
  sleepy: {
    eye: [[5, 6, 8], [9, 10, 8]],
  },
  wink: {
    eye: [[5, 6, 7], [5, 6, 8], [9, 10, 8]],
    glint: [[5, 7]],
  },
}

/** 嘴型：line 为唇线游程，pixel 为单像素收尾，tooth 用牙齿色绘制。 */
export const PIXEL_AVATAR_MOUTH_STYLES = {
  smile: {
    line: [[7, 8, 10]],
    pixel: [[6, 11], [9, 11]],
  },
  grin: {
    line: [[6, 9, 10]],
    tooth: [[7, 10]],
  },
  neutral: {
    line: [[7, 8, 10]],
  },
  smirk: {
    pixel: [[8, 10], [9, 9]],
  },
}

/** 胡须（始终用发色绘制）。 */
export const PIXEL_AVATAR_FACIAL_HAIR = {
  none: {},
  mustache: {
    base: [[5, 6, 9], [9, 10, 9]],
  },
  beard: {
    base: [[5, 6, 9], [9, 10, 9], [5, 5, 10], [10, 10, 10], [6, 9, 11]],
    shade: [[4, 4, 10], [11, 11, 10]],
  },
  stubble: {
    shade: [[5, 5, 10], [9, 9, 10], [6, 6, 11], [7, 7, 11], [8, 8, 11]],
  },
}

/**
 * 眼镜 / 墨镜 / 耳机 / 耳饰：frame 用框体色（耳饰用金色），lens 用镜片色。
 */
export const PIXEL_AVATAR_ACCESSORIES = {
  none: {},
  glasses: {
    frame: [[4, 7, 6], [8, 11, 6], [4, 7, 9], [8, 11, 9], [4, 4, 7], [4, 4, 8], [7, 7, 7], [7, 7, 8], [8, 8, 7], [8, 8, 8], [11, 11, 7], [11, 11, 8]],
  },
  sunglasses: {
    frame: [[4, 11, 7], [4, 11, 8], [3, 3, 7], [12, 12, 7]],
    lens: [[5, 10, 7]],
  },
  headphones: {
    frame: [[2, 3, 6], [2, 3, 7], [2, 3, 8], [12, 13, 6], [12, 13, 7], [12, 13, 8], [5, 10, 1]],
    lens: [[2, 2, 7], [13, 13, 7]],
  },
  earring: {
    frame: [[3, 3, 9], [12, 12, 9]],
  },
}

/** 会遮住眼睛的配件：闭眼/眨眼表情会与镜框打架，需退回标准圆眼。 */
export const PIXEL_AVATAR_EYE_COVERING_ACCESSORIES = ['sunglasses', 'headphones']
