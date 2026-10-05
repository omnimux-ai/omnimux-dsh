/**
 * 账号监控瀑布流的薄适配层（spec §9.1/§9.3）。
 *
 * 与 `plugins/omnimux-assets/src/client/masonry.js` 同一范式：贪心分列决策
 * 一律调用共享核心 `distributeColumns` / `columnsForWidth`，本文件只做
 * 「内容类型 → 形态/比例/高度」的解析，绝不重写第三套算法。
 *
 * 纯函数，零 DOM、零 window：媒体区在 <img> 加载前就按数据里的比例占位
 * （§9.3 / V3 / V7），因此比例只可能来自数据字段，绝不测量 naturalWidth。
 *
 * 换行模型（R4/R5）：`rivalWrapLines` 模拟 `white-space: normal` 的词边界
 * 换行——CJK 逐字可断、连续半宽字符是不可断的词、连字符之后可断（UAX#14
 * BREAK AFTER HYPHEN）、行尾空格被吞、不换行空格（NBSP/NNBSP/WJ）不可断、
 * 超行宽的词独占一行（overflow:hidden 截断）。已知偏差写成 wrapAtoms 的
 * 文档化上界；几何正确性由真机实测承担（docs/evidence/…/harness 逐卡
 * rect 对比）。
 */

import {
  columnsForWidth as columnsForWidthCore,
  distributeColumns as distributeColumnsCore,
} from '../../../omnimux/src/client/components/library-flow/masonry-layout.js'

/** spec §9.3：最小列宽、间距、列数区间。 */
export const RIVAL_MIN_COL_WIDTH = 220
export const RIVAL_GAP = 16
export const RIVAL_MIN_COLS = 2
export const RIVAL_MAX_COLS = 6

/** spec §9.3：所有卡片最小高度（放得下约 135px 悬停层）。 */
export const RIVAL_MIN_CARD_HEIGHT = 144

/** spec §9.1：图文比例区间 4:5（最高）— 1.91:1（最宽），数据缺失回 4:5。 */
export const RIVAL_IMAGE_RATIO_MIN = 4 / 5
export const RIVAL_IMAGE_RATIO_MAX = 1.91
export const RIVAL_DEFAULT_IMAGE_RATIO = 4 / 5

const CARD_TYPES = new Set(['short-video', 'long-video', 'image', 'text', 'text-media'])
const VIDEO_RATIO = 16 / 9
const SHORT_VIDEO_RATIO = 9 / 16

/** 卡片 1px 描边（上 + 下）：估算按渲染的 border-box 高度计，含这 2px。 */
const CARD_BORDER = 2
/** 文本卡几何（§9.1/§9.3）：内边距 12×2、胶囊行 28 + 间距 8、正文行高 20。 */
const TEXT_PAD_V = 24
const PILL_ROW = 28 + 8
const BODY_LINE = 20
const TEXT_MAX_LINES = 8
const TEXT_MEDIA_BODY_LINES = 3
const TEXT_MEDIA_GAP = 10
/** 14px 正文、中文按 1 字宽计的每行字数：floor((columnWidth − 24) / 14)。 */
const TEXT_CHAR_PX = 14
/** 媒体卡标题几何（§9.1）：13px 中文字宽、行高 18、标题区左右各 12、上 10 + 下 12。 */
const TITLE_CHAR_PX = 13
const TITLE_ZONE_PAD_H = 24
const TITLE_ZONE_PAD_V = 10 + 12
const TITLE_LINE = 18
const TITLE_MAX_LINES = 2
/** 西文/数字按半宽折算的兜底系数——真机标定（14px 正文实测：均宽 8.284px）。 */
const ASCII_WIDTH_FACTOR = 0.592
/**
 * 逐字形实测宽度表（单位系数 = 字宽 ÷ 14px）。QA 逐卡审计证明「同一断行
 * 规则 + measureText 真实宽度」的行数误差全部 ≤1 行，而统一系数在
 * '#' + 短词、长 URL、全小写长词上系统性失准（e1/w12 少算 3–5 行、
 * w11 多算 4 行）。表值来自 Chrome canvas.measureText（SF Pro 14px），
 * 随 unitPx 线性缩放；表外字符回落 ASCII_WIDTH_FACTOR。
 * 重新标定命令见 harness/codepoint-probe.mjs（同页附逐字形测量）。
 */
