import { memo, useState } from 'react'

export const DomFillButton = memo(function DomFillButton({
  textToFill,
  activeTabId
}: {
  textToFill: string
  activeTabId?: number | null
}) {
  const [status, setStatus] = useState<'idle' | 'filling' | 'success' | 'fallback'>('idle')
  const [feedbackMsg, setFeedbackMsg] = useState('')

  const handleFill = async () => {
    if (!textToFill.trim() || status === 'filling') return
    setStatus('filling')

    const cleanText = textToFill
      .replace(/^#+\s+/gm, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Unbold
      .trim()

    // 1. Check if inside float iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'FILL_HOST_DOM',
        text: cleanText
      }, '*')

      const onMessage = (e: MessageEvent) => {
        if (e.data?.type === 'FILL_HOST_DOM_RESULT') {
          window.removeEventListener('message', onMessage)
          const res = e.data.payload
          if (res?.success) {
            setStatus('success')
            setFeedbackMsg(res.message || '已填入')
          } else {
            setStatus('fallback')
            setFeedbackMsg(res?.message || '已复制到剪贴板')
          }
          setTimeout(() => setStatus('idle'), 2500)
        }
      }
      window.addEventListener('message', onMessage)
      setTimeout(() => {
        window.removeEventListener('message', onMessage)
        if (status === 'filling') {
          setStatus('fallback')
          setFeedbackMsg('已复制剪贴板')
          navigator.clipboard.writeText(cleanText).catch(() => {})
          setTimeout(() => setStatus('idle'), 2500)
        }
      }, 1500)
      return
    }

    // 2. Native Side Panel mode: send message to active tab
    if (activeTabId) {
      try {
        const res = await chrome.tabs.sendMessage(activeTabId, {
          action: 'FILL_HOST_DOM',
          payload: { text: cleanText }
        })
        if (res?.success) {
          setStatus('success')
          setFeedbackMsg(res.message || '已填入输入框')
        } else {
          setStatus('fallback')
          setFeedbackMsg(res?.message || '已复制剪贴板')
        }
      } catch {
        setStatus('fallback')
        setFeedbackMsg('已复制剪贴板')
        await navigator.clipboard.writeText(cleanText).catch(() => {})
      }
      setTimeout(() => setStatus('idle'), 2500)
      return
    }

    // 3. Fallback to clipboard
    try {
      await navigator.clipboard.writeText(cleanText)
      setStatus('fallback')
      setFeedbackMsg('已复制到剪贴板')
    } catch {
      setStatus('fallback')
      setFeedbackMsg('复制失败')
    }
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <button
      type="button"
      className={`dom-fill-btn ${status}`}
      onClick={handleFill}
      title="一键将该内容自动填入宿主网页的发帖/评论输入框（支持 Twitter / TikTok / 通用网页）"
      aria-label={status === 'filling' ? '填入中…' : status === 'success' ? (feedbackMsg || '已填入') : status === 'fallback' ? (feedbackMsg || '已复制') : '填入输入框'}
    />
  )
})
