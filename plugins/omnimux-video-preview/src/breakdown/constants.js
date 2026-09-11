/**
 * @file plugins/omnimux-video-preview/src/breakdown/constants.js
 * Video breakdown domain constants, dictionaries, and regex rules.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BUNDLED_STRUCTURE_PROMPT = join(HERE, '../../prompts/video-structure-breakdown.md')

export const STAGE_NAME_MAP = Object.freeze({
  Hook: '黄金开局视觉切入',
  'Product Intro': '核心主体与细节呈现',
  'Usage Detail': '实操过程与功能展示',
  'Demo Scene': '实际场景与转化共鸣',
})

export const DEFAULT_CAMERA_TAGS = Object.freeze(['特写', '智能手机手持', '俯视', '手持微动'])

export const SHOT_TYPE_REGEX = /^(全景|远景|大远景|大特写|特写|中景|中全景|中近景|近景)$/i
export const MOTION_WORD_REGEX = /^(固定|正面固定|俯角固定|手持微动|手持平移|慢速推拉|快速摇镜)$/i
export const CUT_INDEX_REGEX = /^(\*\*)?(?:cut|镜头|镜号|shot)\s*\d+(\*\*)?$/i
export const SPEECH_PREFIX_REGEX = /^[\(（]?(?:无|none|无台词|none)[\)）]?$/i
export const STAGE_KEYWORD_REGEX = /^(hook|product intro|usage detail|demo scene|inciting incident|rising conflict|climax|plot twist|cliffhanger|cta)$/i

export const METADATA_HEADING_REGEX = /^(?:[#\d\.\s*、\-\(\)（）]*)(?:叙事结构|结构阶段|逐镜头|分镜脚本|两阶段|结构拆解|流程链路|核心目标|内容总览|基本信息|分段目录|场景数据|关键表达|优化建议|风险与备注|结论)/i

export const STAGE_I18N = Object.freeze({
  Hook: { zh: '黄金钩子', en: 'Hook' },
  'Product Intro': { zh: '产品引入', en: 'Product Intro' },
  'Usage Detail': { zh: '使用细节', en: 'Usage Detail' },
  'Demo Scene': { zh: '场景演示', en: 'Demo Scene' },
  'Call to Action': { zh: '行动号召', en: 'Cta' },
  CTA: { zh: '行动号召', en: 'Cta' },
  Cta: { zh: '行动号召', en: 'Cta' },
  'Inciting Incident': { zh: '开端引发', en: 'Inciting Incident' },
  'Rising Conflict': { zh: '冲突升级', en: 'Rising Conflict' },
  Climax: { zh: '剧情高潮', en: 'Climax' },
  Cliffhanger: { zh: '悬念钩子', en: 'Cliffhanger' },
})

export const CANONICAL_STAGE_KEYS = Object.freeze(['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])

export const HEADER_KEYWORD_REGEX = /^(?:时间|时间跨度|时间戳|time|时段|分镜标题|分镜|标题|所属阶段|阶段|stage|镜头属性标签|镜头属性|属性|景别|运镜|机位|拍摄视角|拍摄机位|视角|画面与动作描述|画面描述|动作描述|视觉画面|画面|台词\/字幕|台词|字幕|台词字幕|镜头序号|序号|cut|shot|提示词参考|提示词)$/i

export const CAMERA_SCALE_RULES = Object.freeze([
  { pattern: /大特写|极特写/i, value: '大特写' },
  { pattern: /特写|Close-up/i, value: '特写' },
  { pattern: /大远景/i, value: '大远景' },
  { pattern: /远景/i, value: '远景' },
  { pattern: /中远景/i, value: '中远景' },
  { pattern: /中近景/i, value: '中近景' },
  { pattern: /中景|Medium/i, value: '中景' },
  { pattern: /全景|Wide/i, value: '全景' },
])

export const CAMERA_DEVICE_RULES = Object.freeze([
  { pattern: /车载|车内|车侧/i, value: '车载机位' },
  { pattern: /航拍|无人机/i, value: '航拍机位' },
  { pattern: /云台/i, value: '云台机位' },
  { pattern: /固定|三脚架/i, value: '固定机位' },
  { pattern: /手机|手持/i, value: '智能手机手持' },
])

export const CAMERA_ANGLE_RULES = Object.freeze([
  { pattern: /微俯|轻微俯视/i, value: '微俯视' },
  { pattern: /俯视|俯角|俯拍/i, value: '俯视' },
  { pattern: /低角|仰视|仰角|仰拍/i, value: '仰视' },
  { pattern: /顶视|鸟瞰/i, value: '顶视' },
  { pattern: /平视|平拍/i, value: '平视' },
])

export const CAMERA_MOTION_RULES = Object.freeze([
  { pattern: /微动/i, value: '手持微动' },
  { pattern: /平移|横摇/i, value: '手持平移' },
  { pattern: /推拉|慢速推拉|推进|拉出/i, value: '慢速推拉' },
  { pattern: /摇镜|快摇/i, value: '快速摇镜' },
  { pattern: /跟随/i, value: '跟随镜头' },
])

export const STAGE_STRATEGY_TEMPLATES = Object.freeze({
  Hook: '以偷窥情景剧形式戏剧化呈现隐私暴露痛点，瞬间抓住用户注意力并引出隐私贴膜解决方案。',
  'Product Intro': '通过邻居推荐的情景口吻，引出单向透光隔热窗膜产品，建立信任感与好奇心。',
  'Usage Detail': '分步演示测量、裁剪、贴膜及刮平过程，展示产品极低的操作门槛与DIY便利性。',
  'Proof Effect': '直观对比内外视角效果，强调单向透视的防窥私密性与防晒隔热、节能省电的双重核心价值。',
  'Demo Scene': '展示真实生活与工作应用场景，配合舒适从容的生活氛围，全面激发观众的安全感与购买向往。',
  Cta: '通过50%折扣和包邮优惠激发紧迫感，强力促单转化。',
})

export const SECTION_MATCH_RULES = Object.freeze([
  {
    stage: 'Hook',
    regex: /(?:\[0-3秒\]\s*黄金钩子|Hook|黄金钩子)[^\n:]*[:：]?\s*([^\n]+)/i,
    clean: (m) => m[1].trim().replace(/^>\s*/, '').replace(/\*+/g, ''),
  },
  {
    stage: 'Product Intro',
    regex: /##\s*I\.\s*核心目标[^\n]*\n+([\s\S]*?)(?=\n##\s*II|$)/i,
    clean: (m) => m[1].trim().replace(/\*+/g, ''),
  },
  {
    stage: 'Usage Detail',
    regex: /##\s*III\.\s*叙事分析[^\n]*\n+([\s\S]*?)(?=\n##\s*IV|$)/i,
    clean: (m) => m[1].trim().replace(/\*+/g, ''),
  },
  {
    stage: 'Demo Scene',
    regex: /##\s*IV\.\s*画面分析[^\n]*\n+([\s\S]*?)(?=\n##\s*V|$)/i,
    clean: (m) => m[1].replace(/\|[\s\S]*$/, '').trim().replace(/\*+/g, ''),
  },
])