const GLYPH_WIDTH_FACTOR = {
  ' ': 0.271, '!': 0.300, '"': 0.467, '#': 0.619, '$': 0.619, '%': 0.915,
  '&': 0.701, "'": 0.286, '(': 0.371, ')': 0.371, '*': 0.461, '+': 0.619,
  ',': 0.286, '-': 0.461, '.': 0.286, '/': 0.294, ':': 0.286, ';': 0.286,
  '<': 0.619, '=': 0.619, '>': 0.619, '?': 0.502, '@': 0.907,
  '0': 0.619, '1': 0.453, '2': 0.593, '3': 0.616, '4': 0.633,
  '5': 0.607, '6': 0.626, '7': 0.559, '8': 0.628, '9': 0.626,
  A: 0.663, B: 0.647, C: 0.705, D: 0.716, E: 0.585, F: 0.561,
  G: 0.736, H: 0.731, I: 0.257, J: 0.527, K: 0.648, L: 0.557,
  M: 0.863, N: 0.731, O: 0.761, P: 0.625, Q: 0.761, R: 0.643,
  S: 0.627, T: 0.623, U: 0.727, V: 0.663, W: 0.957, X: 0.668,
  Y: 0.645, Z: 0.651,
  '[': 0.371, '\\': 0.294, ']': 0.371, '^': 0.619, '_': 0.573, '`': 0.489,
  a: 0.541, b: 0.603, c: 0.549, d: 0.603, e: 0.561, f: 0.351,
  g: 0.599, h: 0.578, i: 0.236, j: 0.236, k: 0.532, l: 0.242,
  m: 0.859, n: 0.573, o: 0.580, p: 0.600, q: 0.599, r: 0.370,
  s: 0.513, t: 0.353, u: 0.573, v: 0.531, w: 0.764, x: 0.514,
  y: 0.532, z: 0.528,
  '{': 0.371, '|': 0.248, '}': 0.371, '~': 0.619,
}
/** 可折叠 ASCII 空白宽度系数——真机标定：14px 下空格实测 3.79px。 */
const SPACE_WIDTH_FACTOR = 0.271
/**
 * 非折叠空格的实测宽度系数（字宽 ÷ 14px，真机逐一量得）。BA 类空格不被
 * 折叠：一段连续同码位空格按个数累计宽度；普通空格/制表符整段只计一份。
 * 未列出的可断码位：ZWSP = 0，行/段分隔符不产生宽度。
 */
const SPACE_FACTOR = {
  0x1680: 0.450,
  0x2000: 0.489, 0x2002: 0.489,
  0x2001: 0.989, 0x2003: 0.989,
  0x2004: 0.322,
  0x2005: 0.239,
  0x2006: 0.155,
  0x2008: 0.286,
  0x2009: 0.130,
  0x200a: 0.060,
  0x205f: 0.211,
  0x3000: 1.0,
  // 不换行空格并入词时同样有真实宽度：NBSP 实测 3.79、NNBSP 1.82、
  // FIGURE 8.67（÷14 取近似）。
  0x00a0: 0.271,
  0x202f: 0.130,
  0x2007: 0.619,
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** 该码位是否为「词内不换行空格」：有宽度、不断行、不折叠。 */
function isNoBreakSpace(cp) {
  return cp === 0x00a0 || cp === 0x202f || cp === 0x2007
}

/**
 * 一段文本的估算占位宽度（px）。中文、全角与 CJK 标点按整宽，其余按半宽
 * 折算；零宽连接符与零宽空格不占宽度，不换行空格按各自实测宽度计。
 * @param {string} text
 * @param {number} unitPx 全角字符的字宽（正文 14、标题 13）
 */
function textWidthPx(text, unitPx) {
  let px = 0
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0)
    // 零宽连接符（BOM/WORD JOINER）与零宽空格（ZWSP）不占宽度。
    if (cp === 0xfeff || cp === 0x2060 || cp === 0x200b) continue
    if (isNoBreakSpace(cp)) {
      px += unitPx * (SPACE_FACTOR[cp] ?? SPACE_WIDTH_FACTOR)
      continue
    }
    px += unitPx * charWidthFactor(ch, cp)
  }
  return px
}

