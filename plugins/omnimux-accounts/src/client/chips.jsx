import { useState } from 'react'
import { Badge } from 'dsh-ui-kit'
import { platformInfo } from './platforms.js'
import { localeText } from './view.js'

const KNOWN_STATUSES = Object.freeze(['active', 'expiring', 'expired', 'error'])

const STATUS_VARIANTS = Object.freeze({
  active: 'success',
  expiring: 'warning',
  expired: 'error',
  error: 'error',
})

/**
 * Colored status dot. Four states; an unrecognized status renders as error
 * (matching the hub's computeStatus normalization).
 * @param {{ status: unknown, label?: string }} props
 */
export function StatusDot({ status, label = '' }) {
  const safe = KNOWN_STATUSES.includes(/** @type {string} */ (status)) ? /** @type {'active' | 'expiring' | 'expired' | 'error'} */ (status) : 'error'
  const text = label !== '' ? label : safe
  const statusVariant = STATUS_VARIANTS[safe] || 'error'
  return (
    <Badge
      variant={statusVariant}
      dot
      size="sm"
      role="img"
      aria-label={text}
      title={text}
      className={`omnimux-accounts-dot omnimux-accounts-dot--${safe}`}
    />
  )
}

/**
 * Platform chip in the platform's official color. Solid tone (TikTok / X) is
 * a dark chip with a white label; accent tone is the brand color on a 16%
 * color-mix background driven by the inline --dsw-accounts-platform-color var.
 * @param {{ platform: unknown, t: (key: string) => string }} props
 */
export function PlatformChip({ platform, t }) {
  const info = platformInfo(platform)
  const label = localeText(t, `platform.${info.id}`, String(platform || info.id))
  if (info.tone === 'solid') {
    return (
      <Badge
        shape="capsule"
        size="sm"
        className="omnimux-accounts-chip omnimux-accounts-chip--solid"
      >
        {label}
      </Badge>
    )
  }
  return (
    <Badge
      shape="capsule"
      size="sm"
      className="omnimux-accounts-chip omnimux-accounts-chip--accent"
      style={{ '--dsw-accounts-platform-color': info.color }}
    >
      {label}
    </Badge>
  )
}

/**
 * Neutral group chip.
 * @param {{ group: string }} props
 */
export function GroupChip({ group }) {
  return (
    <Badge
      variant="neutral"
      shape="capsule"
      size="sm"
      className="omnimux-accounts-chip omnimux-accounts-chip--group"
    >
      {group}
    </Badge>
  )
}

/**
 * 40×40 rounded avatar. Falls back to the platform's initial when the row has
 * no avatar_url or the image fails to load.
 * @param {{ account: Record<string, unknown>, t: (key: string) => string }} props
 */
export function Avatar({ account, t }) {
  const [failed, setFailed] = useState(false)
  const url = typeof account.avatar_url === 'string' ? account.avatar_url : ''
  const info = platformInfo(account.platform)
  const platformLabel = localeText(t, `platform.${info.id}`, String(account.platform || ''))
  const initial = (platformLabel || '?').charAt(0).toLocaleUpperCase() || '?'
  if (url && !failed) {
    return (
      <img
        className="omnimux-accounts-avatar"
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => { setFailed(true) }}
      />
    )
  }
  return <span className="omnimux-accounts-avatar-fallback" aria-hidden="true">{initial}</span>
}
