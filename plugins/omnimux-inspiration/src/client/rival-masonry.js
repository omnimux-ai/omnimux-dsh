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
 * 逐字形实测宽度表（单位系数 = 字宽 ÷ 14px），导出供套件锁表断言。
 * 字体前提（R7-④/QA B-4）：表值按 SF Pro / -apple-system 14px 标定，
 * 仅在渲染侧用同一字体栈（.omnimux-rival-card-text/.omnimux-rival-card-title
 * 显式声明的 --font-family 栈）时有效；换字体族必须用
 * harness/codepoint-probe.mjs 重新标定——同批字形在 generic sans 偏
 * 0.87px/字、Courier 5.1px/字，足以翻转行数。QA 逐卡审计证明「同一断行
 * 规则 + measureText 真实宽度」的行数误差全部 ≤1 行，而统一系数在
 * '#' + 短词、长 URL、全小写长词上系统性失准（e1/w12 少算 3–5 行、
 * w11 多算 4 行）。表值来自 Chrome canvas.measureText（SF Pro 14px），
 * 随 unitPx 线性缩放；表外字符回落 ASCII_WIDTH_FACTOR。
 * 重新标定命令见 harness/codepoint-probe.mjs（同页附逐字形测量）。
 */
export const RIVAL_GLYPH_WIDTH_FACTOR = {
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
  // U+2E3B ⸻（THREE-EM DASH）：Chrome 实测字形宽 36.56px @14px（系数
  // 2.611），断行按「独立一格、前后皆可断」建模（见 wrapAtoms 内注释）。
  '⸻': 2.611,
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


/**
 * UAX#14「断后」码位全集（词内可断后）：官方 LineBreak.txt 按类枚举——
 *   EX（叹问号族，Chrome 定制除外 0x0021：真机实测 '!' 之后不断行，
 *     与 '?' 同类不同行为，QA Q1 的定点实验证实 '?' 断 '!' 不断）；
 *   另有 BA 的 0x007C 同为 Chrome 定制（真机不断后，已排除并登记）。
 *   HH/HY/B2（连字符族：002D、2010、00AD、058A、05BE、1400、2013 属 BA、
 *     2014 属 B2、2E17、2E40、2E3A、2E3B、2E5D、10D6E、10EAD）；
 *   BA 非空格成员（danda/节标点/断点符号：0964…、2027、2800、
 *     2E0E–2E4F 子集、各文字分隔符，含 astral 面码位；007C 例外见上）。
 * BA 空格成员（1680/2000–2006/2008–200A/205F/3000）与 0009 不在这里——
 * 它们走前面的空格原子分支，宽度按 SPACE_FACTOR 计。
 * 集合按「断后」语义使用：并入左侧词段、段后允许断行（与连字符同形）。
 * 类归属与 Chrome 实测对照见 harness/codepoint-probe.mjs（R7 扩到全集）。
 * 计数口径（#3166-⑤，R9-② 重核）：实收 133 条 = LineBreak.txt **18.0.0**
 * 官方 EX∪HH∪HY∪B2∪BA 非空格全集 306 减 Chrome 定制 {0x0021, 0x007C}、
 * 减恒不可达的 >0x2E7F 成员 172 条、加回 QU 断后码位 0x201D（经 word
 * 原子路径断后，真机实测 5 词夹具 5 行）。——它们被 CJK 分支（cp > 0x2E7F）
 * 先行拦截，词段判定永远走不到；R8 删掉「非 CJK 守卫」后这段成了死码
 * 并顺带把 168 个非 CJK 高码位标点的断行语义静默改成了「逐字可断」，
 * 删出集合即恢复「断后码位」集合的真实适用范围。版本漂移须重跑差集；
 * 仅新增 ≤0x2E7F 断后码位应回到本集合。
 */
const BREAK_AFTER = new Set([
  0x002d, 0x003f, 0x00ad, 0x058a, 0x05be, 0x05c6, 0x061b, 0x061d, 0x061e, 0x061f,
  0x06d4, 0x07f9, 0x0964, 0x0965, 0x0e5a, 0x0e5b, 0x0f0b, 0x0f0d, 0x0f0e, 0x0f0f,
  0x0f10, 0x0f11, 0x0f14, 0x0f34, 0x0f7f, 0x0f85, 0x0fbe, 0x0fbf, 0x0fd2, 0x104a,
  0x104b, 0x1361, 0x1400, 0x16eb, 0x16ec, 0x16ed, 0x1735, 0x1736, 0x17d4, 0x17d5,
  0x17d8, 0x17da, 0x1802, 0x1803, 0x1804, 0x1805, 0x1808, 0x1809, 0x1944, 0x1945,
  0x1b4e, 0x1b4f, 0x1b5a, 0x1b5b, 0x1b5d, 0x1b5e, 0x1b5f, 0x1b60, 0x1b7d, 0x1b7e,
  0x1b7f, 0x1c3b, 0x1c3c, 0x1c3d, 0x1c3e, 0x1c3f, 0x1c7e, 0x1c7f, 0x2010, 0x2012,
  0x2013, 0x2014, 0x201d, 0x2027, 0x2056, 0x2058, 0x2059, 0x205a, 0x205b, 0x205d,
  0x205e,
  0x2762, 0x2763, 0x2800, 0x2cf9, 0x2cfa, 0x2cfb, 0x2cfc, 0x2cfe, 0x2cff, 0x2d70,
  0x2e0e, 0x2e0f, 0x2e10, 0x2e11, 0x2e12, 0x2e13, 0x2e14, 0x2e15, 0x2e17, 0x2e19,
  0x2e2a, 0x2e2b, 0x2e2c, 0x2e2d, 0x2e2e, 0x2e30, 0x2e31, 0x2e33, 0x2e34, 0x2e3a,
  0x2e3b, 0x2e3c, 0x2e3d, 0x2e3e, 0x2e40, 0x2e41, 0x2e43, 0x2e44, 0x2e45, 0x2e46,
  0x2e47, 0x2e48, 0x2e49, 0x2e4a, 0x2e4c, 0x2e4e, 0x2e4f, 0x2e53, 0x2e54, 0x2e5d,
  0x2e60, 0x2e61
])

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
    px += unitPx * charWidthFactor(ch)
  }
  return px
}

