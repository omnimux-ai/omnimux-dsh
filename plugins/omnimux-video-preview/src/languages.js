/**
 * Supported 18 translation languages matching design reference Image 3.
 */
export const TRANSLATE_LANGUAGES = [
  { code: 'original', label: 'Original' },
  { code: 'en', label: 'English', targetPrompt: 'English' },
  { code: 'ja', label: '日本語', targetPrompt: 'Japanese' },
  { code: 'ko', label: '한국어', targetPrompt: 'Korean' },
  { code: 'de', label: 'Deutsch', targetPrompt: 'German' },
  { code: 'es', label: 'Español', targetPrompt: 'Spanish' },
  { code: 'fr', label: 'Français', targetPrompt: 'French' },
  { code: 'it', label: 'Italiano', targetPrompt: 'Italian' },
  { code: 'ru', label: 'Русский', targetPrompt: 'Russian' },
  { code: 'id', label: 'Bahasa Indonesia', targetPrompt: 'Indonesian' },
  { code: 'ms', label: 'Bahasa Melayu', targetPrompt: 'Malay' },
  { code: 'th', label: 'ภาษาไทย', targetPrompt: 'Thai' },
  { code: 'vi', label: 'Tiếng标识/Vietnamese', targetPrompt: 'Vietnamese', labelZh: '越南语' },
  { code: 'fil', label: 'Filipino', targetPrompt: 'Filipino' },
  { code: 'pt', label: 'Português', targetPrompt: 'Portuguese' },
  { code: 'pt-BR', label: 'Português (Brasil)', targetPrompt: 'Brazilian Portuguese' },
  { code: 'zh-CN', label: '简体中文', targetPrompt: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁体中文', targetPrompt: 'Traditional Chinese' },
]

// Accurate label patch for Tiếng Việt
const viItem = TRANSLATE_LANGUAGES.find((l) => l.code === 'vi')
if (viItem) viItem.label = 'Tiếng Việt'

/**
 * Resolve target language display name for model prompt.
 */
export function getLanguagePromptName(langCode) {
  const item = TRANSLATE_LANGUAGES.find((l) => l.code === langCode || l.label === langCode)
  return item?.targetPrompt || item?.label || langCode
}
