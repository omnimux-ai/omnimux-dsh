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
 * 控件类型解析器：综合 mapping.widget、prop.widget、prop.type、options 特征推导控件形态。
 * 对齐 omnimux-apps 表单规范：
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
      sub: val.sub || (val.source === 'product' ? '商品库' : val.source === 'upload' ? '本地上传' : val.source ? `来源: ${val.source}` : ''),
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
          sub: parsed.sub || (parsed.source === 'product' ? '商品库' : parsed.source === 'upload' ? '本地上传' : parsed.source ? `来源: ${parsed.source}` : ''),
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
