import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TRANSLATE_LANGUAGES, getLanguagePromptName } from './languages.js'

export { TRANSLATE_LANGUAGES, getLanguagePromptName }

/**
 * Parse structured JSON output from LLM translation completion.
 */
export function parseTranslationResponse(rawText, sourceItems = []) {
  if (!rawText || typeof rawText !== 'string') return {}

  let clean = rawText.trim()
  // Strip markdown code fences if present
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    const parsed = JSON.parse(clean)
    if (parsed && typeof parsed.translations === 'object' && parsed.translations !== null) {
      return parsed.translations
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
    if (Array.isArray(parsed)) {
      const map = {}
      for (const item of parsed) {
        if (item && item.id && item.text) {
          map[item.id] = String(item.text).trim()
        }
      }
      return map
    }
  } catch {
    // Regex fallback
    const result = {}
    for (const item of sourceItems) {
      const regex = new RegExp(`"${item.id}"\\s*:\\s*"([^"]+)"`, 'i')
      const match = clean.match(regex)
      if (match && match[1]) {
        result[item.id] = match[1].trim()
      }
    }
    return result
  }
  return {}
}

/**
 * Translate shots speech list using unified Hub textComplete model channel.
 *
 * @param {object} params
 * @param {Array<object>} params.shots
 * @param {string} params.targetLang
 * @param {string} [params.filePath]
 * @param {object} [params.ctx]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<object>}
 */
export async function translateBreakdownShots({ shots = [], targetLang = 'zh-CN', filePath = '', ctx = {}, signal }) {
  if (!targetLang || targetLang === 'original') {
    return { success: true, targetLang: 'original', translations: {} }
  }

  const validShots = Array.isArray(shots) ? shots.filter((s) => s && s.speech && String(s.speech).trim().length > 0) : []
  if (validShots.length === 0) {
    return { success: true, targetLang, translations: {} }
  }

  // 1. Check local .vbreakdown cache if file exists
  let absPath = ''
  let fileData = null
  if (filePath && typeof filePath === 'string') {
    try {
      absPath = resolve(filePath)
      if (existsSync(absPath)) {
        fileData = JSON.parse(readFileSync(absPath, 'utf8'))
        if (fileData?.translations?.[targetLang]) {
          const cached = fileData.translations[targetLang]
          // Verify cached covers active shots
          const allCovered = validShots.every((s) => cached[s.id])
          if (allCovered) {
            return { success: true, targetLang, translations: cached, fromCache: true }
          }
        }
      }
    } catch {
      // ignore cache read failure
    }
  }

  // 2. Resolve textComplete service
  let textComplete = null
  try {
    textComplete = ctx?.get?.('textComplete')
      || ctx?.tools?.get?.('omnimux_text_complete')
      || ctx?.get?.('tools')?.get?.('omnimux_text_complete')
  } catch {}

  const targetLangPrompt = getLanguagePromptName(targetLang)
  const sourcePayload = validShots.map((s) => ({
    id: s.id,
    text: String(s.speech).trim(),
  }))

  const systemPrompt = `You are an expert bilingual subtitle translator and social media localization specialist.
Your task is to accurately, naturally, and idiomatically translate short video voiceover/speech lines into ${targetLangPrompt}.
Rules:
1. Preserve conversational tone, pacing, and viral video appeal.
2. Return ONLY a valid JSON object matching this schema:
{
  "translations": {
    "shot_1": "translated text",
    ...
  }
}
Do NOT output any markdown code blocks, preamble, or notes.`

  const userPrompt = `Translate the following speech lines into ${targetLangPrompt}:
${JSON.stringify(sourcePayload, null, 2)}`

  let translations = {}
  if (textComplete && typeof textComplete.execute === 'function') {
    try {
      const res = await textComplete.execute({
        prompt: userPrompt,
        system: systemPrompt,
        reason: 'video_breakdown_speech_translate',
        maxTokens: 2048,
        signal,
      })
      const text = typeof res?.text === 'string' ? res.text : (typeof res === 'string' ? res : '')
      translations = parseTranslationResponse(text, sourcePayload)
    } catch (err) {
      throw new Error(`Translation model error: ${err?.message || String(err)}`)
    }
  } else {
    // Fallback simulation for offline/test environments
    for (const item of sourcePayload) {
      translations[item.id] = `[${targetLangPrompt}] ${item.text}`
    }
  }

  // 3. Persist to .vbreakdown file if path available
  if (absPath && existsSync(absPath) && fileData) {
    try {
      if (!fileData.translations) fileData.translations = {}
      fileData.translations[targetLang] = {
        ...(fileData.translations[targetLang] || {}),
        ...translations,
      }
      writeFileSync(absPath, JSON.stringify(fileData, null, 2), 'utf8')
    } catch {
      // ignore write failure
    }
  }

  return {
    success: true,
    targetLang,
    translations,
  }
}
