// 数字人工作台的文案字典。
//
// 两套键并存，因为同一插件里两种写法都在用：
//   1. 语义点号键（本插件的左栏组件）：t('action.generate')。
//   2. 文案原文键（画廊组件与源工作台的习惯）：t('生成') 或 t('Generate')。
// 因此 TEXT_KEYS 里的每对 [中文, 英文原文] 会同时注册四种键值映射，
// 无论调用方用中文还是英文原文做键，都能取到当前语言的正确文案。
//
// 中文是产品默认语言；英文词条保留源工作台
// （OmniMux web/src/features/influencer）的原文，作为 1:1 对照。
// 四条硬冲突的键就是 CONFLICT_RULES 的英文 message 本身，因为
// conflictMessage() 返回英文原文，页面直接 t(conflict)。

export const NS = 'omnimux-avatar'

/** 语义点号键（本插件自有文案）。 */
const ZH_DOTTED = {
  nav: '数字人',
  'avatar.label': '数字人',
  'avatar.unnamed': '未命名',
  'avatar.create': '新建数字人',
  'avatar.name': '数字人名称',
  'avatar.createConfirm': '创建',
  'avatar.cancel': '取消',
  'avatar.switch': '切换数字人',
  'avatar.rename': '重命名',
  'avatar.renameHint': '双击改名',
  'avatar.empty': '还没有数字人，先新建一个。',

  'tier.title': '夸张程度',
  'tier.normal': '普通',
  'tier.freak': '夸张',
  'tier.total': '极限',

  'action.randomize': '随机',
  'action.generate': '生成',
  'action.retry': '重试',
  'action.regenerate': '重新生成',
  'action.delete': '删除',
  'action.download': '下载',

  'model.pick': '选择模型',
  'model.config': '模型配置',
  'model.brand': '品牌',
  'model.brandAll': '全部',
  'model.model': '模型',
  'model.group': '渠道',
  'model.groupDefault': '默认渠道',

  'source.explore': '灵感库',
  'source.history': '历史记录',
  'source.view': '浏览',
  'viewMode.title': '浏览方式',
  'viewMode.timeline': '时间线',
  'viewMode.grid': '网格',

  'explore.empty': '暂无预设',
  'explore.unavailable': '灵感预设当前不可用',
  'preset.apply': '套用',
  'preset.direction': '方向',
  'preset.settings': '设定',
  'preset.actualSize': '原始尺寸',
  'preset.fitView': '适应视图',
  'preset.updating': '预设设置正在更新，请稍后再试。',

  'history.empty.title': '这里还没有内容',
  'history.empty.desc': '在左侧选好设定后点生成，或点随机来一个数字人',
  'history.loading': '正在加载历史…',
  'history.loadingMore': '正在加载更多…',
  'history.loadFailed': '加载历史失败',
  'history.loadMore': '加载更多',
  'history.end': '没有更多记录了',

  'media.previewUnavailable': '预览不可用',
  'media.noPreview': '暂无预览',

  'status.queued': '排队中',
  'status.generating': '生成中',
  'status.failed': '生成失败',

  'multiview.title': '多视角',
  'multiview.view': '查看多视角',
  'multiview.generate': '生成多视角',
  'multiview.generating': '正在生成多视角设定板…',
  'multiview.failed': '多视角生成失败',
  'multiview.failedDetail': '多视角生成失败：{{msg}}',
  'multiview.noImage': '该形象暂无可用主图',

  'toast.presetApplied': '已套用到左侧面板',
  'toast.formFilled': '已从该任务填入表单',
  'toast.noSheetParams': '该任务不含设定参数',
  'toast.removed': '已从画廊移除',
  'toast.tierDropped': '{{n}} 项在当前档位不可见，已移除',
  'toast.savedToLibrary': '已保存到资产库 · 角色',

  // 归档（资产库同步）没跑成时的卡片文案：图已产出，但还没入库。
  'sync.unsaved': '尚未保存到资产库',
  'sync.retry': '重试保存',
  'sync.retrying': '正在保存…',

  'error.noImageChannel': '尚未配置图像生成渠道',
  'error.avatarNameExists': '数字人名称已存在',
  'common.close': '关闭',
}

