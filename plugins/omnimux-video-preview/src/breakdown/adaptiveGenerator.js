/**
 * @file plugins/omnimux-video-preview/src/breakdown/adaptiveGenerator.js
 * Adaptive shot beat and narrative structure generator based on video duration and genre.
 */

import { formatTimeRange } from './timeUtils.js'

const DRAMA_PIPELINE = Object.freeze([
  'Hook',
  'Inciting Incident',
  'Rising Conflict',
  'Climax',
  'Plot Twist',
  'Cliffhanger',
])

const STANDARD_4_STAGE_PIPELINE = Object.freeze([
  'Hook',
  'Product Intro',
  'Usage Detail',
  'Demo Scene',
])

const DRAMA_BEATS = Object.freeze([
  { stage: 'Hook', title: '黄金开局：反差悬念置顶', desc: '开场通过高反差视觉与痛点迅速建立身份危机与悬疑氛围。' },
  { stage: 'Inciting Incident', title: '冲突发酵：屈辱遭遇与压迫', desc: '主角身处极端困境，反派步步紧逼，情绪张力蓄积。' },
  { stage: 'Inciting Incident', title: '转折契机：神秘力量/角色介入', desc: '关键道具或核心人物破空登场，打破僵局带来转机。' },
  { stage: 'Rising Conflict', title: '首次试探：正面威慑与试压', desc: '多机位特写博弈，主角展现不甘屈服的决绝眼神。' },
  { stage: 'Rising Conflict', title: '暗流涌动：潜藏秘密即将揭开', desc: '镜头交替扫过环境与角色微表情，剧情暗线逐步浮出水面。' },
  { stage: 'Rising Conflict', title: '危机骤增：绝境陷阱与生死抉择', desc: '外部威胁全面爆发，主角退无可退面临命运抉择。' },
  { stage: 'Climax', title: '高潮觉醒：绝对力量强势反制', desc: '高燃动作与情绪爆发点，瞬间击破压迫者建立统治力。' },
  { stage: 'Climax', title: '情绪顶峰：主从同盟与誓约确立', desc: '双人情绪中景特写，关系发生质的飞跃，高光台词定格。' },
  { stage: 'Plot Twist', title: '暗度陈仓：第三方势力突袭', desc: '突发意外打破短暂停歇，幕后真凶露面颠覆既定预设。' },
  { stage: 'Plot Twist', title: '身份反转：惊天秘密大白', desc: '前序伏笔彻底回收，真正身份或阴谋彻底揭晓引发震撼。' },
  { stage: 'Rising Conflict', title: '终局前奏：最后决战部署', desc: '双方阵营正式划清界线，蓄势待发进入终极博弈。' },
  { stage: 'Climax', title: '终极大快人心：正面迎战反击', desc: '快节奏剪辑与运镜，彻底粉碎反派阴谋完成复仇与救赎。' },
  { stage: 'Cliffhanger', title: '余波与伏笔：更大危机初露端倪', desc: '主线事件暂歇，神秘信件或阴暗身影预示下一篇章。' },
  { stage: 'Cliffhanger', title: '终局高能卡点：强悬念留存引导', desc: '剧集在最高潮卡点戛然而止，抛出终极悬念引导观看全集。' },
])

const DRAMA_CAMERA_STYLES = Object.freeze([
  ['特写', '智能手机手持', '俯视', '手持微动'],
  ['中景', '智能手机手持', '平视', '手持微动'],
  ['全景', '固定机位', '仰视', '慢速推拉'],
  ['特写', '智能手机手持', '平视', '快速摇镜'],
  ['中景', '智能手机手持', '俯视', '手持移动'],
  ['特写', '大画幅长焦', '平视', '浅景深虚化'],
  ['全景', '智能手机手持', '仰视', '手持移动'],
])

