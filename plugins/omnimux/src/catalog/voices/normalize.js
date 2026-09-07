/** Offline projection of the official voice snapshot; no provider calls. */
const CORE_HOT_VOICES = [
  'zh_male_guanggaojieshuo_uranus_bigtts',
  'zh_female_gujie_uranus_bigtts',
  'zh_male_jieshuoxiaoming_moon_bigtts',
  'zh_female_zhixingnv_uranus_bigtts',
  'zh_male_qingshuangnanda_uranus_bigtts',
  'ICL_uranus_en_female_charlie_tob',
  'zh_male_changtianyi_mars_bigtts',
  'zh_female_shuangkuaisisi_moon_bigtts',
  'zh_male_yuanboxiaoshu_uranus_bigtts',
  'zh_female_qinqienv_uranus_bigtts',
];
const HOT_TAG_WEIGHTS = new Map([['抖音同款', 4], ['剪映同款', 2], ['豆包同款', 1]]);
const DISPLAY_TAGS = new Set([...HOT_TAG_WEIGHTS.keys(), '猫箱同款']);
const RESOURCE_IDS = new Set(['seed-tts-1.0', 'seed-tts-2.0']);
const SCENES = new Set(['角色扮演', '通用场景', '有声阅读', '视频配音', '客服场景', '外语音色', '教学场景', '教育场景', '趣味口音']);

/**
 * @typedef {object} VoiceIndexRecord
 * @property {string} voice_type
 * @property {string} name
 * @property {string} display_name
 * @property {string} category Comma-separated, trimmed scene labels.
 * @property {string} language Comma-separated languages, without accent suffixes.
 * @property {string} accent Comma-separated accents, or 未知 when not inferable.
 * @property {'male'|'female'|'unknown'} gender
 * @property {string[]} tags
 * @property {'seed-tts-1.0'|'seed-tts-2.0'} resource_id
 * @property {boolean} is_hot
 * @property {number} hot_order Ascending rank; core voices occupy 1–10.
 */

const tokens = (value) => [...new Set(value.split(/[,，]/u).map((s) => s.trim()).filter(Boolean))];

function requiredString(row, field, index) {
  if (typeof row?.[field] !== 'string' || !row[field].trim()) {
    throw new Error(`voice[${index}].${field} must be a nonempty string`);
  }
  return row[field].trim();
}

function inferAccent(language, category, name) {
  const hints = `${language},${category},${name}`;
  const regional = [...hints.matchAll(/(河南|四川|广西|台湾|广东|青岛|北京|长沙|东北|上海|天津|山东|陕西|山西|湖南|湖北)口音/gu)]
    .map(([accent]) => accent);
  if (/粤语/u.test(hints)) regional.push('粤语');
  const accents = [...new Set(regional)];
  if (language.includes('中文') && accents.length === 0) accents.push('普通话');
  for (const [hint, accent] of [['美式英语', '美式'], ['英式英语', '英式'], ['澳洲英语', '澳洲'], ['墨西哥西语', '墨西哥'], ['巴西葡萄牙语', '巴西']]) {
    if (hints.includes(hint)) accents.push(accent);
  }
  return [...new Set(accents)].join(',') || '未知';
}

const tagScore = (voice) => voice.tags.reduce((sum, tag) => sum + (HOT_TAG_WEIGHTS.get(tag) ?? 0), 0);
const coreRank = (voice) => {
  const index = CORE_HOT_VOICES.indexOf(voice.voice_type);
  return index < 0 ? Infinity : index + 1;
};

/**
 * Strict, deterministic projection: malformed or duplicate IDs fail rather than
 * silently reducing the advertised voice count. Equal tag scores retain source order.
 * @param {unknown} source
 * @returns {VoiceIndexRecord[]}
 */
export function normalizeVolcengineVoices(source) {
  if (!Array.isArray(source) || source.length === 0) throw new Error('voice source must be a nonempty array');
  const seen = new Set();
  const voices = source.map((row, index) => {
    const voice_type = requiredString(row, 'voice_type', index);
    if (!/^[A-Za-z0-9_]+$/u.test(voice_type)) throw new Error(`invalid voice_type: ${voice_type}`);
    if (seen.has(voice_type)) throw new Error(`duplicate voice_type: ${voice_type}`);
    seen.add(voice_type);
    const name = requiredString(row, 'name', index);
    const display_name = requiredString(row, 'display_name', index);
    const category = requiredString(row, 'category', index);
    const language = requiredString(row, 'language', index);
    const resource_id = requiredString(row, 'resource_id', index);
    if (!RESOURCE_IDS.has(resource_id)) throw new Error(`unsupported resource_id: ${resource_id}`);
    if (!Array.isArray(row.tags) || row.tags.some((tag) => typeof tag !== 'string')) {
      throw new Error(`voice[${index}].tags must be a string array`);
    }
    const tags = [...new Set(row.tags.map((tag) => tag.trim()).filter((tag) => DISPLAY_TAGS.has(tag)))];
    const scenes = tokens(category).filter((scene) => SCENES.has(scene));
    return {
      voice_type, name, display_name,
      category: (scenes.length ? scenes : tokens(category)).join(','),
      language: [...new Set(tokens(language).map((lang) => lang.replace(/-.*口音$/u, '').replace(/^西语$/u, '西班牙语')))].join(','),
      accent: inferAccent(language, category, name),
      gender: voice_type.match(/(?:^|_)(female|male)(?:_|$)/iu)?.[1].toLowerCase() ?? 'unknown',
      tags, resource_id,
      is_hot: CORE_HOT_VOICES.includes(voice_type) || tags.some((tag) => HOT_TAG_WEIGHTS.has(tag)),
      hot_order: 0,
    };
  });
  voices.sort((a, b) => {
    const left = coreRank(a), right = coreRank(b);
    if (left !== right) return left - right;
    return tagScore(b) - tagScore(a);
  });
  let otherRank = CORE_HOT_VOICES.length;
  return voices.map((voice) => ({ ...voice, hot_order: Number.isFinite(coreRank(voice)) ? coreRank(voice) : ++otherRank }));
}
