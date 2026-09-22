/**
 * 营销模板名称与提示词的语言取值。
 * 只读宿主语言，不改写页面语言标记。
 */

const LANGUAGE_CODE = /^[a-zA-Z]{2}(-[a-zA-Z0-9]+)?$/

export function isValidLanguageCode(code) {
  if (typeof code !== 'string') return false
  const trimmed = code.trim()
  return LANGUAGE_CODE.test(trimmed)
}

/**
 * 语言优先级：翻译函数 → 页面语言标记 → 显式传入 → 中文。
 * @param {string | undefined} locale
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
export function resolveTemplateLocale(locale, t) {
  if (typeof t === 'function') {
    try {
      const fromLocale = t('locale')
      if (isValidLanguageCode(fromLocale)) return fromLocale.trim()
      const fromGuide = t('guide.locale')
      if (isValidLanguageCode(fromGuide)) return fromGuide.trim()
    } catch {
      // 翻译函数抛错时继续向下读取宿主语言
    }
  }
  if (typeof document !== 'undefined' && document?.documentElement?.lang) {
    const docLang = String(document.documentElement.lang).trim()
    if (isValidLanguageCode(docLang)) return docLang
  }
  if (isValidLanguageCode(locale)) return locale.trim()
  return 'zh'
}

export function isEnglishTemplateLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('en')
}

function firstText(...values) {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) return text
  }
  return ''
}

/**
 * 按语言取出模板名称与提示词。缺字段时回退到另一语言，避免空白。
 * 英文提示词保持 prompt 字段，供生成侧继续使用；中文提示词为 promptZh。
 * @param {object | null | undefined} item
 * @param {string} locale
 * @returns {{ title: string, prompt: string }}
 */
export function resolveTemplateCopy(item, locale) {
  if (!item) return { title: '', prompt: '' }
  const en = isEnglishTemplateLocale(locale)
  const title = en
    ? firstText(item.titleEn, item.nameEn, item.title, item.titleZh, item.nameZh)
    : firstText(item.title, item.titleZh, item.nameZh, item.titleEn, item.nameEn)
  const prompt = en
    ? firstText(item.prompt, item.promptEn, item.promptZh)
    : firstText(item.promptZh, item.prompt)
  return { title, prompt }
}