/** 语义点号键的英文对照（源工作台原文）。 */
const EN_DOTTED = {
  nav: 'Characters',
  'avatar.label': 'Character',
  'avatar.unnamed': 'Untitled',
  'avatar.create': 'New character',
  'avatar.name': 'Character name',
  'avatar.createConfirm': 'Create',
  'avatar.cancel': 'Cancel',
  'avatar.switch': 'Switch character',
  'avatar.rename': 'Rename',
  'avatar.renameHint': 'Double-click to rename',
  'avatar.empty': 'No characters yet. Create one to start.',

  'tier.title': 'Exaggeration',
  'tier.normal': 'Average',
  'tier.freak': 'Bold',
  'tier.total': 'Extreme',

  'action.randomize': 'Randomize',
  'action.generate': 'Generate',
  'action.retry': 'Retry',
  'action.regenerate': 'Regenerate',
  'action.delete': 'Delete',
  'action.download': 'Download',

  'model.pick': 'Pick a model',
  'model.config': 'Model settings',
  'model.brand': 'Brand',
  'model.brandAll': 'All brands',
  'model.model': 'Model',
  'model.group': 'Group',
  'model.groupDefault': 'Default group',

  'source.explore': 'Explore',
  'source.history': 'History',
  'source.view': 'View',
  'viewMode.title': 'View mode',
  'viewMode.timeline': 'Timeline',
  'viewMode.grid': 'Grid',

  'explore.empty': 'No presets found',
  'explore.unavailable': 'Inspiration presets are unavailable right now',
  'preset.apply': 'Recreate',
  'preset.direction': 'Direction',
  'preset.settings': 'Settings',
  'preset.actualSize': 'Actual size',
  'preset.fitView': 'Fit to view',
  'preset.updating': 'Preset settings are being updated. Please try again later.',

  'history.empty.title': 'Nothing here yet',
  'history.empty.desc':
    'Pick options on the left and hit Generate, or hit Randomize for a character',
  'history.loading': 'Loading history…',
  'history.loadingMore': 'Loading more…',
  'history.loadFailed': 'Failed to load history',
  'history.loadMore': 'Load more',
  'history.end': 'No more records',

  'media.previewUnavailable': 'Preview unavailable',
  'media.noPreview': 'No preview available',

  'status.queued': 'Queued',
  'status.generating': 'Generating…',
  'status.failed': 'Generation failed',

  'multiview.title': 'Multi-view',
  'multiview.view': 'View multi-view',
  'multiview.generate': 'Generate multi-view',
  'multiview.generating': 'Generating multi-view storyboard…',
  'multiview.failed': 'Multi-view generation failed',
  'multiview.failedDetail': 'Multi-view generation failed: {{msg}}',
  'multiview.noImage': 'No image available for multi-view generation',

  'toast.presetApplied': 'Character settings applied to the sidebar',
  'toast.formFilled': 'Form filled from task',
  'toast.noSheetParams': 'This task does not carry sheet parameters',
  'toast.removed': 'Removed from gallery',
  'toast.tierDropped': '{{n}} picks not visible in this tier were removed',
  'toast.savedToLibrary': 'Saved to the asset library · Characters',

  'sync.unsaved': 'Not saved to the asset library yet',
  'sync.retry': 'Retry saving',
  'sync.retrying': 'Saving…',

  'error.noImageChannel': 'No image generation channel is configured',
  'error.avatarNameExists': 'A character with this name already exists',
  'common.close': 'Close',
}

/**
 * 文案原文键：[中文, 英文原文]。覆盖画廊组件用中文原文做键的写法，
 * 也覆盖源工作台用英文原文做键的写法。分类标签键同样在这里
 * （界面按 t(category.label_en) 取，label_en 就是英文原文）。
 * @type {[string, string][]}
 */