/** 半宽字符的逐字形宽度系数；表外回落均宽（词段不含 >0x2E7F 码位）。 */
function charWidthFactor(ch) {
  return RIVAL_GLYPH_WIDTH_FACTOR[ch] ?? ASCII_WIDTH_FACTOR
}

/**
 * 换行原子序列：模拟 `white-space: normal`（卡片文字未设 overflow-wrap /
 * word-break）。CJK 字符（>0x2E7F，含中文与全角标点）逐字可断，各成一格；
 * 连续半宽字符（拉丁字母、数字、URL、hashtag、ASCII 标点）是不可断的
 * 「词」，整体换行；空白序列自身是一格，落在行尾时宽度被浏览器吞掉。
 *
 * 断行码位全集（R6-① + R7-① 扩到断后全集，逐一与 Chrome 实测行数对齐，
 * 见 harness/codepoint-probe.mjs 与套件内 UAX#14 类表断言）：
 *   - 可断空白 = CSS 文档空白 {0020,0009,000A,000D}
 *     ∪ UAX#14 BA {1680,2000–2006,2008–200A,205F}
 *     ∪ ZW {200B}（零宽可断点：断行但宽度 0）
 *     ∪ BK {2028,2029}（Chrome 实测按可折叠空白处理：断行机会而非
 *       强制换行，'white-space:normal' 下与 \n 同行为）；
 *   - 断后码位 = BREAK_AFTER 的 ≤0x2E7F 成员（EX{!} ∪ HH/HY/B2 ∪ BA 非
 *     空格成员的半宽段）：并入左侧词段、段后允许断行；'?' 是 URL 查询串
 *     的唯一断点（QA Q1），'!' 是 Chrome 定制——同类 EX 但实测不断，
 *     已排除并登记分歧；>0x2E7F 的官方断后成员由 CJK 分支承载；
 *   - U+2E3B ⸻ 自成一格：Chrome 实测前后皆可断（双向断点），宽度按
 *     字形表真实值——并入词段（断后）会把 5 词夹具算成 5 行、按整词
 *     处理只得 1 行，而真机是 9 行；
 *   - 不可断 = {00A0,202F,FEFF,2060,2007} —— 并入当前词；
 *   - U+000B 垂直制表与 U+000C 换页 Chrome 实测均不断行，按词内字符处理
 *     （R7-Q2：000C 曾被注释为「CSS 文档空白」并当断点，与真机不符，
 *     已对齐）；
 *   - U+3000 全角空格归入空格原子（不可折叠、整宽、可断）；U+2011 不换行
 *     连字符留在词内；
 *   - U+002D/U+2010 连字符并入左侧词段、段后可断（R5-④：把整串当不可断词
 *     严重少算——同夹具 w1 按整词估 1 行、连字符模型 5 行、Chrome 4 行；
 *     F-1 注：测试文件里「整词模型 1 行 / 生产 196px 实测 4 行」的
 *     旧注释数字不可复现（该断言实际跑 194px、Chrome 4 行），已改为
 *     可复现口径）。
 * 已知偏差（文档化上界，不假装精确）：
 *   - 行尾空格宽度被吞 → 模型可能少算一点点宽度（行数不受影响的情况
 *     远多于受影响）；
 *   - 行首禁则只覆盖 CJK 收类标点（，。、；：？！… 等）：放不下时前一
 *     CJK 字与标点一起下行（拉回，只带回 1 个原子——前驱是不可断词
 *     原子时标点留行尾，行数与悬挂同形）；连续多个禁则标点仍可能少算；
 *     行尾禁则（开类标点）已实现——该旧注曾误写「行尾禁则未模拟」
 *     （#3166-⑥ 修正）；
 *   - 宽度模型按字符分类近似 → 双向偏差：41 卡夹具里 e5 估算 182 vs
 *     实测 162（多算 20px，安全方向），e4 同向（多算 20px）；
 *   - U+2E3B ⸻（THREE-EM DASH）Chrome 实测前后皆可断、字形宽
 *     36.56px——已按「独立一格、双向可断 + 实测宽度」建模，探针行数
 *     与真机一致（#3166-⑦/R9 复核）；
 *     社交内容常见 U+2764 ❤（−4.454）、U+2192 →（−4.242）、emoji（−4.0）
 *     为低估方向，U+200D ZWJ（+8.288）与 U+2011（+1.835）为安全方向，
 *     最坏低估是 U+2E3B 自身宽度差 −28.271px（#3166-④ 实测口径）。
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
    // 可折叠断点空白：CSS 文档空白 {space, tab, lf, cr} 加上 Chrome 实测
    // 同行为的行/段分隔符 {2028,2029}（white-space:normal 下它们产生断行
    // 机会与 \n 相同，不是强制换行）。\v(000B) 与 \f(000C) 不在此列——
    // UAX#14 把 000B/000C 列进 BK（强制换行），但 Chrome 实测两者都不断行
    //（R7 探针 chrome=1），模型按真机不按规范名头（Q2 修正：曾把 FF 当
    // 断点，真机不断）。
    if (cp === 0x0020 || cp === 0x0009 || cp === 0x000a || cp === 0x000d
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
    // U+2E3B ⸻（THREE-EM DASH）：Chrome 实测前后皆可断（B2 在真机的
    // 行为是「自成一格」而不是「并入前词段」），按独立 word 原子处理，
    // 宽度走字形表 2.611 系数。
    if (cp === 0x2e3b) {
      open = null
      atoms.push({ word: true, text: ch })
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
    // 断后码位并入本段、段后允许断行（BREAK AFTER HYPHEN 泛化到
    // UAX#14 断后全集：EX{!} ∪ HH/HY/B2 ∪ BA 非空格成员中的 ≤0x2E7F 段，
    // 见 BREAK_AFTER——>0x2E7F 成员走上面的 CJK 分支，永远到不了这里）。
    // 断后语义不区分 CJK/非 CJK 上下文——R7 的「非 CJK 守卫」经 QA 反证
    // 既无益于其声称要修的 20px 高估（无夹具可复现）、又是新高估成因
    //（把全角 ？！ 粘进后续拉丁词），R8 已整条移除（#3166 决策一）；
    // 全角 ？！ 的断后效果由 CJK 逐字可断自身承载，行数断言见套件
    //「<CJK>？<拉丁词>」用例。
    // 反例钉住：'/' ',' ':' '.' '#' '@' '%' 与 '!'(0x0021) 之后 Chrome
    // 实测不断行，绝不加进来（Q1 实验：换 '/'、'+' 仍少算，换 '-' 才一致）。
    if (BREAK_AFTER.has(cp)) open = null
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
  // Chrome 的装入边界是行宽本身（整数容器下恰宽即放下）。R8-R9 的 -0.5
  // 容差在恰好整宽时多折一行（中中中中中･@28 Chrome 3 行模型曾给 4 行），
  // R10 逐行内容复核后移除；kensoku 判定也以行宽本身为准（伪装入分支）。
  const width = Math.max(1, Number(lineWidth) || 0)
  const atoms = wrapAtoms(text)
  // 半角组标点（｡､･，FF61/64/65）行中即半 advance（Chrome 实测
  // 中･ab@40 单行），与全角收类标点的整 advance 分开计；此表只管
  // 宽度计量，R11 起它们的行首禁则语义是拉回（见语义表注释）。
  const widths = atoms.map((atom) =>
    atom.cjk
      ? (LINE_START_HALFWIDTH_HANG.has(atom.ch.codePointAt(0)) ? unitPx / 2 : unitPx)
      : atom.word ? textWidthPx(atom.text, unitPx) : 0)
  let lines = 1
  let used = 0
  let lastAtomW = 0
  let lineStart = 0
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
      lineStart = i
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
          lineStart = i
          continue
        }
      }
      used += glue + atomW
      lastAtomW = atomW
      continue
    }
    if (atom.cjk && lastAtomW > 0 && isLineStartForbidden(atom.ch)) {
      // 行首禁则按码位分（R10，QA 收口复验逐行内容口径）：
      //   · 恰宽即放下——Chrome 装入边界是行宽本身（中中，@42 = 2 行：
      //     42≤42 走正常装入路径，不进禁则判定）；
      //   · 悬挂组（LINE_START_HANG）——ink（半 advance）不越行宽就挂
      //     行尾；挂不下时同样把行尾单元整体带下行（中中中中））@63：
      //     首 ） 挂下、第二个挂不下 → 中）+run 一起落下一行）；
      //   · 拉回组（LINE_START_PULLBACK，R11 起含 ｡､･）——行尾最近的
      //     非禁则原子（CJK 字或不可断词）连同尾部禁则 run 一起下行
      //     （中文中文，word @60 → 文，word / 中中｡@32 → 中，中｡）；
      //     行内只剩 head 一个原子时拉不动、挂行尾（中，@26 → 中，/ab）；
      //   · 前驱本身就是禁则标点 → 挂在 run 尾，不链式拉回
      //     （中文中文中文。、@40 = 4 行不是 5）。
      const mode = lineStartMode(atom.ch)
      if (mode === 'hang' && used + atomW / 2 <= lineWidth) {
        used += glue + atomW
        lastAtomW = atomW
        continue
      }
      // 回溯行尾：跳空白 → 连续禁则标点 run → 非禁则 head（词或 CJK 字）。
      let j = i - 1
      while (j >= lineStart && atoms[j].space) j -= 1
      let runW = 0
      while (j >= lineStart && atoms[j].cjk && isLineStartForbidden(atoms[j].ch)) {
        runW += widths[j]
        j -= 1
      }
      while (j >= lineStart && atoms[j].space) j -= 1
      if (j > lineStart) {
        lines += 1
        used = Math.min(widths[j] + runW + atomW, width)
        lineStart = j
      } else {
        used += glue + atomW
      }
      lastAtomW = atomW
      continue
    }
    lines += 1
    used = Math.min(atomW, width)
    lastAtomW = atomW
    lineStart = i
  }
  return lines
}

/**
 * 行首禁则字符（CJK 收类标点）：不允许落新行首——逐码位分「拉回/悬挂」
 * 两种语义见下方 LINE_START_PULLBACK / LINE_START_HANG 表。半角 ')' ']'
 * 等未列入——它们在 CJK 文本场景里同样禁行首，但出现率低且与词内位置
 * 耦合，留在已知偏差。
 * #3166-⑦/R8 探针补齐、R9 按官方 LineBreak-18.0.0 类表重核：小号叹问
 * ﹗﹖（FE57/FE56 官方类是 EX 不是 CL）、右双引 ”（U+201D 是 QU）、
 * 半角句读 ｡､（FF61/FF64 才是 CL 本类）、･（FF65 是 NS）——六者
 * 行为上都不可落行首，但类归属按官方类写，不混称 CL。
 * 死条目清理（R9）：‥(2025)/…(2026)/‰(2030) 的码位 ≤0x2E7F，走 word
 * 原子分支、禁则判定带 cjk 守卫故恒不可达，已从集合删除。U+201D ” 同
 * 为 ≤0x2E7F、在本集合同样不可达——但它经 word 原子路径恢复断后语义
 *（QU 断后码位，已回 BREAK_AFTER：Chrome 对 5 词夹具实测 5 行=断后，
 * 不入集合会把它并成不可断整词估成 1 行，低估方向）。
 */
