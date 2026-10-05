// 提示词预览的纯镜像实现。
//
// 来源：OmniMux/web/src/features/influencer/lib/prompt.ts（只读真源），行为 1:1。
//
// 偏离（权威位置变更）：真源此处即与服务端 BuildPrompt 并行的实现；
// 插件端权威提示词由服务端拼装（POST /api/omnimux/avatar/sheet 不接收提示词），
// 本文件只用于界面实时预览与测试，不参与提交。

/** 片段拼接顺序，与服务端 promptOrder 逐项一致。 */
export const PROMPT_ORDER = [
  'gender', 'ethnicity_origin_base', 'age', 'skin_tone', 'height',
  'body_type', 'proportions', 'freak_head', 'freak_neck', 'eye_shape',
  'eye_color', 'freak_face', 'facial_hair', 'hair', 'hair_colour',
  'distinctive', 'aesthetic', 'accessory',
]

/**
 * 取某选项的提示词片段，缺失时回退为原始选项 id。
 * @param {import('./types.js').InfluencerTaxonomy} tax
 * @param {string} catId
 * @param {string} optId
 * @returns {string}
 */
function fragment(tax, catId, optId) {
  const arr = tax.prompt_map.categories[catId]
  const f = arr?.find((o) => o.id === optId)
  return f?.fragment ?? optId
}

/**
 * 档位开场白。
 * @param {string} tier
 * @returns {string}
 */
function lead(tier) {
  if (tier === 'total') {
    return 'Extreme caricature, exaggerated proportions, full-body character portrait of a'
  }
  if (tier === 'freak') {
    return 'Stylized, slightly exaggerated, full-body character portrait of a'
  }
  return 'Natural, realistic, full-body character portrait of a'
}

/**
 * 镜像服务端 BuildPrompt，作为界面上的实时预览。
 * @param {import('./types.js').InfluencerTaxonomy|null} tax
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @param {string} brief
 * @returns {string}
 */
export function buildPrompt(tax, tier, sel, brief) {
  /** @type {string[]} */
  const parts = []
  for (const catId of PROMPT_ORDER) {
    for (const id of sel[catId] ?? []) {
      if (tax) parts.push(fragment(tax, catId, id))
    }
  }
  let p = lead(tier)
  if (parts.length) p += ` ${parts.join(', ')}`
  const b = brief.trim()
  if (b) p += `. ${b}`
  p += '. Studio background, full-body shot, 9:16 composition, high detail, clean lighting.'
  return p
}
