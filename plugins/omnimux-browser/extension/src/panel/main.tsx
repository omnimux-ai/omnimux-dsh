import React, { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './styles.css'
import { getUiLocale } from '../i18n.ts'
import { PANEL_COPY } from './strings.ts'

function reportErrorToHost(error: unknown) {
  const errStr = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error)
  console.error('[OmniMux-Workstation-Fatal]', errStr)
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'omnimux-panel',
        type: 'OMNIMUX_PANEL_ERROR',
        error: errStr,
      }, '*')
    }
  } catch {}
}

window.onerror = (_msg, _url, _line, _col, error) => {
  reportErrorToHost(error || _msg)
}

window.onunhandledrejection = (e) => {
  reportErrorToHost(e.reason)
}

class WorkstationErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportErrorToHost({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      const isZh = getUiLocale() === 'zh'
      return (
        <div style={{
          padding: '28px 24px',
          background: '#0b0b0e',
          color: '#f87171',
          height: '100%',
          boxSizing: 'border-box',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 600, fontSize: '15px' }}>
            <span>⚠️</span>
            <span>{isZh ? '工作台初始化遇到异常' : 'Workstation Initialization Error'}</span>
          </div>
          <div style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '13px',
            lineHeight: 1.5,
          }}>
            {this.state.error?.message || (isZh ? '未知渲染错误' : 'Unknown render error')}
          </div>
          <pre style={{
            margin: 0,
            padding: '12px',
            background: '#141419',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#94a3b8',
            fontSize: '11px',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {this.state.error?.stack || ''}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              marginTop: '8px',
              background: '#8b5cf6',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isZh ? '重新加载工作台' : 'Reload Workstation'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

try {
  const locale = getUiLocale()
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  document.title = PANEL_COPY[locale].documentTitle

  const root = document.getElementById('root')
  if (root === null) throw new Error('panel root missing')
  createRoot(root).render(
    <WorkstationErrorBoundary>
      <App />
    </WorkstationErrorBoundary>
  )
} catch (err) {
  reportErrorToHost(err)
}
