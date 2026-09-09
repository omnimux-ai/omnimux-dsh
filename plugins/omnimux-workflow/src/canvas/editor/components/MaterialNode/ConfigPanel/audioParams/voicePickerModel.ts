/**
 * VoicePickerModel — 音色选择弹窗纯逻辑（Issue #735 / T04）。
 *
 * 真源：Catalog DTO 的 schema.voice.options（VoiceCatalogOption.meta =
 * VoiceOptionMeta，snake_case）。本模块只做纯函数派生：
 *   - 搜索：中文名 / 拼音全拼（voice_type 字母串子串）/ 拼音首字母
 *     （对 voice_type 做贪婪声母切分）/ 官方代码 / 场景 / 标签；
 *   - 四维筛选（语言、口音、性别、场景）：从 meta 动态聚合去重，AND 关系；
 *   - 热门排序：hot_order 1–10 核心爆款置顶（升序）→ 抖音/剪映/豆包同款
 *     标签音色 → 其余保持目录原序；
 *   - 无 meta 的 legacy 选项全程安全降级（仅按 label/value 匹配）。
 */

import type { VoiceCatalogOption, VoiceOptionMeta } from '../../../../../../shared/api.ts';

/** 热门标签（次优先级置顶） */
export const VOICE_HOT_TAGS = ['抖音同款', '剪映同款', '豆包同款'] as const;

/** 核心爆款 hot_order 闭区间上限（1–10 置顶且按 hot_order 升序） */
export const VOICE_CORE_HOT_MAX_ORDER = 10;

/** 性别筛选键 → 展示文案 */
export const VOICE_GENDER_LABELS: Readonly<Record<string, string>> = {
  male: '男声',
  female: '女声',
};

const PINYIN_DOUBLE_INITIALS = ['zh', 'ch', 'sh'] as const;
const PINYIN_SINGLE_INITIALS = 'bpmfdtnlgkhjqxrzcsyw';
const PINYIN_VOWELS = 'aeiouv';

/**
 * 贪婪声母切分。foldNasalFinals 时把元音后的 n(/ng) 视为鼻音韵尾跳过，
 * 使跨音节首字母保持连续（guanggaojieshuo → …ggjs…）；
 * 不折叠的变体保留 n 作声母的解读（如 nuo），双路匹配覆盖两种切分。
 */
function buildInitials(letters: string, foldNasalFinals: boolean): string {
  let result = '';
  let index = 0;
  while (index < letters.length) {
    const pair = letters.slice(index, index + 2);
    if ((PINYIN_DOUBLE_INITIALS as readonly string[]).includes(pair)) {
      result += pair.charAt(0);
      index += 2;
      continue;
    }
    const char = letters.charAt(index);
    const prev = index > 0 ? letters.charAt(index - 1) : '';
    if (foldNasalFinals && char === 'n' && PINYIN_VOWELS.includes(prev)) {
      index += letters.charAt(index + 1) === 'g' ? 2 : 1;
      continue;
    }
    if (PINYIN_SINGLE_INITIALS.includes(char)) result += char;
    index += 1;
  }
  return result;
}

/**
 * 贪婪声母切分：从任意字符串中提取拼音首字母序列。
 * 例：'zh_male_jieshuoxiaoming_moon_bigtts' → 含 'jsxm' 子串。
 * 多字母声母 zh/ch/sh 优先，单字母声母次之，其余字符（元音/非字母）跳过。
 */
export function extractPinyinInitials(input: string): string {
  return buildInitials(input.toLowerCase().replace(/[^a-z]/g, ''), false);
}

