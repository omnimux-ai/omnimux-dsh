/**
 * plugins/omnimux-workflow/src/client/projects/appTabWidgets.js
 *
 * Form widgets logic and option resolvers for AI Application Tab (Issue #2607).
 * Pure functions without React dependencies for deterministic testing.
 *
 * Architecture alignment:
 * Aligns with `plugins/omnimux-apps/src/client/librarySources.ts` & `AppFormPanel.tsx`
 * to maintain consistent widget deduction, option resolution, and preview sanitization across plugins.
 */

/**
 * 统一选项解析器：同时兼容 prop.options（{label, value} 或基础类型）与 prop.enum。
 * @param {object} prop
 * @returns {Array<{ label: string, value: any }>}
 */
export function resolveOptions(prop) {
  if (!prop || typeof prop !== 'object') return []
  if (Array.isArray(prop.options) && prop.options.length > 0) {
    return prop.options.map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return { label: String(opt.label ?? opt.value), value: opt.value }
      }
      return { label: String(opt), value: opt }
    })
  }
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return prop.enum.map((entry) => ({ label: String(entry), value: entry }))
  }
  return []
}

/**
 * 依据当前生效模型契约动态推导可用成片比例选项。
 * 纯函数无外部依赖，用于彻底取代前端写死比例，驱动 ratio-cards 渲染。
 *
 * @param {object} [activeModel] 当前选定或默认的模型对象
 * @param {object} [prop] 属性定义 (兜底来源)
 * @returns {Array<{ label: string, value: any }>}
 */
export function resolveModelAspectRatios(activeModel, prop) {
  const modelOptions = activeModel?.parameters?.aspectRatio?.options
  if (Array.isArray(modelOptions) && modelOptions.length > 0) {
    return modelOptions.map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return { label: String(opt.label || opt.value), value: opt.value }
      }
      return { label: String(opt), value: opt }
    })
  }
  return resolveOptions(prop)
}

/**
 * 校验成片比例是否被当前模型支持。
 * @param {object} [activeModel]
 * @param {unknown} val
 * @returns {boolean}
 */
export function isAspectRatioSupported(activeModel, val) {
  if (val === undefined || val === null || val === '') return false
  const ratios = resolveModelAspectRatios(activeModel, null)
  if (!ratios || ratios.length === 0) return true
  const strVal = String(val).trim()
  return ratios.some((r) => String(r.value).trim() === strVal)
}

/**
 * 判定表单字段是否为成片画幅比例相关字段。
 * @param {string} [key]
 * @param {object} [prop]
 * @param {object} [mapping]
 * @returns {boolean}
 */
export function isAspectRatioField(key, prop, mapping) {
  if (!key && !prop && !mapping) return false
  const widget = mapping?.widget || prop?.widget
  if (widget === 'ratio-cards') return true
  const k = String(key || '').toLowerCase()
  if (
    k === 'aspect_ratio' ||
    k === 'aspectratio' ||
    k === 'ratio' ||
    k === 'video_ratio' ||
    k === 'videoratio' ||
    k === 'image_ratio' ||
    k === 'imageratio'
  ) {
    return true
  }
  if (k.includes('aspect_ratio') || k.includes('aspectratio')) return true
  if (prop?.title && (prop.title.includes('比例') || prop.title.includes('画幅'))) return true
  return false
}

/**
 * 判定表单字段是否为成片时长相关字段。
 * @param {string} [key]
 * @param {object} [prop]
 * @param {object} [mapping]
 * @returns {boolean}
 */
export function isDurationField(key, prop, mapping) {
  if (!key && !prop && !mapping) return false
  const k = String(key || '').toLowerCase()
  // 排除 duration_unit, duration_mode 等修饰字段
  if (k.includes('unit') || k.includes('mode')) return false
  if (k === 'duration' || k === 'video_duration' || k === 'videoduration') return true
  if (k === 'duration_seconds' || k === 'durationsec') return true
  if (k.includes('duration')) return true
  if (prop?.title && prop.title.includes('时长') && !prop.title.includes('单位')) return true
  return false
}

/**
 * 判定表单字段是否为成片分辨率相关字段。
 * 严禁误伤独立画质字段 quality（Issue #2642 Review）。
 * @param {string} [key]
 * @param {object} [prop]
 * @param {object} [mapping]
 * @returns {boolean}
 */
export function isResolutionField(key, prop, mapping) {
  if (!key && !prop && !mapping) return false
  const k = String(key || '').toLowerCase()
  // 独立画质字段 quality 不属于分辨率，严禁误归类
  if (k === 'quality') return false
  if (k.includes('mode')) return false
  if (k === 'resolution' || k === 'video_resolution' || k === 'videoresolution') return true
  if (k.includes('resolution')) return true
  if (prop?.title && (prop.title.includes('分辨率') || prop.title.includes('清晰度'))) return true
  return false
}

