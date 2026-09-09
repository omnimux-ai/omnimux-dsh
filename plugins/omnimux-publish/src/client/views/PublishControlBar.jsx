import {
  IconGridOutline16,
  IconListOutline16,
  IconCalendarOutline16,
} from '../icons/stage.js'
import { Badge, Button, IconButton, SearchField, DropdownSelect, Tabs } from 'dsh-ui-kit'

export function PublishTabButton({ item, active, onClick }) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
    >
      {item.label}
      {item.count > 0 ? (
        <Badge variant={item.isRetry ? 'error' : 'neutral'} size="sm">
          {item.count}
        </Badge>
      ) : null}
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
      <Badge variant={item.isRetry ? 'error' : 'neutral'} size="sm">
        {item.count}
      </Badge>
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
        aria-pressed={viewMode === 'grid'}
        aria-label={t('view.grid')}
        title={t('view.grid')}
        onClick={() => onViewModeChange('grid')}
      >
        <IconGridOutline16 />
      </IconButton>
      <IconButton
        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
        aria-pressed={viewMode === 'table'}
        aria-label={t('view.table')}
        title={t('view.table')}
        onClick={() => onViewModeChange('table')}
      >
        <IconListOutline16 />
      </IconButton>
      <IconButton
        variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
        aria-pressed={viewMode === 'calendar'}
        aria-label={t('view.calendar')}
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
      className="omnimux-publish-search"
      placeholder={t('search.placeholder')}
      aria-label={t('search.placeholder')}
      clearLabel={t('search.clear')}
      value={searchQuery}
      onValueChange={onSearchChange}
    />,
    <DropdownSelect
      key="sort"
      value={sortOption}
      aria-label={t('filter.sort')}
      onChange={onSortChange}
      options={sortOptions}
    />,
    <DropdownSelect
      key="type"
      value={typeFilter || undefined}
      placeholder={t('filter.type')}
      aria-label={t('filter.type')}
      onChange={onTypeChange}
      options={typeOptions}
    />,
    <DropdownSelect
      key="mode"
      value={modeFilter || undefined}
      placeholder={t('filter.mode')}
      aria-label={t('filter.mode')}
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
      <div className="omnimux-publish-tabs">
        <PublishTabFilters t={t} tab={tab} counts={counts} onTabChange={onTabChange} />
      </div>
      <div className="omnimux-publish-control-tools" role="toolbar" aria-label={t('title')}>
        <PublishControlTools t={t} {...toolProps} />
      </div>
    </section>
  )
}
