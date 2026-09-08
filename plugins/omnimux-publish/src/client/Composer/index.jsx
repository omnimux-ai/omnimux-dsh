import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCheckOutline16,
  IconChevronLeftOutline14,
  IconPaperclipOutline16,
  IconPlayOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, InputField, Toolbar } from 'dsh-ui-kit'
import { createDraft, errorText, getCapabilities, mediaContentUrl, recordDetail, submitRecord, updateDraft, uploadMedia } from '../api.js'
import { formCapabilities, parseTopics } from '../capabilities.js'
import { AccountPanel } from '../AccountPanel.jsx'

/**
 * M2–M4 发布页：类型选择（视频/图文，选定不可中途切换）→ 表单 + 左侧账号面板。
 * 草稿保存/完整恢复（素材、内容、已选账号、类型都来自 Host 账本）；封面区按
 * 所选账号平台能力置灰并说明（capabilities.js 与工具校验同一份矩阵）。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   draftId?: string,
 *   onBack: () => void,
 *   onSubmitted: (recordId: string) => void,
 *   onSaved: () => void,
 * }} props
 */
export function Composer({ t, draftId, onBack, onSubmitted, onSaved }) {
  const [editingId, setEditingId] = useState(draftId || '')
  const [type, setType] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [topicsRaw, setTopicsRaw] = useState('')
  /** @type {[Array<{ id: string, kind: string, filename: string }>, Function]} */
  const [mediaList, setMediaList] = useState([])
  const [coverMediaId, setCoverMediaId] = useState('')
  const [accountIds, setAccountIds] = useState([])
  /** @type {[Array<Record<string, unknown>>, Function]} */
  const [accountRows, setAccountRows] = useState([])
  const [platforms, setPlatforms] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // 能力矩阵（表单裁剪数据源，与工具校验同源）
  useEffect(() => {
    let disposed = false
    getCapabilities().then((result) => {
      if (!disposed && result.ok && result.body && result.body.platforms) setPlatforms(result.body.platforms)
    }).catch(() => {})
    return () => { disposed = true }
  }, [])

  // 编辑现有草稿：完整恢复（素材、内容、账号、类型；素材 kind 来自 Host media 行）
  useEffect(() => {
    if (!draftId) return
    let disposed = false
    recordDetail(draftId).then((result) => {
      if (disposed) return
      const record = result.ok && result.body ? result.body.record : null
      if (!record) {
        setError(errorText(result.body, result.status))
        return
      }
      setType(String(record.type || ''))
      setTitle(String(record.title || ''))
      setDescription(String(record.description || ''))
      setTopicsRaw(Array.isArray(record.topics) ? record.topics.join(' ') : '')
      const mediaRows = Array.isArray(result.body.media) ? result.body.media : []
      setMediaList(mediaRows.map((row) => ({ id: String(row.id), kind: String(row.kind || 'image'), filename: String(row.filename || '') })))
      setCoverMediaId(record.cover_media_id ? String(record.cover_media_id) : '')
      setAccountIds((Array.isArray(record.account_ids) ? record.account_ids : []).map(String))
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
    return () => { disposed = true }
  }, [draftId])

  const images = mediaList.filter((m) => m.kind === 'image')
  const videos = mediaList.filter((m) => m.kind === 'video')
  const caps = formCapabilities({
    platforms,
    selectedAccounts: accountRows,
    type: type || 'image',
    imageCount: images.length,
  })

  /** 媒体拾取 → POST /dsh-publish/media（sha256 入库）→ 草稿引用 media_id。 */
  const handleFiles = useCallback(async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    setUploading(true)
    setError('')
    for (const file of list) {
      try {
        const result = await uploadMedia(file)
        if (result.ok && result.body && result.body.media) {
          const media = result.body.media
          setMediaList((prev) => [...prev, { id: String(media.id), kind: String(media.kind), filename: String(media.filename) }])
        } else {
          setError(t('form.uploadFailed', { reason: errorText(result.body, result.status) }))
        }
      } catch (caught) {
        setError(t('form.uploadFailed', { reason: caught instanceof Error ? caught.message : String(caught) }))
      }
    }
    setUploading(false)
  }, [t])

  /**
   * 组装提交给 Host 的 payload（与 publish_create_draft 同构）。
   */
  const buildPayload = useCallback(() => {
    /** @type {Record<string, unknown>} */
    const payload = {
      title,
      description,
      topics: parseTopics(topicsRaw),
      media: mediaList.map((m) => ({ media_id: m.id })),
    }
    if (type === 'image' && coverMediaId) payload.cover = { media_id: coverMediaId }
    return payload
  }, [title, description, topicsRaw, mediaList, coverMediaId, type])

  /**
   * 保存草稿（新建或更新，含账号挂载——Host 走与 assign 工具同一条校验）。
   * @param {{ withAccounts?: boolean }} [opts]
   * @returns {Promise<string | null>} record id
   */
  const persistDraft = useCallback(async (opts = {}) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      let id = editingId
      const payload = opts.withAccounts !== false
        ? { ...buildPayload(), account_ids: accountIds }
        : buildPayload()
      if (!id) {
        const result = await createDraft(type, payload)
        if (!result.ok || !result.body || !result.body.record) {
          throw new PublishUiError(errorText(result.body, result.status), result.body)
        }
        id = String(result.body.record.id)
        setEditingId(id)
      } else {
        const result = await updateDraft(id, payload)
        if (!result.ok) throw new PublishUiError(errorText(result.body, result.status), result.body)
      }
      setNotice(t('form.saved'))
      onSaved()
      return id
    } catch (caught) {
      setError(describeError(caught, t))
      return null
    } finally {
      setBusy(false)
    }
  }, [editingId, buildPayload, type, accountIds, t, onSaved])

  /** 一键发布：保存 → POST submit（立即返回）→ 轮询跟进由舞台层接管。 */
  const handleSubmit = useCallback(async () => {
    if (accountIds.length === 0) {
      setError(t('form.submitNoAccounts'))
      return
    }
    const id = await persistDraft({ withAccounts: true })
    if (!id) return
    setBusy(true)
    try {
      const result = await submitRecord(id)
      if (!result.ok) throw new PublishUiError(errorText(result.body, result.status), result.body)
      onSubmitted(id)
    } catch (caught) {
      setError(describeError(caught, t))
    } finally {
      setBusy(false)
    }
  }, [accountIds.length, persistDraft, onSubmitted, t])

  // ---- M2 类型选择（新草稿入口）----
  if (!type) {
    return (
      <div className="omnimux-publish-type-page">
        <div className="omnimux-publish-type-toolbar">
          <Button variant="ghost" size="sm" leadingIcon={<IconChevronLeftOutline14 />} onClick={onBack}>
            {t('form.back')}
          </Button>
        </div>
        <div className="omnimux-publish-type-pick">
          <div className="omnimux-publish-type-title">{t('type.title')}</div>
          <div className="omnimux-publish-type-row">
            <TypeCard t={t} value="video" onPick={setType} />
            <TypeCard t={t} value="image" onPick={setType} />
          </div>
        </div>
      </div>
    )
  }

  const coverBlocked = type === 'image' && !caps.cover.enabled

  return (
    <div className="omnimux-publish-composer">
      <AccountPanel
        t={t}
        selectedIds={accountIds}
        onChange={(ids, rows) => { setAccountIds(ids); setAccountRows(rows) }}
      />

      <div className="omnimux-publish-form">
        <Toolbar
          compact
          left={(
            <>
              <Button variant="ghost" size="sm" leadingIcon={<IconChevronLeftOutline14 />} onClick={onBack}>
                {t('form.back')}
              </Button>
              <span>{t(`type.${type}`)}</span>
              {editingId ? <span className="omnimux-publish-lock">{t('type.locked')}</span> : null}
            </>
          )}
          right={(
            <>
              <Button variant="secondary" size="sm" disabled={uploading} loading={busy} onClick={() => { void persistDraft() }}>
                {t('form.saveDraft')}
              </Button>
              <Button variant="primary" size="sm" disabled={uploading} loading={busy} onClick={() => { void handleSubmit() }}>
                {busy ? t('form.submitting') : t('form.submit')}
              </Button>
            </>
          )}
        />

        {error ? <div role="alert" className="omnimux-publish-alert error">{error}</div> : null}
        {notice ? <div role="status" className="omnimux-publish-alert ok">{notice}</div> : null}

        <InputField
          label={t('form.title')}
          value={title}
          placeholder={t('form.titlePlaceholder')}
          onChange={(event) => { setTitle(event.currentTarget.value) }}
        />

        <label className="omnimux-publish-field">
          <span className="omnimux-publish-label">{t('form.description')}</span>
          <textarea
            value={description}
            placeholder={t('form.descriptionPlaceholder')}
            rows={4}
            className="omnimux-publish-textarea"
            onChange={(event) => { setDescription(event.currentTarget.value) }}
          />
        </label>

        <InputField
          label={t('form.topics')}
          value={topicsRaw}
          placeholder={t('form.topicsPlaceholder')}
          onChange={(event) => { setTopicsRaw(event.currentTarget.value) }}
        />

        <div className="omnimux-publish-field">
          <span className="omnimux-publish-label">{t('form.media')}</span>
          <div className="omnimux-publish-media">
            {mediaList.map((media) => (
              <div key={media.id} className="omnimux-publish-media-item">
                {media.kind === 'image' ? (
                  <img src={mediaContentUrl(media.id)} alt={media.filename} className="omnimux-publish-thumb" />
                ) : (
                  <div className="omnimux-publish-thumb"><IconPlayOutline16 size={20} /></div>
                )}
                <div className="omnimux-publish-media-actions">
                  {type === 'image' && media.kind === 'image' ? (
                    <Button
                      type="button"
                      size="xs"
                      variant={coverMediaId === media.id ? 'secondary' : 'ghost'}
                      disabled={coverBlocked}
                      leadingIcon={coverMediaId === media.id ? <IconCheckOutline16 size={14} /> : undefined}
                      onClick={() => { setCoverMediaId(media.id) }}
                    >
                      {coverMediaId === media.id ? t('form.cover') : t('form.setCover')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    leadingIcon={<IconTrashOutline16 size={14} />}
                    onClick={() => {
                      setMediaList((prev) => prev.filter((m) => m.id !== media.id))
                      if (coverMediaId === media.id) setCoverMediaId('')
                    }}
                  >
                    {t('form.remove')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="omnimux-publish-add-media"
              disabled={uploading}
              loading={uploading}
              leadingIcon={<IconPlusOutline16 />}
              onClick={() => { if (fileInputRef.current) fileInputRef.current.click() }}
            >
              {type === 'video' ? t('form.addMedia.video') : t('form.addMedia.image')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple={type === 'image'}
              accept={type === 'video' ? 'video/*' : 'image/*'}
              hidden
              onChange={(event) => {
                void handleFiles(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </div>
          {type === 'video' && videos.length === 0 ? <Hint text={t('form.needVideo')} /> : null}
          {type === 'image' && images.length === 0 ? <Hint text={t('form.needImage')} /> : null}
          {type === 'image' && typeof caps.imageLimit === 'number' ? (
            <Hint text={caps.imageOverLimit ? t('form.imageOverLimit', { count: images.length, max: caps.imageLimit }) : t('form.imageLimit', { count: caps.imageLimit })} tone={caps.imageOverLimit ? 'warn' : 'muted'} />
          ) : null}
          {caps.typeConflicts.length > 0 ? (
            <Hint text={`${caps.typeConflicts.join(', ')} × ${t(`type.${type}`)}`} tone="warn" />
          ) : null}
        </div>

        {type === 'image' ? (
          <div className={coverBlocked ? 'omnimux-publish-field dim' : 'omnimux-publish-field'}>
            <span className="omnimux-publish-label">{t('form.cover')}</span>
            <div className="omnimux-publish-cover-row">
              {coverMediaId ? (
                <img src={mediaContentUrl(coverMediaId)} alt="" className="omnimux-publish-thumb sm" />
              ) : (
                <div className="omnimux-publish-thumb sm"><IconPaperclipOutline16 size={18} /></div>
              )}
              {coverBlocked ? (
                <span className="omnimux-publish-cover-note">
                  {t('form.coverDisabled', { platforms: caps.cover.blockedPlatforms.join(', ') })}
                </span>
              ) : (
                <span className="omnimux-publish-cover-note">{coverMediaId ? <IconCheckOutline16 size={14} /> : '—'}</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** UI 层错误（携带 Host 校验 details 时展开成行内错误）。 */
class PublishUiError extends Error {
  /**
   * @param {string} message
   * @param {unknown} body
   */
  constructor(message, body) {
    super(message)
    this.body = body
  }
}

/**
 * @param {unknown} caught
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 */
function describeError(caught, t) {
  const body = caught instanceof PublishUiError ? caught.body : null
  const details = body && typeof body === 'object' && Array.isArray(/** @type {any} */ (body).details?.errors)
    ? /** @type {any} */ (body).details.errors
    : null
  if (details && details.length > 0) {
    return `${t('form.submitBlocked', { reason: '' })}${details.map((e) => String(e.message || e.code || '')).join('\n')}`
  }
  return caught instanceof Error ? caught.message : String(caught)
}

/**
 * @param {{ t: (key: string, vars?: Record<string, unknown>) => string, value: 'video' | 'image', onPick: (value: 'video' | 'image') => void }} props
 */
function TypeCard({ t, value, onPick }) {
  const Icon = value === 'video' ? IconPlayOutline16 : IconPaperclipOutline16
  // Native <button>: dsh-ui-kit Button is locked to 32px single-row; type cards
  // are multi-line selection tiles (icon + name + hint) and must not inherit it.
  return (
    <button /* exempt-ui01: 多行卡片选择器，非32px单行按钮 */
      type="button"
      className="omnimux-publish-type-card"
      onClick={() => { onPick(value) }}
    >
      <span className="omnimux-publish-type-icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="omnimux-publish-type-name">{t(`type.${value}`)}</span>
      <span className="omnimux-publish-type-hint">{t(`type.${value}.hint`)}</span>
    </button>
  )
}

/**
 * @param {{ text: string, tone?: 'muted' | 'warn' }} props
 */
function Hint({ text, tone = 'muted' }) {
  return <div className={tone === 'warn' ? 'omnimux-publish-hint warn' : 'omnimux-publish-hint'}>{text}</div>
}