/** 半宽字符的逐字形宽度系数；>0x2E7F 返回 1（整宽），表外回落均宽。 */
function charWidthFactor(ch, cp) {
  if (cp > 0x2e7f) return 1
  return GLYPH_WIDTH_FACTOR[ch] ?? ASCII_WIDTH_FACTOR
}

/**
 * 换行原子序列：模拟 `white-space: normal`（卡片文字未设 overflow-wrap /
 * word-break）。CJK 字符（>0x2E7F，含中文与全角标点）逐字可断，各成一格；
 * 连续半宽字符（拉丁字母、数字、URL、hashtag、ASCII 标点）是不可断的
 * 「词」，整体换行；空白序列自身是一格，落在行尾时宽度被浏览器吞掉。
 *
 * 断行码位全集（R6-①，逐一与 Chrome 实测行数对齐，见 harness/
 * codepoint-probe.mjs）：
 *   - 可断空白 = CSS 文档空白 {0020,0009,000A,000D,000C}
 *     ∪ UAX#14 BA {1680,2000–2006,2008–200A,205F}
 *     ∪ ZW {200B}（零宽可断点：断行但宽度 0）
 *     ∪ BK {2028,2029}（Chrome 实测按可折叠空白处理：断行机会而非
 *       强制换行，'white-space:normal' 下与 \n 同行为）；
 *   - 不可断 = {00A0,202F,FEFF,2060,2007} —— 并入当前词；
 *   - U+000B 垂直制表 Chrome 实测不可断，按词内字符处理（它既不在 CSS 空白
 *     集也不在 BA 集）；
 *   - U+3000 全角空格归入空格原子（不可折叠、整宽、可断）；U+2011 不换行
 *     连字符留在词内；
 *   - U+002D/U+2010 连字符并入左侧词段、段后可断（R5-④：把整串当不可断词
 *     严重少算——同夹具 w1 按整词估 1 行、连字符模型 5 行、Chrome 4 行）。
 * 已知偏差（文档化上界，不假装精确）：
 *   - 行尾空格宽度被吞 → 模型可能少算一点点宽度（行数不受影响的情况
 *     远多于受影响）；
 *   - 行首禁则只覆盖 CJK 收类标点（，。、；：？！…）且只带回 1 个原子：
 *     连续多个禁则标点、行尾禁则（开类标点）未模拟 → 仍可能少算；
 *   - 宽度模型按字符分类近似 → 双向偏差：41 卡夹具里 e5 估算 182 vs
 *     实测 162（多算 20px，安全方向），e4 同向（多算 20px）。
 * @param {string} text
 * @returns {Array<{space?:boolean, collapsible?:boolean, w?:number, cjk?:boolean, word?:boolean, text?:string}>}
 *   原子形状：空白 {space, collapsible, w=unitPx 宽度系数}；
 *   CJK 字 {cjk, ch}；词段 {word, text}（宽度由 textWidthPx 计算）。
 */
