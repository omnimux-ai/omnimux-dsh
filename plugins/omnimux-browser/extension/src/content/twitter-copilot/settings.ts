/** `chrome.storage.local` key for the user's niche keywords (panel writes, copilot reads). */
export const COPILOT_KEYWORDS_STORAGE_KEY = 'omnimux_twitter_keywords'

export const MAX_KEYWORD_TAGS = 12
export const MAX_KEYWORD_LENGTH = 24

/** Separators accepted both when typing a tag and in the stored string. */
const SEPARATORS = /[,，、;；\n]+/

/** Stored string → ordered, de-duplicated tag list. */
export function parseKeywordTags(stored: string): string[] {
  return addKeywordTags([], stored)
}

/** Append every tag found in `raw` (split on separators), skipping blanks, duplicates and overflow. */
export function addKeywordTags(current: readonly string[], raw: string): string[] {
  const next = [...current]
  for (const part of raw.split(SEPARATORS)) {
    const tag = part.trim().slice(0, MAX_KEYWORD_LENGTH)
    if (!tag || next.length >= MAX_KEYWORD_TAGS) continue
    if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue
    next.push(tag)
  }
  return next
}

/** Tag list → stored string (the copilot splits it with the same separators). */
export function serializeKeywordTags(tags: readonly string[]): string {
  return tags.join('、')
}
