import { useEffect } from 'react'
import { Button, Divider, DropdownSelect, FilterBar, SearchField, Tabs } from 'dsh-ui-kit'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog.jsx'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'
import { InspirationInlineImportDialog } from './InspirationInlineImportDialog.jsx'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { injectInspirationStyles } from './styles.js'
import { useInspirationFeed } from './use-inspiration-feed.js'

function LoginGate({ t }) {
  const login = () => {
    const gate = typeof window !== 'undefined' ? window.__omnimuxAuth : undefined
    if (gate && typeof gate.ensureLogin === 'function') gate.ensureLogin({ kind: 'explicit' })
  }
  return (
    <div className="omnimux-inspiration-gate">
      <h2 className="omnimux-inspiration-empty-title">{t('needLogin')}</h2>
      <p className="omnimux-inspiration-empty-text">{t('needLoginHint')}</p>
      <Button variant="primary" onClick={login}>{t('login')}</Button>
    </div>
  )
}

function EmptyState({ t, onOpenAdd }) {
  return (
    <div className="omnimux-inspiration-empty">
      <h2 className="omnimux-inspiration-empty-title">{t('empty.title')}</h2>
      <p className="omnimux-inspiration-empty-text">{t('empty.description')}</p>
      {onOpenAdd ? (
        <Button variant="primary" className="omnimux-inspiration-empty-cta" onClick={onOpenAdd}>
          {t('add.btn')}
        </Button>
      ) : null}
    </div>
  )
}

export function InspirationSection({ t, active }) {
  const feed = useInspirationFeed({ active })
  const {
    tab, setTab,
    q, setQ,
    type, setType,
    sort, setSort,
    favorite, setFavorite,
    items,
    loading,
    loadingMore,
    phase,
    error,
    selectedItem, setSelectedItem,
    importOpen, setImportOpen,
    selectedIds,
    pendingRemove, setPendingRemove,
    removing,
    replicateBusy,
    ctaStatus,
    sentinelRef,
    selectedCount,
    selecting,
    handleReplicate,
    toggleSelect,
    selectAllLocal,
    clearSelection,
    handleConfirmBatchRemove,
    handleImportSuccess,
    handleItemUpdated,
  } = feed

  useEffect(() => {
    injectInspirationStyles()
  }, [])

  return (
    <div className="omnimux-inspiration-root">
      <div className="omnimux-inspiration-action-row">
        <Button
          variant="primary"
          className="omnimux-inspiration-btn-add"
          leadingIcon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          onClick={() => setImportOpen(true)}
        >
          {t('add.btn')}
        </Button>
      </div>

      <Divider />

      <FilterBar
        className="omnimux-inspiration-toolbar"
        filters={
          <Tabs
            variant="underline"
            items={[
              { id: 'all', label: t('tab.all') },
              { id: 'local', label: t('tab.local') },
              { id: 'public', label: t('tab.public') },
            ]}
            activeId={tab}
            onChange={setTab}
          />
        }
        search={(
          <SearchField
            value={q}
            placeholder={t('filter.search')}
            aria-label={t('filter.search')}
            debounceMs={0}
            stretch
            onValueChange={setQ}
          />
        )}
        tools={(
          <>
            <DropdownSelect
              value={type}
              aria-label={t('filter.type')}
              onChange={setType}
              className="omnimux-inspiration-filter-select"
              options={[
                { value: '', label: t('filter.type') },
                { value: 'video', label: t('type.video') },
                { value: 'image', label: t('type.image') },
                { value: 'link', label: t('type.link') },
              ]}
            />
            <DropdownSelect
              value={sort}
              aria-label={t('filter.sort')}
              onChange={setSort}
              className="omnimux-inspiration-filter-select"
              options={[
                { value: 'hot', label: t('sort.hot') },
                { value: 'new', label: t('sort.new') },
                { value: 'fav', label: t('sort.fav') },
              ]}
            />
            <DropdownSelect
              value={favorite}
              aria-label={t('filter.favorite')}
              onChange={setFavorite}
              className="omnimux-inspiration-filter-select"
              options={[
                { value: '0', label: t('favorite.off') },
                { value: '1', label: t('favorite.on') },
              ]}
            />
          </>
        )}
      />

      {selecting ? (
        <div className="omnimux-inspiration-selection-bar">
          <div className="omnimux-inspiration-selection-count">
            <span>{t('select.count').replace('{n}', String(selectedCount))}</span>
          </div>
          <div className="omnimux-inspiration-selection-actions">
            <Button variant="ghost" size="sm" onClick={selectAllLocal}>
              {t('select.selectAll')}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t('select.clear')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={removing}
              onClick={() => setPendingRemove({ ids: [...selectedIds], count: selectedCount })}
            >
              {t('select.delete').replace('{n}', String(selectedCount))}
            </Button>
          </div>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="omnimux-inspiration-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="omnimux-inspiration-skel" />
          ))}
        </div>
      ) : null}

      {phase === 'need-login' && tab === 'public' ? <LoginGate t={t} /> : null}

      {phase === 'ready' && error && items.length === 0 ? (
        <div className="omnimux-inspiration-error">
          <p className="omnimux-inspiration-empty-text">
            {error === 'disabled' ? t('error.disabled') : error || t('error.generic')}
          </p>
        </div>
      ) : null}

      {!loading && items.length === 0 && (!error || tab === 'local') ? (
        <EmptyState t={t} onOpenAdd={() => setImportOpen(true)} />
      ) : null}

      {items.length > 0 ? (
        <div className={`omnimux-inspiration-grid ${selecting ? 'selecting' : ''}`}>
          {items.map((row) => (
            <InspirationCoverCard
              key={String(row.id)}
              card={{
                row,
                t,
                selected: selectedIds.has(row.id),
                selecting,
                replicateBusy,
                onToggleSelect: toggleSelect,
                onSelect: (item) => setSelectedItem(item),
                onReplicate: handleReplicate,
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        className="omnimux-inspiration-cta-status"
        id="omnimux-inspiration-cta-status"
        aria-live="polite"
        role="status"
      >
        {ctaStatus ? t(ctaStatus) : ''}
      </div>

      <div ref={sentinelRef} />
      {loadingMore ? (
        <div className="omnimux-inspiration-scroll-loader">
          <div className="omnimux-inspiration-spinner" />
          <span>正在加载更多灵感…</span>
        </div>
      ) : null}

      {selectedItem ? (
        <InspirationPreviewModal
          row={selectedItem}
          t={t}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={handleItemUpdated}
          onReplicate={handleReplicate}
          replicateBusy={replicateBusy}
        />
      ) : null}

      {pendingRemove ? (
        <ConfirmRemoveDialog
          t={t}
          count={pendingRemove.count}
          busy={removing}
          onCancel={() => setPendingRemove(null)}
          onConfirm={handleConfirmBatchRemove}
        />
      ) : null}

      <InspirationInlineImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={handleImportSuccess}
      />
    </div>
  )
}
