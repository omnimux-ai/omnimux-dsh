import { useState, useEffect } from 'react'

function getIsZhLocale() {
  if (typeof document === 'undefined') {
    return true
  }
  const lang = (document.documentElement.lang || '').toLowerCase()
  return !lang.startsWith('en')
}

export function useIsZh() {
  const [isZh, setIsZh] = useState(getIsZhLocale)

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }
    const update = () => {
      setIsZh(getIsZhLocale())
    }
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })
    return () => observer.disconnect()
  }, [])

  return isZh
}
