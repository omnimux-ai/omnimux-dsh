import { FilterBar as KitFilterBar, SearchField, DropdownSelect } from 'dsh-ui-kit'
import { PLATFORMS, PROFILE_OPTIONS, RANGE_OPTIONS, SOURCE_OPTIONS } from '../constants.js'

/**
 * Layer 3: 48px single-row cascade — platform, account, source, range + 220px search.
 * Account options come from Host `meta.filterAccounts` when live.
 */
export function FilterBar({ t, query, onChange, disabled, accounts }) {
  const platformOptions = [
    { value: 'all', label: t('filter.all') },
    ...PLATFORMS.map((id) => ({ value: id, label: t(`platform.${id}`) })),
  ]
  const hasLive = Array.isArray(accounts)
  const liveAccounts = hasLive ? accounts : []
  const profileOptions = [
    { value: 'all', label: t('filter.all') },
    ...(hasLive
      ? liveAccounts.map((row) => ({
          value: row.id,
          label: row.expired ? `${row.label} ⚠` : row.label, // exempt-ui04: 历史存量待迁移为矢量SVG
        }))
      : PROFILE_OPTIONS.filter((opt) => opt.value !== 'all').map((opt) => ({
          value: opt.value,
          label: t(opt.labelKey),
        }))),
  ]
  if (query.profileId && query.profileId !== 'all' && !profileOptions.some((opt) => opt.value === query.profileId)) {
    profileOptions.push({ value: query.profileId, label: query.profileId })
  }
  const sourceOptions = SOURCE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))
  const rangeOptions = RANGE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))

  return (
    <div className="omnimux-analytics-stage-filter">
      <KitFilterBar
        className="omnimux-analytics-filterbar"
        filters={(
          <>
            <DropdownSelect
              value={query.platform === 'all' ? undefined : query.platform}
              placeholder={t('filter.platform')}
              options={platformOptions}
              aria-label={t('filter.platform')}
              disabled={disabled}
              onChange={(platform) => onChange({ platform })}
            />
            <DropdownSelect
              value={query.profileId === 'all' ? undefined : query.profileId}
              placeholder={t('filter.account')}
              options={profileOptions}
              aria-label={t('filter.account')}
              disabled={disabled}
              onChange={(profileId) => onChange({ profileId })}
            />
            <DropdownSelect
              value={query.source === 'all' ? undefined : query.source}
              placeholder={t('filter.source')}
              options={sourceOptions}
              aria-label={t('filter.source')}
              disabled={disabled}
              onChange={(source) => onChange({ source })}
            />
            <DropdownSelect
              value={query.timeRange}
              placeholder={t('filter.timeRange')}
              options={rangeOptions}
              aria-label={t('filter.timeRange')}
              disabled={disabled}
              onChange={(timeRange) => onChange({ timeRange })}
            />
          </>
        )}
        search={(
          <div className="omnimux-analytics-search">
            <SearchField
              value={query.searchQuery}
              placeholder={t('filter.search')}
              aria-label={t('filter.search')}
              disabled={disabled}
              debounceMs={0}
              stretch
              onValueChange={(searchQuery) => onChange({ searchQuery })}
            />
          </div>
        )}
      />
    </div>
  )
}