const MID_LENGTH_SHOT_TEMPLATES = Object.freeze([
  { ratio: 0.08, title: '黄金前置抓眼球', stage: 'Hook', tags: ['特写', '智能手机手持', '俯视', '手持微动'], desc: (c) => `开场高能视觉切入抓取完播率：${c.slice(0, 45)}` },
  { ratio: 0.25, title: '背景铺垫与痛点切入', stage: 'Product Intro', tags: ['中景', '智能手机手持', '平视', '手持微动'], desc: () => '真实交代前置背景与用户痛点，引发同理心。' },
  { ratio: 0.45, title: '核心主体亮点呈现', stage: 'Product Intro', tags: ['特写', '智能手机手持', '平视', '手持移动'], desc: () => '全景呈现核心亮点与视觉细节，树立品质与信任。' },
  { ratio: 0.65, title: '实操过程与功能展现', stage: 'Usage Detail', tags: ['中景', '智能手机手持', '平视', '手持移动'], desc: () => '直观演示操作流程与核心效果，化解顾虑。' },
  { ratio: 0.85, title: '高光效果与成果展示', stage: 'Demo Scene', tags: ['全景', '智能手机手持', '俯视', '慢速推拉'], desc: () => '呈现最终惊喜效果，达成情绪与审美共鸣。' },
  { ratio: 1.00, title: '行动呼吁与转化引导', stage: 'Demo Scene', tags: ['特写', '智能手机手持', '平视', '手持微动'], desc: () => '引导评论区互动、主页点击或应用下载转化。' },
])

const SHORT_SHOT_TEMPLATES = Object.freeze([
  { ratio: 0.20, title: '黄金前置视觉切入', stage: 'Hook', tags: ['特写', '智能手机手持', '俯视', '手持微动'], desc: (c) => `开场通过高反差视觉与痛点切入抓取眼球：${c.slice(0, 45)}` },
  { ratio: 0.45, title: '核心主体与细节展示', stage: 'Product Intro', tags: ['特写', '智能手机手持', '平视', '手持微动'], desc: () => '镜头聚焦主体，多角度展现核心细节与材质工艺。' },
  { ratio: 0.75, title: '使用过程与功能演示', stage: 'Usage Detail', tags: ['中景', '智能手机手持', '平视', '手持移动'], desc: () => '第一视角动态演示使用过程，展现解决痛点的直观效果。' },
  { ratio: 1.00, title: '实际场景与转化引导', stage: 'Demo Scene', tags: ['中景', '智能手机手持', '俯视', '手持移动'], desc: () => '切换至日常生活场景，引发观众审美共鸣并引导互动下单。' },
])

/**
 * Build narrative structure cards for long episodic drama.
 * @param {string} cleanCap
 * @returns {Array<object>}
 */
function buildDramaStructureCards(cleanCap) {
  const capExcerpt = cleanCap.slice(0, 40)
  const hookSummary = capExcerpt || '高能冲突前置'
  return [
    {
      stage: 'Hook',
      title: 'Hook',
      description: `开场通过高反差视觉与悬疑痛点迅速建立身份危机与悬念：${hookSummary}`,
    },
    {
      stage: 'Inciting Incident',
      title: 'Inciting Incident',
      description: '核心矛盾与不可调和的阵营对立全面展开，确立追剧动机。',
    },
    {
      stage: 'Rising Conflict',
      title: 'Rising Conflict',
      description: '多重冲突反转层层递进，每 60-90 秒必有情绪高潮或危机爆发。',
    },
    {
      stage: 'Climax',
      title: 'Climax',
      description: '高能战力反转或情绪宣泄顶峰，带来强烈的大快人心爽感。',
    },
    {
      stage: 'Plot Twist',
      title: 'Plot Twist',
      description: '打破单线叙事逻辑，揭示隐藏身份与幕后黑手。',
    },
    {
      stage: 'Cliffhanger',
      title: 'Cliffhanger',
      description: '在剧情最高潮戛然而止，留下致命悬念吸引观众进入 App 追看全集。',
    },
  ]
}

/**
 * Generate adaptive dramatic beats for long episodic videos (> 180s).
 * @param {number} dur
 * @param {string} cleanCap
 * @returns {{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }}
 */
function generateLongDramaAdaptive(dur, cleanCap) {
  const isDrama = /reels?|drama|series|sacrifice|queen|alpha|wolf|ceo|短剧|合集|连续剧/i.test(cleanCap)
  const targetShotCount = Math.min(16, Math.max(10, Math.round(dur / 85)))
  const step = dur / targetShotCount
  const shots = []

  for (let i = 0; i < targetShotCount; i++) {
    const startSec = Math.round(i * step)
    const isLast = i === targetShotCount - 1
    const endSec = isLast ? dur : Math.round((i + 1) * step)
    const beat = DRAMA_BEATS[i % DRAMA_BEATS.length]
    const cam = DRAMA_CAMERA_STYLES[i % DRAMA_CAMERA_STYLES.length]

    const title = isDrama ? beat.title : `镜头 ${i + 1}：核心叙事推进`
    const isFirstWithCap = i === 0 && Boolean(cleanCap)
    const description = isFirstWithCap ? `${beat.desc}（${cleanCap.slice(0, 45)}）` : beat.desc

    shots.push({
      id: `shot_${i + 1}`,
      start_seconds: startSec,
      end_seconds: endSec,
      time_range: formatTimeRange(startSec, endSec),
      title,
      stage: beat.stage,
      tags: [...cam],
      description,
    })
  }

  const structure = buildDramaStructureCards(cleanCap)
  return { shots, structure, pipeline: [...DRAMA_PIPELINE] }
}