function wrapAtoms(text) {
  const atoms = []
  /** 仍在累积字符的最后一个词段；null 表示下一字符要开新词。 */
  let open = null
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0)
    // 可折叠断点空白：CSS 文档空白 {space, tab, lf, cr, ff} 加上 Chrome 实测
    // 同行为的行/段分隔符 {2028,2029}（white-space:normal 下它们产生断行
    // 机会与 \n 相同，不是强制换行）。\v(000B) 不在此列——Chrome 实测它
    // 不可断、按词内字符走。
    if (cp === 0x0020 || cp === 0x0009 || cp === 0x000a || cp === 0x000d || cp === 0x000c
      || cp === 0x2028 || cp === 0x2029) {
      open = null
      atoms.push({ space: true, collapsible: true, w: SPACE_WIDTH_FACTOR })
      continue
    }
    // UAX#14 BA 空格（不可折叠、可断）：Ogham/Em/En/Thin/Hair/MMSP 等；
    // U+3000 全角空格一并归入空格原子（与 CJK 逐字分支等效：可断、整宽）。
    if (cp === 0x1680 || (cp >= 0x2000 && cp <= 0x2006) || (cp >= 0x2008 && cp <= 0x200a) || cp === 0x205f || cp === 0x3000) {
      open = null
      atoms.push({ space: true, collapsible: false, w: SPACE_FACTOR[cp] ?? SPACE_WIDTH_FACTOR })
      continue
    }
    // ZWSP：零宽可断点（BA after ZWSP 等价）。
    if (cp === 0x200b) {
      open = null
      atoms.push({ space: true, collapsible: false, w: 0 })
      continue
    }
    // 不换行空格与零宽连接符（NBSP / NNBSP / FIGURE / BOM·WJ）：不断行，
    // 有实测宽度，并入词。
    if (isNoBreakSpace(cp) || cp === 0xfeff || cp === 0x2060) {
      if (!open) {
        open = { word: true, text: '' }
        atoms.push(open)
      }
      open.text += ch
      continue
    }
    if (cp > 0x2e7f) {
      open = null
      atoms.push({ cjk: true, ch })
      continue
    }
    if (!open) {
      open = { word: true, text: '' }
      atoms.push(open)
    }
    open.text += ch
    // 连字符并入本段、段后允许断行（BREAK AFTER HYPHEN）。
    if (cp === 0x2d || cp === 0x2010) open = null
  }
  return atoms
}

/**
 * 一段文本在 lineWidth 下的估算行数（≥1）。
 * 贪心装行：逐格尝试放进当前行，放不下换行；不可断的词比行宽还长时
 * 独占一行（CSS 对溢出词是截断不是折行，overflow:hidden）；硬换行原子
 * 无条件开新行。
 * @param {string} text
 * @param {number} unitPx 全角字符的字宽（正文 14、标题 13）
 * @param {number} lineWidth 可用行宽（px）
 */
export function rivalWrapLines(text, unitPx, lineWidth) {
  // Chrome 实测在边界还有 ~0.5px 富余时也换行（亚像素 kerning/取整），
  // 0.5px 容差让「恰好放下」边界与真机一致——无容差时 p11@266 少算 1 行。
  const width = Math.max(1, (Number(lineWidth) || 0) - 0.5)
  const atoms = wrapAtoms(text)
  const widths = atoms.map((atom) =>
    atom.cjk ? unitPx : atom.word ? textWidthPx(atom.text, unitPx) : 0)
  let lines = 1
  let used = 0
  let lastAtomW = 0
  let pendingCollapsible = false
  let pendingWidth = 0
  for (let i = 0; i < atoms.length; i += 1) {
    const atom = atoms[i]
    if (atom.space) {
      if (atom.collapsible && pendingCollapsible) continue
      if (atom.collapsible) pendingCollapsible = true
      pendingWidth += atom.w * unitPx
      continue
    }
    const atomW = widths[i]
    const glue = pendingWidth > 0 && used > 0 ? pendingWidth : 0
    pendingCollapsible = false
    pendingWidth = 0
    if (used === 0) {
      // 行首空格已被浏览器吞掉；超行宽的词/字直接占这一行，不折。
      used = Math.min(atomW, width)
      lastAtomW = used
      continue
    }
    if (used + glue + atomW <= width) {
      // 行尾禁则（Chrome 实测）：开类标点不允许悬挂在行尾。它放得下、
      // 但其后的下一个内容原子（跨空白）放不下时，它随内容一起换行。
      if (atom.cjk && isLineEndForbidden(atom.ch)) {
        let nextW = 0
        let j = i + 1
        for (; j < atoms.length; j += 1) {
          const n = atoms[j]
          if (n.space) { nextW += n.w * unitPx; continue }
          nextW += widths[j]
          break
        }
        if (j < atoms.length && used + glue + atomW + nextW > width) {
          lines += 1
          used = Math.min(atomW, width)
          lastAtomW = atomW
          continue
        }
      }
      used += glue + atomW
      lastAtomW = atomW
      continue
    }
    lines += 1
    if (atom.cjk && lastAtomW > 0 && isLineStartForbidden(atom.ch)) {
      // 行首禁则：CJK 收类标点不允许出现在行首——浏览器把前一个字符
      // 一并带到下一行（p11 在 600px 档实测 8 行、无禁则模型算 7 行，
      // 正是这条规则缺位的少算）。只带回 1 个原子：连续禁则标点与
      // 词末尾的禁则场景在偏差清单里说明。
      used = Math.min(lastAtomW + atomW, width)
    } else {
      used = Math.min(atomW, width)
    }
    lastAtomW = atomW
  }
  return lines
}

