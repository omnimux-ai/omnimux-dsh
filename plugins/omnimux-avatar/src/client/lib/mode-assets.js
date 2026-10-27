// 视频三模式的素材快照：动作复刻 / 角色替换 / 爆款复刻 各自持有一份
// 参考视频、参考图与提示词草稿，切换模式互不污染。
//
// 约定：
// - 快照是不可变值，每个操作返回新对象，React 侧可以直接放进 state。
// - 上传库与历史库仍是共享的（那是 api 层的事），这里只管「已选素材」。
// - 在途上传按「发起模式」落位，不看当前模式，因此调用方必须显式传 mode。

/** 三个视频模式，顺序与分段控件一致。 */
export const MODES = ['motion', 'replace', 'recreate']

/** 参考图上限，与服务端 motion.submit 的 1–30 校验一致。 */
export const MAX_IMAGES = 30

/** @param {unknown} value */
export function isMode(value) {
  return MODES.includes(value)
}

/** 一个模式的空素材槽。 */
export function emptyAssets() {
  return { video: null, images: [], prompt: '', promptOn: false, style: '' }
}

/** 新建空快照：三个模式各自独立，不共享同一个数组引用。 */
export function createSnapshot() {
  return Object.fromEntries(MODES.map((mode) => [mode, emptyAssets()]))
}

/**
 * 取某个模式的素材槽。未知模式、脏快照都退化为空槽，渲染路径不抛错。
 * @param {unknown} snapshot
 * @param {string} mode
 */
export function assetsOf(snapshot, mode) {
  if (!isMode(mode) || !snapshot || typeof snapshot !== 'object') return emptyAssets()
  const slot = snapshot[mode]
  if (!slot || typeof slot !== 'object') return emptyAssets()
  return {
    video: slot.video ?? null,
    images: Array.isArray(slot.images) ? slot.images : [],
    prompt: typeof slot.prompt === 'string' ? slot.prompt : '',
    promptOn: slot.promptOn === true,
    style: typeof slot.style === 'string' ? slot.style : '',
  }
}

/**
 * 写入某个模式的素材槽（只覆盖给出的字段）。
 * @param {unknown} snapshot
 * @param {string} mode
 * @param {Partial<ReturnType<typeof emptyAssets>>} patch
 */
export function withAssets(snapshot, mode, patch) {
  if (!isMode(mode)) return snapshot
  const base = createSnapshot()
  const next = snapshot && typeof snapshot === 'object' ? { ...base, ...snapshot } : base
  return { ...next, [mode]: { ...assetsOf(next, mode), ...patch } }
}

/**
 * 选中参考视频；再次选中同一条即取消。
 * @param {unknown} snapshot
 * @param {string} mode
 * @param {unknown} item
 */
export function selectVideo(snapshot, mode, item) {
  if (!isMode(mode) || !item || typeof item !== 'object') return snapshot
  const current = assetsOf(snapshot, mode).video
  return withAssets(snapshot, mode, { video: current?.id === item.id ? null : item })
}

/**
 * 追加一张参考图：同 id 不重复、最多 MAX_IMAGES 张、保持发起顺序。
 * 无变化时返回原快照，避免 React 无谓重渲染。
 * @param {unknown} snapshot
 * @param {string} mode
 * @param {unknown} item
 */
export function appendImage(snapshot, mode, item) {
  if (!isMode(mode) || !item || typeof item !== 'object') return snapshot
  const { images } = assetsOf(snapshot, mode)
  if (images.some((row) => row.id === item.id) || images.length >= MAX_IMAGES) return snapshot
  return withAssets(snapshot, mode, { images: [...images, item] })
}

/**
 * 按序号移除参考图；越界时返回原快照。
 * @param {unknown} snapshot
 * @param {string} mode
 * @param {number} index
 */
export function removeImageAt(snapshot, mode, index) {
  if (!isMode(mode) || !Number.isInteger(index)) return snapshot
  const { images } = assetsOf(snapshot, mode)
  if (index < 0 || index >= images.length) return snapshot
  return withAssets(snapshot, mode, { images: images.filter((_, at) => at !== index) })
}

/**
 * 写提示词草稿（按模式各自保存）。
 * @param {unknown} snapshot
 * @param {string} mode
 * @param {string} value
 */
export function withPrompt(snapshot, mode, value) {
  if (!isMode(mode)) return snapshot
  return withAssets(snapshot, mode, { prompt: String(value ?? '') })
}

/**
 * 落一次上传结果。`mode` 必须是发起上传时记下的模式，而不是当前模式：
 * 用户在等待期间切走，结果仍然要落回发起它的那个模式。
 * @param {unknown} snapshot
 * @param {string} mode 发起上传的模式
 * @param {{ type?: string, id?: string }|null} item 服务端返回的素材行
 */
export function applyUpload(snapshot, mode, item) {
  if (!isMode(mode) || !item || typeof item !== 'object') return snapshot
  if (item.type === 'video') return withAssets(snapshot, mode, { video: item })
  if (item.type === 'image') return appendImage(snapshot, mode, item)
  return snapshot
}
