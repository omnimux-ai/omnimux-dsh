import {
  IconGridOutline16,
  IconListOutline16,
  IconCalendarOutline16,
} from '../icons/stage.js'
import { Button, IconButton, SearchField, DropdownSelect, FilterBar, Tabs } from 'dsh-ui-kit'

export function PublishTabButton({ item, active, onClick }) {
  const badgeClass = `omnimux-publish-tab-badge${item.isRetry ? ' retry' : ''}`
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
    >
      {item.label}
      {item.count > 0 ? <span className={badgeClass}>{item.count}</span> : null}
    </Button>
  )
}

export function PublishTabFilters({ t, tab, counts, onTabChange }) {
  const tabs = [
    { key: 'all', label: t('tab.all'), count: 0, isRetry: false },
    { key: 'drafts', label: t('tab.drafts'), count: counts.draft, isRetry: false },
    { key: 'reviewing', label: t('tab.reviewing'), count: counts.reviewing, isRetry: false },
    { key: 'published', label: t('tab.published'), count: 0, isRetry: false },
    { key: 'retry', label: t('tab.retry'), count: counts.failed, isRetry: true },
  ]

  const items = tabs.map((item) => ({
    id: item.key,
    label: item.label,
    badge: item.count > 0 ? (
      <span className={`omnimux-publish-tab-badge${item.isRetry ? ' retry' : ''}`}>
        {item.count}
      </span>
    ) : undefined,
  }))

  return (
    <Tabs
      variant="underline"
      items={items}
      activeId={tab}
      onChange={onTabChange}
    />
  )
}

export function PublishViewSwitcher({ t, viewMode, onViewModeChange }) {
  return (
    <div key="view-switcher" className="omnimux-publish-view-switcher">
      <IconButton
        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
        size="xs"
        title={t('view.grid')}
        onClick={() => onViewModeChange('grid')}
      >
        <IconGridOutline16 />
      </IconButton>
      <IconButton
        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
        size="xs"
        title={t('view.table')}
        onClick={() => onViewModeChange('table')}
      >
        <IconListOutline16 />
      </IconButton>
      <IconButton
        variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
        size="xs"
        title={t('view.calendar')}
        onClick={() => onViewModeChange('calendar')}
      >
        <IconCalendarOutline16 />
      </IconButton>
    </div>
  )
}

function buildDropdownOptions(t) {
  const sortOptions = [
    { value: 'recent', label: t('sort.recent') },
    { value: 'dateDesc', label: t('sort.dateDesc') },
    { value: 'dateAsc', label: t('sort.dateAsc') },
    { value: 'title', label: t('sort.title') },
  ]
  const typeOptions = [
    { value: '', label: t('filter.type.all') },
    { value: 'image', label: t('filter.type.image') },
    { value: 'video', label: t('filter.type.video') },
  ]
  const modeOptions = [
    { value: '', label: t('filter.mode.all') },
    { value: 'scheduled', label: t('filter.mode.scheduled') },
    { value: 'instant', label: t('filter.mode.instant') },
  ]
  return { sortOptions, typeOptions, modeOptions }
}

export function PublishControlTools(props) {
  const { t, searchQuery, onSearchChange, sortOption, onSortChange, typeFilter, onTypeChange, modeFilter, onModeChange, viewMode, onViewModeChange } = props
  const { sortOptions, typeOptions, modeOptions } = buildDropdownOptions(t)

  return [
    <SearchField
      key="search"
      width={220}
      placeholder={t('search.placeholder')}
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
    />,
    <DropdownSelect
      key="sort"
      value={sortOption}
      onChange={onSortChange}
      options={sortOptions}
    />,
    <DropdownSelect
      key="type"
      value={typeFilter}
      onChange={onTypeChange}
      options={typeOptions}
    />,
    <DropdownSelect
      key="mode"
      value={modeFilter}
      onChange={onModeChange}
      options={modeOptions}
    />,
    <PublishViewSwitcher
      key="view-switcher"
      t={t}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
    />,
  ]
}

export function PublishControlBar(props) {
  const { t, tab, counts, onTabChange, ...toolProps } = props
  return (
    <section className="omnimux-publish-control-bar">
      <FilterBar
        compact
        filters={<PublishTabFilters t={t} tab={tab} counts={counts} onTabChange={onTabChange} />}
        tools={<PublishControlTools t={t} {...toolProps} />}
      />
    </section>
  )
}