/**
 * 行首禁则逐码位语义表（R11 修正，QA+代码复审双轴逐行内容实测口径）。
 * 拉回组：标点放不下时把行尾最近的非禁则原子连同尾部禁则 run 一起
 *   带下行——`，。、：；？！﹖﹗％｡､･`（FF0C 3002 3001 FF1A FF1B
 *   FF1F FF01 FE56 FE57 FF05 FF61 FF64 FF65）。`｡､･` 在 R10 被
 *   误归悬挂，QA 逐行内容实测（中中｡@32 → 中/中｡）证其为拉回：
 *   半宽 advance 只有 7px，悬挂 ink 再取半后 3.5px 恒能挂上，低估
 *   42 格（6820 网格 133→91 全消在此）。
 *   `％`(FF05) 登记偏差：官方 CL 类枚举本无它，但 Chrome 实测其行为
 *   即拉回（逐行内容与 ，。同形），删除会使该码位不符数 3→15——
 *   实现保留、规格按 10 个码位口径登记。
 * 悬挂组：标点挂在行尾（ink 半宽不越界），挂不下时同样把行尾单元带
 *   下行——`〉】〕）］｝》」』〞〟`（3009 3011 3015 FF09 FF3D FF5D
 *   300B 300D 300F 301E 301F）。未在语义表中的新增码位先实测再归类。
 * 半角组：｡､･ 在**行中**只占半 advance（中･ab@40 单行，LINE_START_
 *   HALFWIDTH_HANG 只管宽度计量，与拉回/悬挂语义分组无关——名字里的
 *   HANG 是 R10 归错语义时留下的命名债，指「半宽」而非悬挂）。
 * 前驱类型是次级条件：head 必须是非禁则原子且不把行拉空——前驱是
 * 不可断词原子时拉回组把词整体带下行（aa bb cc，word → cc， 下行）；
 * 前驱是禁则标点时一律挂 run 尾。
 */