/**
 * 依据当前生效模型契约动态推导成片时长选项或 range 规格。
 * 支持 discrete options 数组或 min/max/step 的 range 对象，纯函数无副作用。
 *
 * 健全性保障（Issue #2642 Review）：
 * 1. 兼容同时声明连续滑块区间（range）与自适应哨兵（options: [{value: -1}] / allowAuto）的模型（如 seedance-2-5）；
 *    绝不因 options.length > 0 短路抛弃 range 规格；
 * 2. 纯 options 模型保留 options 列表形态。
 *
 * @param {object} [activeModel] 当前选定或默认的模型对象
 * @param {object} [prop] 属性定义 (兜底来源)
 * @returns {Array<{ label: string, value: any }> & { type: 'options' | 'range' | 'none', range?: { min: number, max: number, step: number } | null, defaultValue?: any, options?: Array<{ label: string, value: any }>, allowAuto?: boolean }}
 */
export function resolveModelDurations(activeModel, prop) {
  const dur = activeModel?.parameters?.duration

  // 1. 若模型声明了连续 range，优先以 range 为主体构建，同时收纳伴随的 options（如含 -1 自适应哨兵）
  if (dur?.range && typeof dur.range === 'object') {
    const min = Number(dur.range.min ?? 1)
    const max = Number(dur.range.max ?? 60)
    const step = Number(dur.range.step ?? 1)
    const def = dur.defaultValue ?? dur.default ?? min
    const rangeObj = { min, max, step }
    const res = []
    res.type = 'range'
    res.range = rangeObj
    res.min = min
    res.max = max
    res.step = step
    res.defaultValue = def

    let list = []
    if (Array.isArray(dur?.options) && dur.options.length > 0) {
      list = dur.options.map((opt) => {
        if (opt && typeof opt === 'object' && 'value' in opt) {
          return {
            label: String(opt.label ?? (typeof opt.value === 'number' ? `${opt.value}s` : opt.value)),
            value: opt.value,
          }
        }
        return {
          label: typeof opt === 'number' ? `${opt}s` : String(opt),
          value: opt,
        }
      })
    }
    res.options = list
    if (dur.allowAuto || list.some((o) => Number(o.value) === -1)) {
      res.allowAuto = true
    }
    return res
  }

  // 2. 模型仅提供离散 options
  if (Array.isArray(dur?.options) && dur.options.length > 0) {
    const list = dur.options.map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return {
          label: String(opt.label ?? (typeof opt.value === 'number' ? `${opt.value}s` : opt.value)),
          value: opt.value,
        }
      }
      return {
        label: typeof opt === 'number' ? `${opt}s` : String(opt),
        value: opt,
      }
    })
    const def = dur.defaultValue ?? dur.default ?? list[0]?.value
    const res = [...list]
    res.type = 'options'
    res.options = list
    res.range = null
    res.defaultValue = def
    if (dur.allowAuto || list.some((o) => Number(o.value) === -1)) {
      res.allowAuto = true
    }
    return res
  }

  // 3. 兜底解析 prop.range
  if (
    prop &&
    (prop.minimum !== undefined ||
      prop.min !== undefined ||
      prop.maximum !== undefined ||
      prop.max !== undefined)
  ) {
    const min = Number(prop.minimum ?? prop.min ?? 1)
    const max = Number(prop.maximum ?? prop.max ?? 60)
    const step = Number(prop.step ?? 1)
    const def = prop.default ?? prop.defaultValue ?? min
    const rangeObj = { min, max, step }
    const res = []
    res.type = 'range'
    res.range = rangeObj
    res.min = min
    res.max = max
    res.step = step
    res.defaultValue = def
    res.options = []
    return res
  }

  // 4. 兜底解析 prop.options
  const propOpts = resolveOptions(prop)
  if (propOpts.length > 0) {
    const def = prop?.default ?? prop?.defaultValue ?? propOpts[0]?.value
    const res = [...propOpts]
    res.type = 'options'
    res.options = propOpts
    res.range = null
    res.defaultValue = def
    return res
  }

  const res = []
  res.type = 'none'
  res.range = null
  res.defaultValue = undefined
  res.options = []
  return res
}

/**
 * 依据当前生效模型契约动态推导可用成片分辨率选项。
 * 纯函数无外部依赖，驱动分辨率下拉或分段选择器渲染。
 *
 * @param {object} [activeModel] 当前选定或默认的模型对象
 * @param {object} [prop] 属性定义 (兜底来源)
 * @returns {Array<{ label: string, value: any }>}
 */