/**
 * Build shots array based on declarative ratio templates.
 * @param {Array<object>} templates
 * @param {number} dur
 * @param {string} cleanCap
 * @returns {Array<object>}
 */
function buildShotsFromTemplates(templates, dur, cleanCap) {
  let prevSec = 0
  return templates.map((t, idx) => {
    const isLast = idx === templates.length - 1
    const endSec = isLast ? dur : Math.max(prevSec + 1, Math.round(dur * t.ratio))
    const startSec = prevSec
    prevSec = endSec
    return {
      id: `shot_${idx + 1}`,
      start_seconds: startSec,
      end_seconds: endSec,
      time_range: formatTimeRange(startSec, endSec),
      title: t.title,
      stage: t.stage,
      tags: [...t.tags],
      description: t.desc(cleanCap),
    }
  })
}

/**
 * Generate adaptive breakdown for mid-length video (60s ~ 180s).
 * @param {number} dur
 * @param {string} cleanCap
 * @returns {{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }}
 */
function generateMidLengthAdaptive(dur, cleanCap) {
  const shots = buildShotsFromTemplates(MID_LENGTH_SHOT_TEMPLATES, dur, cleanCap)
  const structure = [
    { stage: 'Hook', title: 'Hook', description: `开场通过高视觉吸引力与反差切入抓住观众眼球：${cleanCap.slice(0, 45)}` },
    { stage: 'Product Intro', title: 'Product Intro', description: '主体特征与视觉细节深度呈现，树立品质与信任。' },
    { stage: 'Usage Detail', title: 'Usage Detail', description: '真实操作流程演示与细节释疑，展现直观解决效果。' },
    { stage: 'Demo Scene', title: 'Demo Scene', description: '高光场景展示与生活美学共鸣，自然驱动转化行动。' },
  ]
  return { shots, structure, pipeline: [...STANDARD_4_STAGE_PIPELINE] }
}

/**
 * Generate adaptive breakdown for short video (<= 60s).
 * @param {number} dur
 * @param {string} cleanCap
 * @returns {{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }}
 */
function generateShortVideoAdaptive(dur, cleanCap) {
  const shots = buildShotsFromTemplates(SHORT_SHOT_TEMPLATES, dur, cleanCap)
  const structure = [
    { stage: 'Hook', title: 'Hook', description: `视频开场直接展示产品/主体，配上走心的文案，迅速抓住观众眼球：${cleanCap.slice(0, 45)}` },
    { stage: 'Product Intro', title: 'Product Intro', description: '全景展示主体与丰富细节，呈现精致质感与设计亮点，突出送礼与收藏的价值感。' },
    { stage: 'Usage Detail', title: 'Usage Detail', description: '特写展示内部细节、质感工艺与关键交互，直观呈现产品细节功能与真实情感传递。' },
    { stage: 'Demo Scene', title: 'Demo Scene', description: '置于真实生活场景之中，展现搭配与实际使用氛围，激发观众的情感共鸣与行动意愿。' },
  ]
  return { shots, structure, pipeline: [...STANDARD_4_STAGE_PIPELINE] }
}

/**
 * Intelligently generates adaptive shots and narrative structure based on duration and genre.
 * @param {number} totalDuration
 * @param {string} [caption='']
 * @param {string} [_platform='']
 * @returns {{ shots: Array<object>, structure: Array<object>, pipeline: Array<string> }}
 */
export function generateAdaptiveShotsAndStructure(totalDuration, caption = '', _platform = '') {
  const dur = totalDuration > 0 ? totalDuration : 16
  const cleanCap = String(caption || '').trim()

  if (dur > 180) {
    return generateLongDramaAdaptive(dur, cleanCap)
  }
  if (dur > 60) {
    return generateMidLengthAdaptive(dur, cleanCap)
  }
  return generateShortVideoAdaptive(dur, cleanCap)
}
