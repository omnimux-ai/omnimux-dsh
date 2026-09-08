import { formatBytes, formatDateTime } from './format.js'
import { CloseIcon } from './icons.jsx'

const panel = {
  flex: 'none',
  width: 320,
  overflow: 'auto',
  borderLeft: '1px solid var(--dsw-alias-border, var(--dsw-border, rgba(128,128,128,.25)))',
  background: 'var(--dsw-alias-bg-secondary, var(--dsw-bg, #161616))',
  display: 'flex',
  flexDirection: 'column',
}

const header = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid var(--dsw-alias-border, var(--dsw-border, rgba(128,128,128,.25)))',
}

const title = {
  flex: 1,
  minWidth: 0,
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: '20px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const body = {
  padding: '8px 14px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const fieldLabel = {
  fontSize: 11,
  lineHeight: '16px',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
}

const fieldValue = {
  margin: '2px 0 0',
  fontSize: 13,
  lineHeight: '18px',
  wordBreak: 'break-all',
}

const closeButton = {
  flex: 'none',
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  borderRadius: 4,
  padding: 0,
}

const badge = {
  display: 'inline-block',
  fontSize: 11,
  lineHeight: '16px',
  padding: '1px 8px',
  borderRadius: 8,
}

const tracedBadge = {
  ...badge,
  color: 'var(--dsw-alias-label-success, #3f9142)',
  border: '1px solid var(--dsw-alias-label-success, #3f9142)',
}

const untracedBadge = {
  ...badge,
  color: 'var(--dsw-alias-label-warning, #d48806)',
  border: '1px solid var(--dsw-alias-label-warning, #d48806)',
}

function Field({ label, value }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <p style={fieldValue}>{value === '' || value === undefined || value === null ? '—' : String(value)}</p>
    </div>
  )
}

/**
 * Right-hand detail side panel. Core-1 rows show file metadata plus the real
 * path (read-only display); core-2 rows show the source traceability block.
 * @param {{
 *   t: (key: string) => string,
 *   detail: { kind: 'file', file: any, mapping: any } | { kind: 'artifact', artifact: any },
 *   onClose: () => void,
 * }} props
 */
export function DetailPanel({ t, detail, onClose }) {
  if (!detail) return null

  if (detail.kind === 'file') {
    const { file, mapping } = detail
    const realPath = mapping && typeof mapping.real_path === 'string' && typeof file.relative_path === 'string'
      ? `${mapping.real_path.replace(/\/$/, '')}/${file.relative_path}`
      : ''
    return (
      <aside style={panel} aria-label={t('detail.file')}>
        <div style={header}>
          <h3 style={title} title={String(file.name)}>{String(file.name)}</h3>
          <button /* exempt-ui01: 侧栏详情关闭按钮 */ type="button" aria-label={t('detail.close')} style={closeButton} onClick={onClose}><CloseIcon /></button>
        </div>
        <div style={body}>
          <Field label={t('detail.path')} value={realPath} />
          <Field label={t('detail.size')} value={file.is_dir ? '—' : formatBytes(Number(file.size))} />
          <Field label={t('detail.mtime')} value={formatDateTime(String(file.mtime))} />
          <Field label={t('detail.type')} value={file.is_dir ? t('type.other') : t(`type.${file.type}`)} />
        </div>
      </aside>
    )
  }

  const artifact = detail.artifact
  const source = artifact?.source ?? {}
  return (
    <aside style={panel} aria-label={t('detail.artifact')}>
      <div style={header}>
        <h3 style={title} title={String(artifact.title)}>{String(artifact.title)}</h3>
        <button /* exempt-ui01: 侧栏详情关闭按钮 */ type="button" aria-label={t('detail.close')} style={closeButton} onClick={onClose}><CloseIcon /></button>
      </div>
      <div style={body}>
        <div>
          <span style={source.traced ? tracedBadge : untracedBadge}>
            {source.traced ? t('detail.traced') : t('detail.untraced')}
          </span>
        </div>
        <Field label={t('detail.agent')} value={source.agent} />
        <Field label={t('detail.model')} value={source.model} />
        <Field label={t('detail.promptHash')} value={source.prompt_hash} />
        <Field label={t('detail.runId')} value={source.run_id} />
        <Field label={t('detail.sessionId')} value={source.session_id} />
        <Field label={t('detail.type')} value={t(`type.${artifact.type}`)} />
        <Field label={t('detail.size')} value={formatBytes(Number(artifact.size))} />
        <Field label={t('detail.mtime')} value={formatDateTime(String(artifact.created_at))} />
        <Field label={t('detail.contentRef')} value={artifact.content_ref} />
      </div>
    </aside>
  )
}