export function resolveModelResolutions(activeModel, prop) {
  const modelOptions = activeModel?.parameters?.resolution?.options
  if (Array.isArray(modelOptions) && modelOptions.length > 0) {
    return modelOptions.map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return { label: String(opt.label || opt.value), value: opt.value }
      }
      return { label: String(opt), value: opt }
    })
  }
  return resolveOptions(prop)
}

/**
 * 时长参数自愈清洗：若传入时长超出新模型支持范围，收敛为新模型允许的合法值（上限、吸附值或默认值）。
 *
 * 健全性保障（Issue #2642 Review）：
 * 1. 哨兵值 -1 语义保护：数值比较前剥离 -1，仅在模型明确允许自适应（allowAuto 或 options 含 -1）时放行 -1，
 *    绝不因数值大小比较将正常时长抹平为 -1，也不将合法的 -1 截断为 min；
 * 2. 离散 options 模式下，将非法值安全吸附到最接近的合法正数值选项；
 * 3. 连续 range 模式下，严格执行 [min, max] 双向截断。
 *
 * @param {object} [activeModel]
 * @param {unknown} currentVal
 * @returns {number|unknown}
 */
export function sanitizeModelDuration(activeModel, currentVal) {
  const dur = activeModel?.parameters?.duration
  if (!dur) return currentVal

  const isEmpty =
    currentVal === undefined ||
    currentVal === null ||
    (typeof currentVal === 'string' && currentVal.trim() === '')
  const numVal = isEmpty ? NaN : Number(currentVal)

  const allowAuto = Boolean(
    dur.allowAuto ||
      (Array.isArray(dur.options) &&
        dur.options.some((opt) =>
          opt && typeof opt === 'object' && 'value' in opt
            ? Number(opt.value) === -1
            : Number(opt) === -1,
        )),
  )

  // 哨兵值 -1 特殊语义保护
  if (!Number.isNaN(numVal) && numVal === -1) {
    if (allowAuto) {
      return -1
    }
    // 模型不支持 -1 时，回退到默认值或首个合法选项或 min
    const fallback =
      dur.defaultValue ??
      dur.default ??
      (dur.range?.min !== undefined ? Number(dur.range.min) : undefined)
    return fallback !== undefined ? Number(fallback) : currentVal
  }

  // 1. 连续 range 模式（优先保证 range 滑块能力）
  if (dur.range && typeof dur.range === 'object') {
    const min = Number(dur.range.min ?? 1)
    const max = Number(dur.range.max ?? 60)
    if (isEmpty || Number.isNaN(numVal)) {
      return Number(dur.defaultValue ?? dur.default ?? min)
    }
    if (numVal < min) return min
    if (numVal > max) return max
    return numVal
  }

  // 2. 离散 options 模式
  if (Array.isArray(dur.options) && dur.options.length > 0) {
    const validValues = dur.options
      .map((opt) =>
        opt && typeof opt === 'object' && 'value' in opt ? Number(opt.value) : Number(opt),
      )
      .filter((v) => !Number.isNaN(v) && v !== -1)

    if (isEmpty || Number.isNaN(numVal)) {
      if (dur.defaultValue !== undefined && validValues.includes(Number(dur.defaultValue))) {
        return Number(dur.defaultValue)
      }
      return validValues[0] ?? (allowAuto ? -1 : currentVal)
    }

    if (validValues.includes(numVal)) {
      return numVal
    }

    if (validValues.length > 0) {
      // 非法值吸附到最接近的合法选项
      const closest = validValues.reduce((prev, curr) =>
        Math.abs(curr - numVal) < Math.abs(prev - numVal) ? curr : prev,
      )
      return closest
    }

    if (allowAuto) {
      return -1
    }
    return currentVal
  }

  return currentVal
}

/**
 * 分辨率参数自愈清洗：若传入分辨率不被新模型支持，平滑重置为新模型默认分辨率。
 * @param {object} [activeModel]
 * @param {unknown} currentVal
 * @returns {string|unknown}
 */
export function sanitizeModelResolution(activeModel, currentVal) {
  const resOptions = resolveModelResolutions(activeModel, null)
  if (!resOptions || resOptions.length === 0) return currentVal

  const strVal = String(currentVal ?? '').trim().toLowerCase()
  const matched = resOptions.find((opt) => String(opt.value).trim().toLowerCase() === strVal)
  if (matched) {
    return matched.value
  }

  const def =
    activeModel?.parameters?.resolution?.defaultValue ||
    activeModel?.parameters?.resolution?.default ||
    resOptions[0]?.value
  return def !== undefined ? def : currentVal
}