/**
 * 行首禁则字符（CJK 收类标点）：浏览器断行时不允许它们落在新行首，
 * 会把前一个字符带回本行。半角 ')' ']' 等未列入——它们在 CJK 文本
 * 场景里同样禁行首，但出现率低且与词内位置耦合，留在已知偏差。
 */
function isLineStartForbidden(ch) {
  return typeof ch === 'string'
    && /[，。、；：？！）］｝》」』〞〟‥…‰％]/.test(ch)
}

/**
 * 行尾禁则字符（CJK 开类标点）：浏览器断行时不允许它们悬挂在行尾，
 * 随内容一起换行。半角 '(' '[' '{' 未列入，理由同上。
 */
function isLineEndForbidden(ch) {
  return typeof ch === 'string'
    && /[（［｛《〈「『【〔［]/.test(ch)
}

/**
 * 标题在列宽下的估算行数，按 §9.1 每类卡的截断上限收：短视频/图文 1 行、
 * 长视频 2 行。上限是 cap 不是常量——文本装一行时按一行算。
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @param {'short-video'|'long-video'|'image'} type
 */
function titleLines(card, columnWidth, type) {
  const maxLines = type === 'long-video' ? TITLE_MAX_LINES : 1
  const perLine = Math.max(1, columnWidth - TITLE_ZONE_PAD_H - CARD_BORDER)
  return Math.max(1, Math.min(maxLines, rivalWrapLines(card?.title || '', TITLE_CHAR_PX, perLine)))
}

/**
 * Host `type` + 平台 → spec §9.1 的五种卡片形态。
 *
 * `card_type` 已是五形态值时原样通过；否则按平台与媒体存在性推导：
 *   - video 平台维度：tiktok/instagram/reels → short-video，youtube → long-video；
 *   - instagram 的 image → image；
 *   - X 的 tweet：有内嵌媒体 → text-media，否则 → text。
 * 未知行回退到最高的 short-video——放错列的代价小于把媒体卡压扁。
 * @param {Record<string, any>} card
 * @returns {'short-video'|'long-video'|'image'|'text'|'text-media'}
 */
export function rivalCardTypeOf(card) {
  const declared = String(card?.card_type || '')
  if (CARD_TYPES.has(declared)) return declared
  const platform = String(card?.source_platform || card?.account?.platform || '').toLowerCase()
  const kind = String(card?.type || '').toLowerCase()
  const hasMedia = card?.has_media === true
    || String(card?.cover_src || card?.cover_key || '') !== ''
    || String(card?.video_url || '') !== ''

  if (platform === 'x' || platform === 'twitter' || platform === 'threads') {
    // A declared image/video type IS media presence, even when no cover made it
    // into the row yet — the card keeps the text-media shape and renders the
    // dark placeholder rather than collapsing to a bare text card.
    if (kind === 'video' || kind === 'image') return 'text-media'
    return hasMedia ? 'text-media' : 'text'
  }
  if (platform === 'youtube') return 'long-video'
  if (platform === 'instagram' || platform === 'pinterest') {
    return kind === 'video' ? 'short-video' : 'image'
  }
  if (platform === 'tiktok' || platform === 'douyin' || platform === 'kuaishou') {
    return 'short-video'
  }
  if (kind === 'video') return 'short-video'
  if (kind === 'image') return 'image'
  return 'short-video'
}