const TEXT_KEYS = [
  ['数字人', 'Characters'],
  ['夸张程度', 'Exaggeration'],
  ['普通', 'Average'],
  ['夸张', 'Bold'],
  ['极限', 'Extreme'],
  ['随机', 'Randomize'],
  ['生成', 'Generate'],
  ['选择模型', 'Pick a model'],
  ['模型配置', 'Model settings'],
  ['品牌', 'Brand'],
  ['全部', 'All brands'],
  ['模型', 'Model'],
  ['渠道', 'Group'],
  ['默认渠道', 'Default group'],
  ['灵感库', 'Explore'],
  ['历史记录', 'History'],
  ['浏览', 'View'],
  ['浏览方式', 'View mode'],
  ['时间线', 'Timeline'],
  ['网格', 'Grid'],
  ['暂无预设', 'No presets found'],
  ['灵感预设当前不可用', 'Inspiration presets are unavailable right now'],
  ['套用', 'Recreate'],
  ['方向', 'Direction'],
  ['设定', 'Settings'],
  ['原始尺寸', 'Actual size'],
  ['适应视图', 'Fit to view'],
  ['预设设置正在更新，请稍后再试。', 'Preset settings are being updated. Please try again later.'],
  ['这里还没有内容', 'Nothing here yet'],
  [
    '在左侧选好设定后点生成，或点随机来一个数字人',
    'Pick options on the left and hit Generate, or hit Randomize for a character',
  ],
  ['正在加载历史…', 'Loading history…'],
  ['正在加载更多…', 'Loading more…'],
  ['加载历史失败', 'Failed to load history'],
  ['加载更多', 'Load more'],
  ['没有更多记录了', 'No more records'],
  ['预览不可用', 'Preview unavailable'],
  ['暂无预览', 'No preview available'],
  ['排队中', 'Queued'],
  ['生成中', 'Generating…'],
  ['生成失败', 'Generation failed'],
  ['重试', 'Retry'],
  ['多视角', 'Multi-view'],
  ['重新生成', 'Regenerate'],
  ['删除', 'Delete'],
  ['下载', 'Download'],
  ['查看多视角', 'View multi-view'],
  ['多视角生成失败', 'Multi-view generation failed'],
  ['正在生成多视角设定板…', 'Generating multi-view storyboard…'],
  ['生成多视角', 'Generate multi-view'],
  ['已套用到左侧面板', 'Character settings applied to the sidebar'],
  ['该任务不含设定参数', 'This task does not carry sheet parameters'],
  ['已从该任务填入表单', 'Form filled from task'],
  ['该形象暂无可用主图', 'No image available for multi-view generation'],
  ['多视角生成失败：{{msg}}', 'Multi-view generation failed: {{msg}}'],
  ['已从画廊移除', 'Removed from gallery'],
  ['{{n}} 项在当前档位不可见，已移除', '{{n}} picks not visible in this tier were removed'],
  ['未命名', 'Untitled'],
  ['新建数字人', 'New character'],
  ['数字人名称', 'Character name'],
  ['双击改名', 'Double-click to rename'],
  ['创建', 'Create'],
  ['取消', 'Cancel'],
  ['切换数字人', 'Switch character'],
  ['重命名', 'Rename'],
  ['尚未配置图像生成渠道', 'No image generation channel is configured'],
  ['已保存到资产库 · 角色', 'Saved to the asset library · Characters'],
  ['数字人名称已存在', 'A character with this name already exists'],
  ['关闭', 'Close'],

  // 18 个分类标签：键与数据集 label_en 一致。
  ['性别', 'Gender'],
  ['族裔', 'Ethnicity'],
  ['年龄', 'Age'],
  ['肤色', 'Skin color'],
  ['身高', 'Height'],
  ['体型', 'Build'],
  ['比例', 'Proportions'],
  ['头型', 'Head shape'],
  ['脖颈', 'Neck'],
  ['眼型', 'Eye shape'],
  ['瞳色', 'Eye color'],
  ['面部特征', 'Features'],
  ['胡须', 'Facial hair'],
  ['发型', 'Hairstyle'],
  ['发色', 'Hair Color'],
  ['显著特征', 'Distinctive features'],
  ['风格', 'Style'],
  ['配饰', 'Accessories'],

  // 四条硬冲突：英文原文就是 taxonomy 的 message，中文按产品文案定稿。
  ['壮硕体型不能与高个或极高个组合。', 'Heavy build cannot be combined with Tall or Very tall.'],
  [
    '该体型在当前档位不能与短腿或长四肢组合。',
    'This build cannot be combined with Short legs or Long limbs in this mode.',
  ],
  ['极限肌肉体型不能与长脖子组合。', 'Extreme muscular build cannot be combined with Long neck.'],
  ['长脖子不能与龅牙组合。', 'Long neck cannot be combined with Buck teeth.'],
]

