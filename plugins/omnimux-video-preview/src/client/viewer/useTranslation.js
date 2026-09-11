import { useState, useRef, useEffect } from 'react'

function hasCachedTranslation(translations, langCode) {
  if (!translations) return false
  const cached = translations[langCode]
  if (!cached || typeof cached !== 'object') return false
  return Object.keys(cached).length > 0
}

function extractValidSpeechShots(shots) {
  if (!Array.isArray(shots)) return []
  return shots.filter((s) => Boolean(s.speech) && String(s.speech).trim().length > 0)
}

function attachOutsideClickListener(menuRef, onClose) {
  if (typeof document === 'undefined') return undefined
  const handleOutsideClick = (e) => {
    const el = menuRef.current
    if (el && !el.contains(e.target)) {
      onClose()
    }
  }
  document.addEventListener('mousedown', handleOutsideClick)
  return () => document.removeEventListener('mousedown', handleOutsideClick)
}

async function requestSpeechTranslation(opts) {
  const payload = {
    targetLang: opts.targetLang,
    shots: opts.validShots.map((s) => ({ id: s.id, speech: s.speech })),
    filePath: opts.filePath || '',
  }
  const response = await fetch('/omnimux/video-preview/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) return null
  const res = await response.json()
  return res.translations || null
}

function applyInitialTranslations(setTranslations, initial) {
  if (!initial || typeof initial !== 'object') return
  setTranslations((prev) => ({ ...prev, ...initial }))
}

function mergeLangTranslation(prev, targetLang, result) {
  return { ...prev, [targetLang]: result }
}

async function executeTranslationFlow(opts, setTranslations, setIsTranslating) {
  setIsTranslating(true)
  try {
    const result = await requestSpeechTranslation(opts)
    if (!result) return
    setTranslations((prev) => mergeLangTranslation(prev, opts.targetLang, result))
  } catch {
    // Soft-fail without blocking preview
  } finally {
    setIsTranslating(false)
  }
}

export function useTranslation({ shots, initialTranslations, filePath }) {
  const [selectedLang, setSelectedLang] = useState('original')
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false)
  const [translations, setTranslations] = useState(() => initialTranslations || {})
  const [isTranslating, setIsTranslating] = useState(false)
  const translateMenuRef = useRef(null)

  useEffect(() => {
    applyInitialTranslations(setTranslations, initialTranslations)
  }, [initialTranslations])

  useEffect(() => {
    if (!isLangMenuOpen) return undefined
    return attachOutsideClickListener(translateMenuRef, () => setIsLangMenuOpen(false))
  }, [isLangMenuOpen])

  const handleSelectLanguage = async (langCode) => {
    setSelectedLang(langCode)
    setIsLangMenuOpen(false)
    if (langCode === 'original') return
    if (hasCachedTranslation(translations, langCode)) return

    const validShots = extractValidSpeechShots(shots)
    if (validShots.length === 0) return

    const opts = { targetLang: langCode, validShots, filePath }
    await executeTranslationFlow(opts, setTranslations, setIsTranslating)
  }

  return {
    selectedLang,
    setSelectedLang,
    isLangMenuOpen,
    setIsLangMenuOpen,
    translations,
    setTranslations,
    isTranslating,
    translateMenuRef,
    handleSelectLanguage,
  }
}
