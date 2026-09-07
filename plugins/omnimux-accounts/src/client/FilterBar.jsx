import { FilterBar as KitFilterBar, SearchField, DropdownSelect, IconButton } from 'dsh-ui-kit'
import { Tabs } from 'dsh-ui-kit'
import { DEFAULT_SORT_DIRECTIONS, localeText } from './view.js'

/**
 * Filter toolbar: search, platform / group / status dropdowns (options are
 * derived from live data — a control with no options is not rendered), sort
 * key + direction, and the grid / table view toggle (persisted by the
 * section).
 * @param {{
 *   t: (key: string) => string,
 *   query: string,
 *   platform: string,
 *   group: string,
 *   status: string,
 *   sortKey: string,
 *   sortDir: 'asc' | 'desc',
 *   view: 'grid' | 'table',
 *   platforms: string[],
 *   groups: string[],
 *   statuses: string[],
 *   onFilterChange: (patch: { query?: string, platform?: string, group?: string, status?: string }) => void,
 *   onSortChange: (patch: { key?: string, dir?: 'asc' | 'desc' }) => void,
 *   onViewChange: (view: 'grid' | 'table') => void,
 *   busy: string,
 * }} props
 */
export function FilterBar(props) {
  const { t, query, platform, group, status, sortKey, sortDir, view, platforms, groups, statuses, onFilterChange, onSortChange, onViewChange, busy = '' } = props
  const disabled = busy !== ''
  const sortOptions = [
    { value: 'display_name', label: t('sort.display_name') },
    { value: 'platform', label: t('sort.platform') },
    { value: 'status', label: t('sort.status') },
    { value: 'last_used_at', label: t('sort.lastUsed') },
    { value: 'connected_at', label: t('sort.connectedAt') },
    { value: 'expires_at', label: t('sort.expiresAt') },
  ]
  const platformOptions = [
    { value: '', label: `${t('platform')} · ${t('all')}` },
    ...platforms.map((value) => ({ value, label: localeText(t, `platform.${value}`, value) })),
  ]
  const groupOptions = [
    { value: '', label: `${t('group')} · ${t('all')}` },
    ...groups.map((value) => ({ value, label: value })),
  ]
  const statusOptions = [
    { value: '', label: `${t('filter.status')} · ${t('all')}` },
    ...statuses.map((value) => ({ value, label: t(`status.${value}`) })),
  ]

  return (
    <KitFilterBar
      className="omnimux-accounts-filterbar"
      compact
      search={(
        <SearchField
          value={query}
          placeholder={t('filter.search')}
          aria-label={t('filter.search')}
          disabled={disabled}
          debounceMs={0}
          stretch
          onValueChange={(next) => { onFilterChange({ query: next }) }}
        />
      )}
      filters={(
        <Tabs
          variant="underline"
          items={[
            { id: '', label: t('platform') },
            ...platforms.map((value) => ({ id: value, label: localeText(t, `platform.${value}`, value) })),
          ]}
          activeId={platform}
          onChange={(nextPlatform) => { onFilterChange({ platform: nextPlatform }) }}
        />
      )}
      tools={(
        <>
          {statuses.length > 0 ? (
            <DropdownSelect
              value={status}
              options={statusOptions}
              aria-label={t('filter.status')}
              disabled={disabled}
              onChange={(nextStatus) => { onFilterChange({ status: nextStatus }) }}
            />
          ) : null}
          {groups.length > 0 ? (
            <DropdownSelect
              value={group}
              options={groupOptions}
              aria-label={t('group')}
              disabled={disabled}
              onChange={(nextGroup) => { onFilterChange({ group: nextGroup }) }}
            />
          ) : null}
        </>
      )}
      actions={(
        <div className="omnimux-accounts-filter-actions" role="group" aria-label={t('filter.sort')}>
          <DropdownSelect
            value={sortKey}
            options={sortOptions}
            aria-label={t('filter.sort')}
            disabled={disabled}
            onChange={(nextKey) => {
              const recommendedDir = DEFAULT_SORT_DIRECTIONS[nextKey] || 'asc'
              onSortChange({ key: nextKey, dir: recommendedDir })
            }}
          />
          <IconButton
            variant="outline"
            size="sm"
            aria-label={t('filter.direction')}
            aria-pressed={sortDir === 'desc'}
            disabled={disabled}
            onClick={() => { onSortChange({ dir: sortDir === 'asc' ? 'desc' : 'asc' }) }}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {sortDir === 'asc' ? <path d="M8 12.5V3.5M4 6.5l4-4 4 4" /> : <path d="M8 3.5v9M4 9.5l4 4 4-4" />}
            </svg>
          </IconButton>
          <IconButton
            variant="outline"
            size="sm"
            aria-label={t('filter.viewGrid')}
            title={t('filter.viewGrid')}
            aria-pressed={view === 'grid'}
            disabled={disabled}
            onClick={() => { onViewChange('grid') }}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
              <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
              <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
              <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
            </svg>
          </IconButton>
          <IconButton
            variant="outline"
            size="sm"
            aria-label={t('filter.viewTable')}
            title={t('filter.viewTable')}
            aria-pressed={view === 'table'}
            disabled={disabled}
            onClick={() => { onViewChange('table') }}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
            </svg>
          </IconButton>
        </div>
      )}
    />
  )
}
