/**
 * plugins/omnimux-workflow/src/client/projects/appTabWidgets.js
 *
 * Form widgets logic and option resolvers for AI Application Tab (Issue #2607).
 * Pure functions without React dependencies for deterministic testing.
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
  if (prop?.type === 'array' && Array.isArray(prop?.options) && prop.options.length > 0) {
    return 'multi-tags'
  }
  const opts = resolveOptions(prop)
  if (opts.length > 0 && opts.length <= 4 && opts.some((o) => String(o.value).includes(':'))) {
    return 'ratio-cards'
  }
  if (opts.length > 0) return 'select-single'
  if (prop?.type === 'string' && ((prop.maxLength !== undefined && prop.maxLength > 100) || (key && key.toLowerCase().includes('prompt')) || prop.title?.includes('提示'))) {
    return 'textarea'
  }
  return 'input-text'
}

/**
 * 选定值回填展示解析
 * @param {unknown} val
 * @returns {{ name: string, sub: string, source: string }}
 */
export function displayValueOf(val) {
  if (!val) return { name: '', sub: '', source: 'link' }
  if (typeof val === 'object') {
    return {
      name: String(val.name || val.url || '已选素材'),
      sub: val.sub || (val.source ? `来源: ${val.source}` : ''),
      source: val.source || 'asset',
    }
  }
  const str = String(val).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str)
      if (parsed && typeof parsed === 'object') {
        return {
          name: String(parsed.name || parsed.url || '已选素材'),
          sub: parsed.sub || (parsed.source ? `来源: ${parsed.source}` : ''),
          source: parsed.source || 'asset',
        }
      }
    } catch {
      // ignore
    }
  }
  const urlParts = str.split('/')
  const lastPart = urlParts[urlParts.length - 1]?.split('?')[0] || str
  return {
    name: lastPart.length > 32 ? `${lastPart.slice(0, 16)}...${lastPart.slice(-12)}` : lastPart,
    sub: str.startsWith('http') ? '网络链接' : '已填素材',
    source: 'link',
  }
}