/** 即时模糊搜索：中文名/官方代码/场景/标签 + 拼音全拼 + 拼音首字母。空查询恒真。 */
export function voiceMatchesQuery(option: VoiceCatalogOption, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase().replace(/\s+/g, '');
  if (!query) return true;
  const meta = option.meta;
  const zhCorpus = meta
    ? [meta.display_name, meta.name, meta.category, ...meta.tags].join('\n').toLowerCase()
    : `${option.label}\n${option.value}`.toLowerCase();
  if (zhCorpus.includes(query)) return true;
  // 官方代码原样匹配（含下划线/数字），再走纯字母的拼音全拼与首字母
  const voiceTypeLower = (meta?.voice_type ?? option.value).toLowerCase();
  if (voiceTypeLower.includes(query)) return true;
  if (!/^[a-z0-9]+$/.test(query)) return false;
  const letters = voiceTypeLower.replace(/[^a-z]/g, '');
  if (letters.includes(query)) return true;
  // 首字母双变体匹配：保留 n 声母解读 + 鼻音韵尾折叠解读
  if (buildInitials(letters, false).includes(query)) return true;
  return buildInitials(letters, true).includes(query);
}

/** 逗号/顿号分隔的复合标签拆分（category、language、accent 为多值字段） */
function splitLabels(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,，、/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export interface VoiceFacets {
  /** 语言去重（按首现顺序） */
  languages: string[];
  /** 口音去重（按首现顺序） */
  accents: string[];
  /** 场景/分类去重（按首现顺序） */
  categories: string[];
  /** 数据中实际存在的性别键，固定 male → female 顺序 */
  genders: Array<'male' | 'female'>;
}

/** 从音色元数据动态聚合四维筛选选项 */
export function collectVoiceFacets(options: ReadonlyArray<VoiceCatalogOption>): VoiceFacets {
  const languages: string[] = [];
  const accents: string[] = [];
  const categories: string[] = [];
  const genderSet = new Set<string>();
  const pushUnique = (bucket: string[], value: string): void => {
    if (!bucket.includes(value)) bucket.push(value);
  };
  for (const option of options) {
    const meta = option.meta;
    if (!meta) continue;
    for (const value of splitLabels(meta.language)) pushUnique(languages, value);
    for (const value of splitLabels(meta.accent)) pushUnique(accents, value);
    for (const value of splitLabels(meta.category)) pushUnique(categories, value);
    if (meta.gender === 'male' || meta.gender === 'female') genderSet.add(meta.gender);
  }
  const genders = (['male', 'female'] as const).filter((key) => genderSet.has(key));
  return { languages, accents, categories, genders };
}

export interface VoiceFilterState {
  query: string;
  /** '' 表示全部 */
  language: string;
  accent: string;
  /** '' | 'male' | 'female' */
  gender: string;
  category: string;
}

export const EMPTY_VOICE_FILTERS: VoiceFilterState = {
  query: '',
  language: '',
  accent: '',
  gender: '',
  category: '',
};

/** 热门分层：0 = hot_order 1–10 核心爆款；1 = 热门标签音色；2 = 常规 */
function hotTier(option: VoiceCatalogOption): 0 | 1 | 2 {
  const meta = option.meta;
  if (meta?.is_hot && meta.hot_order >= 1 && meta.hot_order <= VOICE_CORE_HOT_MAX_ORDER) return 0;
  if (meta?.tags.some((tag) => (VOICE_HOT_TAGS as readonly string[]).includes(tag))) return 1;
  return 2;
}

/** 四维 AND 过滤 + 热门排序（同层内保持目录原序，稳定） */
export function filterAndSortVoices(
  options: ReadonlyArray<VoiceCatalogOption>,
  filters: VoiceFilterState,
): VoiceCatalogOption[] {
  const filtered = options.filter((option) => {
    const meta = option.meta;
    if (!voiceMatchesQuery(option, filters.query)) return false;
    if (filters.language && !splitLabels(meta?.language).includes(filters.language)) return false;
    if (filters.accent && !splitLabels(meta?.accent).includes(filters.accent)) return false;
    if (filters.gender && meta?.gender !== filters.gender) return false;
    if (filters.category && !splitLabels(meta?.category).includes(filters.category)) return false;
    return true;
  });
  return filtered
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const tierDiff = hotTier(a.option) - hotTier(b.option);
      if (tierDiff !== 0) return tierDiff;
      if (hotTier(a.option) === 0) {
        const orderDiff = (a.option.meta?.hot_order ?? 0) - (b.option.meta?.hot_order ?? 0);
        if (orderDiff !== 0) return orderDiff;
      }
      return a.index - b.index;
    })
    .map(({ option }) => option);
}

