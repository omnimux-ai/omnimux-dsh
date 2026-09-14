import React, { memo, useState } from 'react'
import type { DraftDocument, DraftField } from '../../shared/draft.ts'
import { EditIcon, CopyIcon, CheckIcon } from './icons.tsx'
import './FormDraftCard.css'

export interface FormDraftCardProps {
  draft: DraftDocument
  onFill: (fields: DraftField[]) => Promise<{ ok: boolean; message?: string }>
  targetLabel?: string
  disabled?: boolean
  locale?: 'zh' | 'en'
}

export const FormDraftCard = memo(function FormDraftCard({
  draft,
  onFill,
  targetLabel,
  disabled = false,
  locale = 'zh',
}: FormDraftCardProps) {
  const isEn = locale === 'en'
  const variants = draft.variants || []
  const [activeVariantId, setActiveVariantId] = useState<string>(variants[0]?.id || '')

  // Independent edit state keyed by variant ID
  const [editedValues, setEditedValues] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {}
    for (const v of variants) {
      initial[v.id] = {}
      for (const f of v.fields) {
        initial[v.id][f.id] = f.value
      }
    }
    return initial
  })

  const [fillStatus, setFillStatus] = useState<'idle' | 'filling' | 'success' | 'error'>('idle')
  const [fillMsg, setFillMsg] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const activeVariant = variants.find((v) => v.id === activeVariantId) || variants[0]

  const handleFieldChange = (variantId: string, fieldId: string, value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] || {}),
        [fieldId]: value,
      },
    }))
  }

  const getEffectiveField = (variantId: string, field: DraftField): DraftField => {
    const val = editedValues[variantId]?.[field.id] !== undefined
      ? editedValues[variantId][field.id]
      : field.value
    return { ...field, value: val }
  }

  const currentFields = (activeVariant?.fields || []).map((f) =>
    getEffectiveField(activeVariant.id, f)
  )

  const totalChars = currentFields.reduce((sum, f) => sum + (f.value?.length || 0), 0)

  const handleCopy = async () => {
    if (copyStatus !== 'idle') return
    const textToCopy = currentFields.map((f) => f.value).join('\n\n')
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  const handleFill = async () => {
    if (fillStatus === 'filling' || disabled) return
    setFillStatus('filling')
    try {
      const res = await onFill(currentFields)
      if (res && res.ok) {
        setFillStatus('success')
        setFillMsg(res.message || (isEn ? 'Filled!' : '已填写'))
      } else {
        setFillStatus('error')
        setFillMsg(res?.message || (isEn ? 'Failed' : '填写失败'))
      }
    } catch (err) {
      setFillStatus('error')
      setFillMsg(err instanceof Error ? err.message : (isEn ? 'Failed' : '填写失败'))
    }
    setTimeout(() => setFillStatus('idle'), 2500)
  }

  const getFillButtonLabel = () => {
    if (fillStatus === 'filling') return isEn ? 'Filling…' : '填写中…'
    if (fillStatus === 'success') return fillMsg || (isEn ? 'Filled!' : '已填写')
    if (fillStatus === 'error') return fillMsg || (isEn ? 'Failed' : '填写失败')
    return isEn ? 'Fill Form' : '一键填写'
  }

  const getCopyButtonLabel = () => {
    if (copyStatus === 'copied') return isEn ? 'Copied' : '已复制'
    if (copyStatus === 'error') return isEn ? 'Copy failed' : '复制失败'
    return isEn ? 'Copy' : '复制'
  }

  return (
    <div className="form-draft-card">
      <div className="draft-header">
        <div className="draft-title">
          <EditIcon size={13} />
          <span>{draft.title}</span>
        </div>
        {targetLabel && <span className="draft-target-badge">{targetLabel}</span>}
      </div>

      {variants.length > 1 && (
        <div className="draft-tabs" role="tablist">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === activeVariant?.id}
              className={`draft-tab ${v.id === activeVariant?.id ? 'active' : ''}`}
              onClick={() => setActiveVariantId(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="draft-fields">
        {currentFields.map((field) => (
          <div key={field.id} className="draft-field-group">
            {(currentFields.length > 1 || field.label !== '正文') && (
              <div className="draft-field-label">{field.label}</div>
            )}
            <textarea
              className="draft-field-textarea"
              value={field.value}
              disabled={disabled}
              onChange={(e) =>
                activeVariant && handleFieldChange(activeVariant.id, field.id, e.target.value)
              }
              rows={Math.min(10, Math.max(3, (field.value || '').split('\n').length))}
            />
          </div>
        ))}
      </div>

      <div className="draft-footer">
        <div className="draft-meta">{totalChars} 字</div>
        <div className="draft-actions">
          <button
            type="button"
            className="draft-btn draft-copy-btn"
            onClick={handleCopy}
            disabled={disabled}
          >
            {copyStatus === 'copied' ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            <span>{getCopyButtonLabel()}</span>
          </button>
          <button
            type="button"
            className={`draft-btn draft-fill-btn ${fillStatus}`}
            onClick={handleFill}
            disabled={disabled || fillStatus === 'filling'}
          >
            <EditIcon size={12} />
            <span>{getFillButtonLabel()}</span>
          </button>
        </div>
      </div>
    </div>
  )
})
