/**
 * Shared OmniMux brand defaults for the host Config schema and the client overlay.
 * Keep these values identical to `assets/logo.svg`.
 */

/** Window key the host index tap writes and the client overlay reads. */
export const BOOT_WINDOW_KEY = '__OMNIMUX_BRAND__'

/** Official product title the overlay rewrites in `document.title`. */
export const OFFICIAL_PRODUCT_TITLE = 'DeepSeek Harness'

/** Official sidebar fallback brand name when no brand is supplied. */
export const FALLBACK_BRAND_TEXTS = ['DSH Local Build']

/** DeepSeek fish mark `viewBox` (sidebar rail + empty-session hero). */
export const FISH_VIEWBOX = '0 0 23.16 17.04'

/** DeepSeek wordmark `viewBox` (full whale + name artwork). */
export const WORDMARK_VIEWBOX = '0 0 182 24'

/** Official sidebar name slot (`BrandWordmark includeMark={false}`). */
export const NAME_WORDMARK_VIEWBOX = '26 0 156 24'

/** Hero fish width in px (`FishLogo size={34}`). Smaller marks are the rail. */
export const HERO_FISH_MIN_WIDTH = 34

/** Exact hero badge copy in the two shipped GUI locales. */
export const PREVIEW_BADGE_TEXTS = ['预览版', 'Preview']

/** Default empty-session hero headline. */
export const DEFAULT_HERO_HEADLINE = '属于你的AI社媒运营团队'

/** Official empty-session headlines in the two shipped GUI locales. Exact match only. */
export const OFFICIAL_HERO_HEADLINES = ['探索未至之境', 'Into the Unknown']

/** Official hero title size (figma 34:10411: 26/32 wt500). */
export const DEFAULT_HERO_HEADLINE_MAX_PX = 26

/** Floor when the session column is too narrow to hold the headline on one line. */
export const DEFAULT_HERO_HEADLINE_MIN_PX = 16

/** Official hero title line-height at {@link DEFAULT_HERO_HEADLINE_MAX_PX}. */
export const DEFAULT_HERO_HEADLINE_LEADING_PX = 32

/** Fish column width in the official `.headline` grid (`grid-template-columns: 34px auto auto`). */
export const HERO_HEADLINE_FISH_PX = 34

/** `column-gap` on the official `.headline` grid. */
export const HERO_HEADLINE_GAP_PX = 10

/**
 * Bundled OmniMux ghost mark (DESIGN 2.0); same document as `assets/logo.svg`.
 * Lavender `#b8b7ff` rounded tile (rx=280) + obsidian `#121213` ghost body
 * + white `#ffffff` capsule eyes, per brand book §2.0 Violet & Indigo refresh.
 */
export const DEFAULT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" fill="none">
  <!-- OmniMux logo (DESIGN 2.0): lavender tile + obsidian ghost IP + white capsule eyes -->
  <rect width="1254" height="1254" rx="280" fill="#b8b7ff"/>
  <defs>
    <clipPath id="tile">
      <rect width="1254" height="1254" rx="280"/>
    </clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <g transform="translate(627 627) scale(0.9) translate(-627 -627)">
      <g transform="translate(0 1254) scale(0.1 -0.1)" fill="#121213" stroke="none">
        <path d="M6140 11075 c-139 -45 -194 -180 -155 -380 64 -321 -32 -625 -266 -851 -124 -119 -249 -191 -570 -330 -668 -288 -1134 -629 -1523 -1116 -386 -481 -639 -1054 -746 -1689 -42 -253 -54 -430 -47 -728 7 -336 18 -419 137 -1061 102 -550 86 -978 -48 -1263 -62 -133 -119 -212 -257 -357 -127 -134 -182 -205 -225 -290 -113 -221 -83 -455 80 -633 77 -84 163 -140 265 -174 69 -23 97 -27 205 -27 186 -1 248 20 506 170 152 88 208 107 314 108 75 1 91 -3 140 -28 80 -42 165 -135 239 -262 183 -314 288 -417 499 -492 69 -24 91 -27 212 -27 146 1 196 11 318 66 111 50 203 120 368 280 173 167 248 227 362 283 189 95 420 102 619 19 110 -47 208 -121 388 -293 180 -172 287 -251 404 -300 152 -62 333 -78 471 -39 217 60 345 181 541 513 78 133 156 216 235 253 50 23 72 27 144 27 102 -1 153 -18 290 -100 290 -173 465 -215 679 -164 115 28 193 71 276 155 143 143 202 333 161 523 -31 147 -88 237 -274 434 -66 70 -141 156 -166 192 -67 93 -133 240 -169 374 -31 117 -31 118 -31 382 -1 294 9 398 70 715 37 193 84 492 106 670 8 71 13 228 13 445 -1 356 -6 421 -61 720 -194 1062 -829 1958 -1753 2476 -230 129 -268 182 -312 441 -29 171 -60 278 -119 401 -199 417 -609 800 -1005 937 -98 34 -244 43 -315 20z"/>
      </g>
      <rect x="447" y="562" width="75" height="172" rx="37.5" ry="37.5" fill="#ffffff"/>
      <rect x="731" y="562" width="75" height="172" rx="37.5" ry="37.5" fill="#ffffff"/>
    </g>
  </g>
</svg>
`

/**
 * Overlay configuration after schema defaults.
 * @typedef {object} BrandConfig
 * @property {string} productName Tab-title suffix and welcome-copy replacement.
 * @property {string} logoSvg SVG document used for favicon, rail, hero, and wordmark mark.
 * @property {string} wordmarkText Label that replaces the deepseek + HARNESS wordmark.
 * @property {boolean} replaceHeroMark When true, also replace the empty-session fish.
 * @property {boolean} hidePreviewBadge When true, hide the hero 预览版 / Preview pill.
 * @property {boolean} rewriteWelcome When true, rewrite DeepSeek Harness / DSH phrases in welcome copy.
 * @property {string} heroHeadline Empty-session headline replacing the official 探索未至之境 / Into the Unknown.
 * @property {boolean} heroHeadlineFit When true, shrink the hero headline to one line in a narrow session column.
 * @property {number} heroHeadlineMaxPx Wide-column headline font-size in CSS px (official 26).
 * @property {number} heroHeadlineMinPx Narrow-column floor in CSS px.
 */

/** Schema defaults used when the index tap is absent. */
export const DEFAULT_CONFIG = Object.freeze({
  productName: 'OmniMux',
  logoSvg: DEFAULT_LOGO_SVG,
  wordmarkText: 'OmniMux',
  replaceHeroMark: true,
  hidePreviewBadge: true,
  rewriteWelcome: true,
  heroHeadline: DEFAULT_HERO_HEADLINE,
  heroHeadlineFit: true,
  heroHeadlineMaxPx: DEFAULT_HERO_HEADLINE_MAX_PX,
  heroHeadlineMinPx: DEFAULT_HERO_HEADLINE_MIN_PX,
})