/**
 * spec §9.1 媒体宽高比（宽 / 高）。
 * `image` 与图片型 `text-media` 读 `card.ratio` 并裁到 [4:5, 1.91:1]；
 * 缺失回 4:5。`text` 没有媒体，返回值仅作调用方兜底，不代表媒体。
 * @param {Record<string, any>} card
 * @returns {number}
 */
export function rivalMediaRatioOf(card) {
  const type = rivalCardTypeOf(card)
  if (type === 'short-video') return SHORT_VIDEO_RATIO
  if (type === 'long-video') return VIDEO_RATIO
  if (type === 'text-media') {
    if (String(card?.media_kind || '') === 'image') {
      return clamp(validRatio(card?.ratio), RIVAL_IMAGE_RATIO_MIN, RIVAL_IMAGE_RATIO_MAX)
    }
    return VIDEO_RATIO
  }
  if (type === 'image') {
    return clamp(validRatio(card?.ratio), RIVAL_IMAGE_RATIO_MIN, RIVAL_IMAGE_RATIO_MAX)
  }
  return SHORT_VIDEO_RATIO
}

function validRatio(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : RIVAL_DEFAULT_IMAGE_RATIO
}

/**
 * 分列用比例：媒体类就是媒体比；纯文本卡是「列宽 ÷ 估算高度」反解的等效
 * 比例（资产层 MASONRY_AUDIO_RATIO 的同款手法）。放置决策已经不再走它——
 * `rivalPlacements` 经 `heightOf` 直接用 `rivalCardHeightPx`——保留导出
 * 供需要比例视角的调用方与契约测试使用。
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @returns {number}
 */
export function rivalRatioOf(card, columnWidth) {
  if (rivalCardTypeOf(card) === 'text') {
    return columnWidth / rivalCardHeightPx(card, columnWidth)
  }
  return rivalMediaRatioOf(card)
}

/** 文本卡估算正文行数：按词边界换行模型，1–8 行（空文本仍占 1 行）。 */
function textBodyLines(card, columnWidth) {
  const text = String(card?.title || '')
  if (textWidthPx(text, TEXT_CHAR_PX) === 0) return 1
  const perLine = Math.max(1, columnWidth - CARD_BORDER - TEXT_PAD_V)
  return Math.max(1, Math.min(TEXT_MAX_LINES, rivalWrapLines(text, TEXT_CHAR_PX, perLine)))
}

/**
 * 胶囊行存在性的唯一判据：渲染层（pill-row 是否渲染）与估算层（是否预留
 * 36px）必须共用同一个谓词——`velocity` 是对象但 `text` 为空时
 * `VelocityPill` 返回 null，该行整行不应出现（§9.1「仅在有胶囊时渲染该行」）。
 */
export const rivalHasPill = (card) => Boolean(card?.velocity && String(card.velocity.text || '') !== '')
const hasPill = rivalHasPill

/**
 * 一张卡的估算高度（px，border-box，含上下各 1px 描边）。
 * 所有结果满足 ≥ 144px（§9.3 悬停层高度）。
 *
 * 这是本文件唯一的高度真源：`rivalPlacements` 的分列决策与 `top` 累加、
 * `RivalMasonry` 的容器高都消费同一个数——不再经过共享核心的
 * 「比例 → 卡身系数」换算（那是灵感库的口径，不是这个卡的几何）。
 * - `text`：24 + (胶囊?36) + 正文行数×20 + 描边 2
 * - `text-media`：24 + (胶囊?36) + 正文行数(≤3)×20 + 10 + (内宽−24) ÷ 媒体比 + 描边 2
 * - 媒体类：内宽 ÷ 媒体比 + 标题区(22 + 行数×18) + 描边 2；
 *   行数按真实换行估（≤2），不再恒取截断上限
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @returns {number}
 */