/**
 * 角色设定数据集（data/taxonomy.json）的标签键：[中文, 数据集 label_en]。
 *
 * 数据集只带英文 `label_en`，而 OptionCard / BuilderPanel 直接按
 * `t(label_en)` 取词，所以英文原文本身就是翻译键。这里为每个分类与选项
 * 逐条给出中文；英文侧只登记恒等词条，不额外派生中文键，避免与
 * TEXT_KEYS 的中文原文键相互覆盖。18 个分类标签与「Average」已由
 * TEXT_KEYS 登记，此处取值与之一致。
 * @type {[string, string][]}
 */
const TAXONOMY_LABELS = [
  // 分类（18）
  ['性别', 'Gender'],
  ['族裔', 'Ethnicity'],
  ['年龄', 'Age'],
  ['肤色', 'Skin color'],
  ['身高', 'Height'],
  ['体型', 'Build'],
  ['比例', 'Proportions'],
  ['头型', 'Head shape'],
  ['脖颈', 'Neck'],
  ['眼型', 'Eye shape'],
  ['瞳色', 'Eye color'],
  ['面部特征', 'Features'],
  ['胡须', 'Facial hair'],
  ['发型', 'Hairstyle'],
  ['发色', 'Hair Color'],
  ['显著特征', 'Distinctive features'],
  ['风格', 'Style'],
  ['配饰', 'Accessories'],

  // 性别
  ['女性', 'Female'],
  ['男性', 'Male'],
  ['跨性别男性', 'Trans man'],
  ['跨性别女性', 'Trans woman'],
  ['非二元性别', 'Non-binary'],

  // 族裔
  ['非洲裔', 'African'],
  ['亚洲裔', 'Asian'],
  ['欧洲裔', 'European'],
  ['印度裔', 'Indian'],
  ['中东裔', 'Middle Eastern'],
  ['混血', 'Mixed'],

  // 年龄
  ['成年', 'Adult'],
  ['中年', 'Mature'],
  ['老年', 'Senior'],

  // 肤色
  ['瓷白', 'Porcelain'],
  ['白皙', 'Fair'],
  ['浅色', 'Light'],
  ['橄榄色', 'Olive'],
  ['小麦色', 'Tan'],
  ['棕色', 'Brown'],
  ['深棕色', 'Deep brown'],
  ['黝黑', 'Ebony'],

  // 身高
  ['普通', 'Average'],
  ['高挑', 'Tall'],
  ['极高', 'Very tall'],

  // 体型
  ['纤细', 'Slim'],
  ['健美', 'Athletic'],
  ['肌肉', 'Muscular'],
  ['丰满', 'Curvy'],
  ['壮硕', 'Heavy'],
  ['极限肌肉', 'Ultra Muscular'],

  // 比例
  ['长四肢', 'Long limbs'],
  ['短腿', 'Short legs'],
  ['宽肩', 'Broad shoulders'],
  ['细腰', 'Tiny waist'],
  ['蛋形身材', 'Egg body'],
  ['啤酒肚', 'Pot belly'],

  // 头型
  ['标准', 'Standard'],
  ['修长', 'Long'],
  ['小巧', 'Tiny'],
  ['高额头', 'High forehead'],
  ['原始人', 'Caveman'],
  ['硬汉', 'Gigachad'],
  ['巨颚', 'Mega jaw'],
  ['圆形', 'Round'],
  ['方正', 'Square'],
  ['心形', 'Heart'],

  // 脖颈
  ['柱状', 'Column'],
  ['短颈', 'Short'],

  // 眼型
  ['杏眼', 'Almond'],
  ['单眼皮', 'Monolid'],
  ['眼距近', 'Close-set'],
  ['眼距宽', 'Wide-set'],
  ['不对称', 'Uneven'],
  ['大眼', 'Large'],
  ['巨眼', 'Huge'],
  ['内双', 'Hooded'],
  ['上扬眼', 'Upturned'],
  ['下垂眼', 'Downturned'],

  // 瞳色
  ['黑色', 'Black'],
  ['榛色', 'Hazel'],
  ['绿色', 'Green'],
  ['蓝色', 'Blue'],
  ['冰蓝', 'Ice blue'],
  ['琥珀色', 'Amber'],
  ['灰色', 'Grey'],

  // 面部特征
  ['雀斑', 'Freckles'],
  ['酒窝', 'Dimples'],
  ['重眼袋', 'Heavy eye bags'],
  ['腮红', 'Blush'],
  ['高颧骨', 'High cheekbones'],
  ['厚唇', 'Full lips'],
  ['浓眉', 'Thick brows'],
  ['美人痣', 'Beauty mark'],
  ['蒜头鼻', 'Potato nose'],
  ['小巧鼻', 'Button nose'],
  ['长尖鼻', 'Long pointy nose'],
  ['迷你鼻', 'Tiny nose'],
  ['嘟唇', 'Pouty lips'],
  ['小抿嘴', 'Tiny pursed mouth'],
  ['大嘴', 'Wide mouth'],
  ['一字眉', 'Unibrow'],
  ['细挑眉', 'Thin high brows'],
  ['野生眉', 'Brush brows'],
  ['招风耳', 'Jug ears'],
  ['大小耳', 'Uneven ears'],
  ['牙缝', 'Gap teeth'],
  ['龅牙', 'Buck teeth'],
  ['尖下巴', 'Pointy chin'],
  ['下巴后缩', 'Weak chin'],
  ['大额头', 'Big forehead'],

  // 胡须
  ['干净无须', 'Clean-shaven'],
  ['胡茬', 'Stubble'],
  ['络腮胡', 'Full beard'],
  ['山羊胡', 'Goatee'],
  ['小胡子', 'Moustache'],
  ['细线胡', 'Pencil moustache'],
  ['板刷胡', 'Push-broom moustache'],
  ['编辫胡', 'Braided beard'],

  // 发型
  ['灯罩波波头', 'Lampshade bob'],
  ['光头', 'Bald'],
  ['寸头', 'Buzz cut'],
  ['锅盖头', 'Bowl cut'],
  ['鲻鱼头', 'Mullet'],
  ['编发', 'Braids'],
  ['双马尾', 'Pigtails'],
  ['爆炸头', 'Afro'],
  ['莫西干', 'Mohawk'],
  ['蓬松大波浪', 'Volume waves'],
  ['蜂窝头', 'Beehive'],
  ['卷发', 'Perm'],
  ['长发', 'Long hair'],
  ['短发', 'Short hair'],
  ['恶魔角发', 'Hair horns'],
  ['冰淇淋卷', 'Soft-serve swirl'],
  ['圆球卷', 'Curl sphere'],
  ['鼠耳发包', 'Mouse-ear puffs'],
  ['翼状发', 'Hair wings'],
  ['刺猬头', 'Hedgehog spikes'],
  ['光头加侧发', 'Bald + side tufts'],
  ['阶梯发', 'Stair steps'],
  ['齐肩波波头', 'Shelf bob'],
  ['双螺旋卷', 'Twin corkscrews'],
  ['侧边卷', 'Side coil'],
  ['蘑菇头', 'Mushroom bowl'],

  // 发色
  ['乌黑', 'Jet black'],
  ['深棕', 'Dark brown'],
  ['栗色', 'Chestnut'],
  ['姜黄', 'Ginger'],
  ['红色', 'Red'],
  ['金发', 'Blonde'],
  ['铂金色', 'Platinum'],
  ['白色', 'White'],
  ['浅粉', 'Pastel pink'],
  ['淡紫', 'Lilac'],

  // 显著特征
  ['异色瞳', 'Odd eyes'],
  ['面部纹身', 'Face tattoo'],
  ['穿孔', 'Piercing'],
  ['多层耳钉', 'Stacked ear piercings'],
  ['断眉', 'Brow slits'],
  ['漂白眉', 'Bleached'],
  ['无眉', 'No brows'],
  ['金牙套', 'Gold grill'],
  ['牙套', 'Braces'],
  ['眉疤', 'Brow scar'],
  ['面部贴钻', 'Face gems'],
  ['精灵耳', 'Elf ears'],
  ['浓密睫毛', 'Big lashes'],
  ['鼻贴', 'Nose tape'],

  // 风格
  ['复古', 'Retro'],
  ['运动', 'Sporty'],
  ['千禧风', 'Y2K'],
  ['戏剧', 'Theatre'],
  ['哥特', 'Goth'],
  ['西装', 'Suits'],
  ['街头', 'Streetstyle'],
  ['休闲', 'Casual'],

  // 配饰
  ['无', 'None'],
  ['眼镜', 'Glasses'],
  ['耳机', 'Headphones'],
  ['珠宝', 'Jewelry'],
  ['帽子', 'Hat'],
  ['包袋', 'Bag'],
]