/**
 * 控件类型解析器：综合 mapping.widget、prop.widget、prop.type、options 特征推导控件形态。
 * 对齐 omnimux-apps 表单规范：
 * - 智能自愈：product_image 或商品相关字段从 media-uploader/library-picker 自愈升级为 product-link；
 * - 显式 mapping.widget / prop.widget 优先；
 * - boolean -> switch-boolean;
 * - number/integer -> slider-range;
 * - array 配合 options 或 enum 统一推导为 multi-tags 胶囊多选；
 * - 选项包含冒号(:)且不超过 4 项时推导为 ratio-cards 比例卡片；
 * - 其余选项列表推导为 select-single 定制下拉；
 * - 长文本/提示词推导为 textarea，其余兜底 input-text。
 *
 * @param {string} key
 * @param {object} prop
 * @param {object} [mapping]
 * @returns {string}
 */
export function resolveWidget(key, prop, mapping) {
  // 旧缓存智能自愈规则 (Issue #2631)
  // 严格收窄至商品图片字段，且仅当原形态为遗留 media-uploader 或 library-picker 时才自愈提升为 product-link
  const isProductImageKey =
    key === 'product_image' ||
    (typeof key === 'string' && key.includes('product_image') && prop?.type === 'string')
  const isLegacyMediaWidget =
    prop?.widget === 'media-uploader' ||
    prop?.widget === 'library-picker' ||
    mapping?.widget === 'media-uploader' ||
    mapping?.widget === 'library-picker'

  if (isProductImageKey && isLegacyMediaWidget) {
    return 'product-link'
  }

  if (mapping?.widget) return mapping.widget
  if (prop?.widget) return prop.widget

  if (prop?.type === 'boolean') return 'switch-boolean'
  if (prop?.type === 'number' || prop?.type === 'integer') return 'slider-range'

  // 支持 options 与 enum 两种方式声明的数组选项
  if (prop?.type === 'array' && resolveOptions(prop).length > 0) {
    return 'multi-tags'
  }

  const opts = resolveOptions(prop)
  if (opts.length > 0 && opts.length <= 4 && opts.some((o) => String(o.value).includes(':'))) {
    return 'ratio-cards'
  }
  if (opts.length > 0) return 'select-single'
  if (key === 'product_link') return 'product-link'
  if (prop?.type === 'string' && ((prop.maxLength !== undefined && prop.maxLength > 100) || (key && key.toLowerCase().includes('prompt')) || prop.title?.includes('提示'))) {
    return 'textarea'
  }
  return 'input-text'
}

/**
 * 媒体预览 URL 安全校验白名单函数（防伪协议注入与 XSS）
 * 仅放行 http(s)://、站点相对路径(/, ./, ../)、blob: 对象 URL 以及安全格式的 base64 图片(data:image/*)。
 * 彻底阻断 javascript:、data:text/html 以及非合法伪协议。
 *
 * @param {unknown} rawUrl
 * @returns {string} 安全可用 URL，非法或不符合时返回空字符串
 */
export function sanitizePreviewUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('\r')) return ''

  // 1. 相对路径
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed
  }

  // 2. 本地对象 URL (blob:)
  if (trimmed.startsWith('blob:')) {
    return trimmed
  }

  // 3. 安全格式的 Base64 图片 (data:image/*)
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp);base64,/i.test(trimmed)) {
    return trimmed
  }

  // 4. 标准 HTTP / HTTPS 链接
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimmed
      }
    } catch {
      return ''
    }
  }

  return ''
}

/**
 * 依据素材来源标识推导人类友好的来源标签
 * @param {unknown} source
 * @returns {string}
 */
export function resolveSourceLabel(source) {
  if (!source || typeof source !== 'string') return ''
  switch (source) {
    case 'product':
      return '商品库'
    case 'upload':
      return '本地上传'
    default:
      return `来源: ${source}`
  }
}

/**
 * 选定值回填展示解析
 * @param {unknown} val
 * @returns {{ name: string, sub: string, source: string, url: string }}
 */
export function displayValueOf(val) {
  if (!val) return { name: '', sub: '', source: 'link', url: '' }
  if (typeof val === 'object') {
    const url = String(val.url || '')
    return {
      name: String(val.name || val.url || '已选素材'),
      sub: val.sub || resolveSourceLabel(val.source),
      source: val.source || 'asset',
      url,
    }
  }
  const str = String(val).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str)
      if (parsed && typeof parsed === 'object') {
        const url = String(parsed.url || '')
        return {
          name: String(parsed.name || parsed.url || '已选素材'),
          sub: parsed.sub || resolveSourceLabel(parsed.source),
          source: parsed.source || 'asset',
          url,
        }
      }
    } catch {
      // ignore
    }
  }
  const urlParts = str.split('/')
  const lastPart = urlParts[urlParts.length - 1]?.split('?')[0] || str
  return {
    name: lastPart.length > 34 ? `${lastPart.slice(0, 16)}...${lastPart.slice(-12)}` : lastPart,
    sub: str.startsWith('http') ? '网络链接' : '已填素材',
    source: 'link',
    url: str,
  }
}