export function rivalCardHeightPx(card, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const inner = Math.max(0, w - CARD_BORDER)
  const type = rivalCardTypeOf(card)
  if (type === 'text') {
    const lines = textBodyLines(card, w)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + (hasPill(card) ? PILL_ROW : 0) + lines * BODY_LINE + CARD_BORDER)
  }
  if (type === 'text-media') {
    const lines = Math.min(TEXT_MEDIA_BODY_LINES, textBodyLines(card, w))
    const mediaH = (inner - TEXT_PAD_V) / rivalMediaRatioOf(card)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + (hasPill(card) ? PILL_ROW : 0) + lines * BODY_LINE + TEXT_MEDIA_GAP + mediaH + CARD_BORDER)
  }
  const lines = titleLines(card, w, type)
  return Math.max(RIVAL_MIN_CARD_HEIGHT, inner / rivalMediaRatioOf(card) + TITLE_ZONE_PAD_V + lines * TITLE_LINE + CARD_BORDER)
}

/**
 * 容器宽度 → 列数。`columnsForWidth` 代入 §9.3 常量后与规格公式
 * `max(2, min(6, floor((W + 16) / 236)))` 逐字等价。
 * @param {number} containerWidth
 * @returns {number}
 */
export function rivalColumnsForWidth(containerWidth) {
  return columnsForWidthCore(containerWidth, {
    minColWidth: RIVAL_MIN_COL_WIDTH,
    gap: RIVAL_GAP,
    minCols: RIVAL_MIN_COLS,
    maxCols: RIVAL_MAX_COLS,
  })
}

/**
 * 列宽（等分，§9.3）。
 * @param {number} containerWidth
 * @param {number} columns
 * @returns {number}
 */
export function rivalColumnWidth(containerWidth, columns) {
  const n = Math.max(RIVAL_MIN_COLS, Math.floor(Number(columns)) || RIVAL_MIN_COLS)
  return (containerWidth - RIVAL_GAP * (n - 1)) / n
}

/**
 * 逐张放入放置前底边最高的列（最短列；等高取最左）。
 *
 * 贪心决策调用共享核心，但**决策与 `top` 累加用同一个高度函数**：
 * `rivalCardHeightPx + RIVAL_GAP`。核心默认的「比例 → 卡身系数」口径只服务
 * 灵感库，直接拿它做放置会把两张卡的相对高度排错（两套度量的差值随卡型
 * 变化，错误只在 ≥2 排卡时才显形）。
 *
 * @param {Array<Record<string, any>>} cards
 * @param {number} columns
 * @param {number} columnWidth
 * @returns {{ placements: Map<string, {col:number, top:number, height:number}>, height: number, columnHeights: number[] }}
 */
export function rivalPlacements(cards, columns, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const list = Array.isArray(cards) ? cards : []
  const buckets = distributeColumnsCore(
    list,
    columns,
    undefined,
    (card) => rivalCardHeightPx(card, w) + RIVAL_GAP,
  )
  const placements = new Map()
  const columnHeights = []
  for (let col = 0; col < buckets.length; col += 1) {
    let top = 0
    for (const card of buckets[col]) {
      const height = rivalCardHeightPx(card, w)
      placements.set(placementKey(card), { col, top, height })
      top += height + RIVAL_GAP
    }
    columnHeights[col] = Math.max(0, top - RIVAL_GAP)
  }
  return {
    placements,
    height: columnHeights.length ? Math.max(...columnHeights) : 0,
    columnHeights,
  }
}

function placementKey(card) {
  return String(card?.id ?? '')
}