/** @returns {{ zh: Record<string,string>, en: Record<string,string> }} */
function buildDictionaries() {
  const zhDict = { ...ZH_DOTTED }
  const enDict = { ...EN_DOTTED }
  for (const [zhText, enText] of TEXT_KEYS) {
    // 中文原文做键，英文原文也做键：两种调用习惯都取到当前语言。
    zhDict[zhText] = zhText
    enDict[zhText] = enText
    zhDict[enText] = zhText
    enDict[enText] = enText
  }
  for (const [zhText, enText] of TAXONOMY_LABELS) {
    // 数据集只给英文原文：中文侧只登记英文键，英文侧登记恒等词条，
    // 两侧键数同步增长，不派生中文原文键。
    zhDict[enText] = zhText
    enDict[enText] = enText
  }
  return { zh: zhDict, en: enDict }
}

const DICTS = buildDictionaries()

export const zh = { translation: DICTS.zh }
export const en = { translation: DICTS.en }

/**
 * 把 `{{name}}` 占位符替换为变量值；缺变量时原样保留，便于发现漏配。
 * @param {string} text
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function interpolate(text, vars) {
  if (typeof text !== 'string' || !vars || typeof vars !== 'object') return text
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) =>
    vars[key] === undefined || vars[key] === null ? match : String(vars[key])
  )
}

/** @param {unknown} locale @returns {Record<string, string>} */
function resolveDict(locale) {
  if (typeof locale === 'string') {
    return locale.toLowerCase().startsWith('en') ? DICTS.en : DICTS.zh
  }
  if (locale && typeof locale === 'object') {
    const translation = /** @type {{ translation?: unknown }} */ (locale).translation
    if (translation && typeof translation === 'object') {
      return /** @type {Record<string, string>} */ (translation)
    }
  }
  return DICTS.zh
}

/**
 * 由一份语言包或语言标签构造 t()：查不到词条时回落到中文，再回落到键本身。
 * @param {unknown} locale 语言包（{translation}）／语言标签（'zh'|'en'）／宿主 locale 服务
 * @returns {(key: string, vars?: Record<string, unknown>) => string}
 */
export function createT(locale) {
  const dict = resolveDict(locale)
  return function t(key, vars) {
    const raw = dict[key] ?? DICTS.zh[key] ?? key
    return interpolate(raw, vars)
  }
}
