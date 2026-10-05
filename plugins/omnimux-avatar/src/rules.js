// 形象设定的规则引擎：与 service/influencer/rules.go 逐函数对齐的 JS 移植。
import { CategoryByID, Fragment, OptionByID, ValidTier, promptOrder } from './taxonomy.js'

/** 多视角设定板的画幅比例。 */
export const MULTIVIEW_SIZE = '16:9'
/** 角色设定图的画幅。 */
export const SHEET_SIZE = '1024x1536'

/** 规则违例；HTTP 层据此渲染 400 与英文提示。 */
export class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

function has(sel, cat, opt) {
  return (sel[cat] ?? []).includes(opt)
}

function hasAny(sel, cat, opts) {
  return (sel[cat] ?? []).some((v) => opts.includes(v))
}

function slotOf(option) {
  return option?.slot ? option.slot : ''
}

/**
 * 四条硬冲突：上游冲突表两条 + 同数据集里的颈部/牙齿互斥两条。
 * 顺序敏感，命中即返回。
 */
export function conflictMessage(tier, sel) {
  if (has(sel, 'body_type', 'body_heavy') && hasAny(sel, 'height', ['h_tall', 'h_very_tall'])) {
    return 'Heavy build cannot be combined with Tall or Very tall.'
  }
  if (
    tier !== 'normal' &&
    hasAny(sel, 'body_type', ['body_heavy', 'body_muscular', 'body_ultra']) &&
    hasAny(sel, 'proportions', ['pr_shortlegs', 'pr_longlimbs'])
  ) {
    return 'This build cannot be combined with Short legs or Long limbs in this mode.'
  }
  if (has(sel, 'body_type', 'body_ultra') && has(sel, 'freak_neck', 'neck_long')) {
    return 'Extreme muscular build cannot be combined with Long neck.'
  }
  if (has(sel, 'freak_neck', 'neck_long') && has(sel, 'freak_face', 'ff_teeth_11')) {
    return 'Long neck cannot be combined with Buck teeth.'
  }
  return ''
}

/**
 * 归一化客户端提交的选项集合，规则与前端一致：
 * - 未知分类 / 未知选项直接拒绝
 * - 当前档位不可见的选项静默丢弃
 * - acc_none 互斥，命中即清空其它配饰
 * - 多选分类里同槽位选项互相替换（后者胜出）
 * - 分类上限只保留最后被接受的若干项（与前端追加语义一致）
 */
export function NormalizeSelection(tier, sel = {}) {
  if (!ValidTier(tier)) throw new ValidationError('tier', 'invalid tier')

  const out = {}
  // 分类按 id 排序遍历：Go 用 map 顺序，这里取稳定顺序以便测试。
  for (const catID of Object.keys(sel).sort()) {
    const picks = sel[catID] ?? []
    const category = CategoryByID(catID)
    if (!category) throw new ValidationError(catID, `unknown category "${catID}"`)

    const maxN = category.max > 0 ? category.max : 1
    let kept = []
    for (const id of picks) {
      const option = OptionByID(catID, id)
      if (!option) throw new ValidationError(catID, `unknown option "${id}"`)
      if (!(option.visibleIn ?? []).includes(tier)) continue

      if (catID === 'accessory' && id === 'acc_none') {
        kept = [id]
        continue
      }
      if (catID === 'accessory' && kept.includes('acc_none')) kept = []

      const slot = slotOf(option)
      if (slot !== '') {
        kept = kept.filter((prev) => slotOf(OptionByID(catID, prev)) !== slot)
      }

      // 上限判定发生在同槽位替换之后，因此替换型选择不会被上限挤掉。
      if (kept.length >= maxN) continue
      if (!kept.includes(id)) kept.push(id)
    }
    // 空分类不写入结果，绝不产出 []。
    if (kept.length > 0) out[catID] = kept
  }
  return out
}

/** 归一化后再过冲突门。 */
export function ValidateSelection(tier, sel = {}) {
  const norm = NormalizeSelection(tier, sel)
  const msg = conflictMessage(tier, norm)
  if (msg !== '') throw new ValidationError('selection', msg)
  return norm
}

/** 夸张档位对应的提示词引导语。 */
export function tierLead(tier) {
  if (tier === 'total') {
    return 'Extreme caricature, exaggerated proportions, full-body character portrait of a'
  }
  if (tier === 'freak') {
    return 'Stylized, slightly exaggerated, full-body character portrait of a'
  }
  return 'Natural, realistic, full-body character portrait of a'
}

/** 按 promptOrder 汇总选项片段。 */
function fragmentsOf(sel) {
  const parts = []
  for (const catID of promptOrder) {
    for (const id of sel[catID] ?? []) parts.push(Fragment(catID, id))
  }
  return parts
}

/** 组装角色设定图提示词。 */
export function BuildPrompt(tier, sel = {}, brief = '') {
  const parts = fragmentsOf(sel)
  let p = tierLead(tier)
  if (parts.length > 0) p += ` ${parts.join(', ')}`
  const trimmed = String(brief ?? '').trim()
  if (trimmed !== '') p += `. ${trimmed}`
  p += '. Studio background, full-body shot, 9:16 composition, high detail, clean lighting.'
  return p
}

// 多视角设定板的固定版式：与角色无关，角色描述单独追加，
// 使各面板几何描述在每次请求间保持逐字节一致。
// 刻意不含夸张档位引导语——多视角由既有成图派生，
// 档位引导语会与「严格对齐参考图」的指令冲突并二次夸张化。
const multiViewLayout = `Create a professional character reference sheet of the exact same character from the reference image, keeping their face, skin, body shape, hair, eyes, facial features, and outfit identical in every panel. Ultra-photorealistic, hyper-detailed studio photography, plain seamless neutral grey background in every panel, consistent soft diffused studio lighting throughout.

LAYOUT: two rows on one wide 16:9 image with clean thin white dividing lines between panels, no text, no labels.
Top row – five full-body panels, head to toe, same scale, standing pose:
1. Front view
2. Three-quarter front view (turned slightly to side)
3. Side profile view
4. Three-quarter back view
5. Back view

Bottom row – three large close-up portraits from the chest up:
6. Front headshot, eyes gently closed, head tilted slightly down, with a serene closed-lip smile
7. Three-quarter headshot, eyes half-open, looking thoughtful
8. Front headshot, eyes open looking straight into the lens, completely deadpan and confident`

// 收尾的成像质量要求，所有面板共用。
const multiViewQuality = `QUALITY: shot on a full-frame camera with an 85mm lens, sharp focus in every panel, natural skin texture with visible pores, fine individual hair strands, realistic fabric drape and texture on the ensemble. Accurate, consistent colours across all panels. Clean white dividing lines between panels, no text, no logos.`

/**
 * 组装多视角设定板提示词：固定版式 + 角色描述。
 * 角色描述取自与 BuildPrompt 相同的 promptOrder/Fragment 来源，
 * 保证同一角色在设定图与多视角板上读起来一致。
 */
export function BuildMultiViewPrompt(sel = {}, brief = '') {
  let character = fragmentsOf(sel).join(', ')
  const trimmed = String(brief ?? '').trim()
  if (trimmed !== '') {
    character = character !== '' ? `${character}. ${trimmed}` : trimmed
  }
  if (character === '') character = 'the exact character'

  return (
    multiViewLayout +
    '\n\nCHARACTER (must match reference image exactly in every panel):\n' +
    character +
    '\n\n' +
    multiViewQuality
  )
}