/** 列表/底栏展示名：meta.display_name → label → value */
export function resolveVoiceLabel(option: VoiceCatalogOption | undefined): string {
  if (!option) return '';
  return option.meta?.display_name || option.label || option.value;
}

/** 列表项特色行：标签 + 首个场景分类，如「剪映同款 · 角色扮演」 */
export function voiceTagLine(option: VoiceCatalogOption): string {
  const meta = option.meta;
  if (!meta) return '';
  const segments = [...meta.tags, ...splitLabels(meta.category).slice(0, 1)];
  return segments.join(' · ');
}

/** 火山引擎大模型官方公开 CDN：预置音色 3~5 秒 MP3 试听样音（已开 CORS） */
export const VOLCENGINE_SAMPLE_CDN_BASE = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts';

/** 按 voice_type 生成官方试听样音 URL（向下兼容单个 URL 导出） */
export function getVoiceSampleUrl(voiceType: string): string {
  return `${VOLCENGINE_SAMPLE_CDN_BASE}/${encodeURIComponent(voiceType)}.mp3`;
}

/**
 * 计算音色试听候选样音文件名列表（按匹配优先级排序，解决火山官方对英文/别名音色命名差异）：
 * 1. 英文/外语音色（或含英文别名的音色）：如 Charlie 2.0 -> Charlie.mp3、Frosty Man -> Frosty_Man.mp3、爽快思思/Skye -> Skye.mp3
 * 2. 官方标准代号名：voice_type.mp3
 * 3. 中文名（去除斜杠等）：如 解说小明.mp3、枕边低语.mp3
 * 4. 去除 2.0 后缀后的名称
 */
export function getVoiceSampleCandidates(optionOrVoiceType: VoiceCatalogOption | string): string[] {
  const isString = typeof optionOrVoiceType === 'string';
  const voiceType = isString ? optionOrVoiceType : optionOrVoiceType.value;
  const option = isString ? null : optionOrVoiceType;
  const rawName = option?.meta?.name || '';
  const displayName = option?.meta?.display_name || option?.label || '';

  const fileNames: string[] = [];

  // 1. 英文名 / 拼写（如 Charlie, Frosty_Man, The_Grinch 等）或带斜杠别名（爽快思思/Skye）
  if (rawName) {
    if (rawName.includes('/')) {
      const parts = rawName.split('/').map((s) => s.trim().replace(/ /g, '_'));
      if (parts[1]) fileNames.push(`${parts[1]}.mp3`);
      if (parts[0]) fileNames.push(`${parts[0]}.mp3`);
    } else {
      const cleanName = rawName.replace(/ /g, '_');
      if (/^[A-Za-z0-9_ -]+$/.test(rawName)) {
        fileNames.push(`${cleanName}.mp3`);
      }
    }
  }

  // 2. 官方标准代号：voice_type.mp3
  fileNames.push(`${voiceType}.mp3`);

  // 3. 中文名或常规名
  if (rawName && !rawName.includes('/')) {
    const cleanName = rawName.replace(/ /g, '_');
    fileNames.push(`${cleanName}.mp3`);
  }

  // 4. 去除 2.0 后缀的名称（如 枕边低语 2.0 -> 枕边低语.mp3）
  if (displayName) {
    const noVer = displayName.replace(/[_ ]?2\.0$/, '').replace(/ /g, '_');
    if (noVer && !fileNames.includes(`${noVer}.mp3`)) {
      fileNames.push(`${noVer}.mp3`);
    }
  }

  const unique = Array.from(new Set(fileNames));
  return unique.map((name) => `${VOLCENGINE_SAMPLE_CDN_BASE}/${encodeURIComponent(name)}`);
}

export type { VoiceOptionMeta };
