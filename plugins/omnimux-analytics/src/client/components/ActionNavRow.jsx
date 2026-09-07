import { IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, Tabs } from 'dsh-ui-kit'
import { minutesBetween } from '../format.js'

function formatMinutes(t, info, ago) {
  if (info.kind === 'justNow') return t(ago ? 'sync.justNow' : 'sync.soon')
  const template = t(ago ? 'sync.minutesAgo' : 'sync.minutesLater')
  return template.replace('{n}', String(info.minutes))
}

/**
 * Layer 2: posting / inbox segmented control + sync status + Sync now.
 */
export function ActionNavRow({ t, tab, syncStatus, syncing, now = Date.now(), onTabChange, onSync }) {
  const last = minutesBetween(syncStatus?.lastSyncedAt, now)
  const next = minutesBetween(syncStatus?.nextSyncAt, now)
  const caption = syncing
    ? t('sync.pulling')
    : syncStatus?.lastSyncedAt
      ? `${t('sync.last')}：${formatMinutes(t, last, true)} · ${t('sync.next')}：${formatMinutes(t, next, false)}`
      : t('loading')

  return (
    <div className="omnimux-analytics-stage-action-row">
      <Tabs
        variant="underline"
        items={[
          { id: 'posting', label: t('tab.posting') },
          { id: 'inbox', label: t('tab.inbox') },
        ]}
        activeId={tab}
        onChange={onTabChange}
      />
      <div className="omnimux-analytics-sync">
        <span className="omnimux-analytics-sync-caption">{caption}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={syncing}
          disabled={syncing}
          leadingIcon={<IconRefreshOutline14 />}
          onClick={onSync}
        >
          {syncing ? t('sync.syncing') : t('sync.now')}
        </Button>
      </div>
    </div>
  )
}
