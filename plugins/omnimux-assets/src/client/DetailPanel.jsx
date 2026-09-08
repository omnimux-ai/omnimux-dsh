import { Badge, Drawer } from 'dsh-ui-kit'
import { formatBytes, formatDateTime } from './format.js'

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

function Field({ label, value }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <p style={fieldValue}>{value === '' || value === undefined || value === null ? '—' : String(value)}</p>
    </div>
  )
}

/**
 * Right-hand detail side panel using Drawer primitive. Core-1 rows show file metadata
 * plus the real path (read-only display); core-2 rows show the source traceability block.
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
      <Drawer
        open={Boolean(detail)}
        onClose={onClose}
        placement="right"
        width={320}
        title={String(file.name)}
        aria-label={t('detail.file')}
      >
        <div style={body}>
          <Field label={t('detail.path')} value={realPath} />
          <Field label={t('detail.size')} value={file.is_dir ? '—' : formatBytes(Number(file.size))} />
          <Field label={t('detail.mtime')} value={formatDateTime(String(file.mtime))} />
          <Field label={t('detail.type')} value={file.is_dir ? t('type.other') : t(`type.${file.type}`)} />
        </div>
      </Drawer>
    )
  }

  const artifact = detail.artifact
  const source = artifact?.source ?? {}
  return (
    <Drawer
      open={Boolean(detail)}
      onClose={onClose}
      placement="right"
      width={320}
      title={String(artifact.title)}
      aria-label={t('detail.artifact')}
    >
      <div style={body}>
        <div>
          <Badge
            variant={source.traced ? 'success' : 'warning'}
            shape="capsule"
            size="sm"
          >
            {source.traced ? t('detail.traced') : t('detail.untraced')}
          </Badge>
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
    </Drawer>
  )
}