const LINE_START_PULLBACK = new Set([
  0xff61, 0xff64, 0xff65,
  0xff0c, 0x3002, 0x3001, 0xff1a, 0xff1b, 0xff1f, 0xff01, 0xfe56, 0xfe57, 0xff05,
])
const LINE_START_HANG = new Set([
  0x3009, 0x3011, 0x3015,
  0xff09, 0xff3d, 0xff5d, 0x300b, 0x300d, 0x300f, 0x301e, 0x301f,
])
const LINE_START_HALFWIDTH_HANG = new Set([0xff61, 0xff64, 0xff65])

function lineStartMode(ch) {
  if (typeof ch !== 'string') return null
  const cp = ch.codePointAt(0)
  if (LINE_START_HANG.has(cp)) return 'hang'
  if (LINE_START_PULLBACK.has(cp)) return 'pull'
  return null
}

function isLineStartForbidden(ch) {
  return lineStartMode(ch) !== null
}

/**
 * 行尾禁则字符（CJK 开类标点）：浏览器断行时不允许它们悬挂在行尾，
 * 随内容一起换行。半角 '(' '[' '{' 未列入，理由同上。
 */
function isLineEndForbidden(ch) {
  return typeof ch === 'string'
    && /[（［｛《〈「『【〔]/.test(ch)
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
