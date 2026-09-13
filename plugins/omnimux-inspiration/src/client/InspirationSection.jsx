import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Divider, DropdownSelect, EmptyState, FilterBar, SearchField, Tabs } from 'dsh-ui-kit'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog.jsx'
import { RivalAccountFilter } from './RivalAccountFilter.jsx'
import { RivalAccountsPanel, buildRivalPlatformOptions } from './RivalAccountsPanel.jsx'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'
import { InspirationInlineImportDialog } from './InspirationInlineImportDialog.jsx'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { buildPlatformFilterOptions, formatPlatformName } from './feed-helpers.js'
import { PlusIcon } from './icons.jsx'
import { revealLandedCard, withLandedItem } from './import-landing.js'
import { injectInspirationStyles } from './styles.js'
import { useInspirationFeed } from './use-inspiration-feed.js'
import { useRivalFeed } from './use-rival-feed.js'

export { formatPlatformName }

/**
 * 账号导入成功的提示文案：账号带 handle 就点名，没带就退回一句通用话术 ——
 * 成功提示无论如何都要出现，不能因为缺一个字段而变成一句半截话。
 * @param {(key: string) => string} t
 * @param {Record<string, any> | undefined} account
 * @returns {string}
 */
function accountImportNotice(t, account) {
  const handle = String(account?.handle || account?.nickname || '').trim()
  return handle
    ? t('rivalAccounts.import.success').replace('{handle}', handle)
    : t('rivalAccounts.import.successPlain')
}

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

function InspirationEmptyState({ t, onOpenAdd }) {
  return (
    <EmptyState
      title={t('empty.title')}
      description={t('empty.description')}
      action={
        onOpenAdd ? (
          <Button variant="primary" onClick={onOpenAdd}>
            {t('add.btn')}
          </Button>
        ) : null
      }
    />
  )
}

export function InspirationSection({ t, active }) {
  const feed = useInspirationFeed({ active })
  const {
    tab, setTab,
    q, setQ,
    platform, setPlatform,
    availablePlatforms = [],
    type, setType,
    sort, setSort,
    favorite, setFavorite,
    country, setCountry,
    category, setCategory,
    duration, setDuration,
    views, setViews,
    trafficType, setTrafficType,
    dateRange, setDateRange,
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
    // 导入账号的默认落点：切到账号监控 tab。外壳在它之上再叠加重读与提示。
    handleAccountImported: landOnAccountTab,
    landedItem,
    handleItemUpdated,
    importFailed,
    clearImportFailed,
  } = feed

  /**
   * Account-dimension filters of the 账号监控 tab, owned by the shell.
   *
   * The feed filters works rather than library rows, so its controls cannot be
   * the library feed's. They are still rendered in the one filter row every tab
   * shares: switching tabs swaps what the row is wired to, never the row itself,
   * which is what keeps the four tabs on the same visual level.
   */
  const [rivalQuery, setRivalQuery] = useState('')
  const [rivalPlatform, setRivalPlatform] = useState('')
  const rivalTab = tab === 'rivals'

  /**
   * The 账号监控 feed, mounted here rather than inside the panel.
   *
   * The account filter lives in the toolbar and the grid lives in the content
   * area, and both have to read the same selection and the same totals — one
   * state source, two consumers. It loads only while its tab is on screen.
   */
  const rivalFeed = useRivalFeed({
    enabled: rivalTab && active !== false,
    query: rivalQuery,
    platform: rivalPlatform,
  })
  const { reload: reloadRivalFeed } = rivalFeed

  /**
   * 账号导入成功后的统一收口（顶部「导入灵感」弹窗与账号监控页内的弹窗共用）。
   *
   * 只切 tab 是不够的：用户本来就在账号监控页时 tab 不变、`useRivalFeed` 的
   * enabled 也跟着不变，重新请求不会被触发 —— 新账号既不进账号筛选器，也不进
   * 作品流，界面上看起来就是「点了导入没反应」。所以这里显式重读一次第 1 页，
   * 并把成功提示交给账号监控页顶部的通知条，让这次导入在界面上留下痕迹。
   */
  const [accountNotice, setAccountNotice] = useState(null)
  const handleAccountImported = useCallback((account) => {
    landOnAccountTab(account)
    void reloadRivalFeed()
    setAccountNotice(accountImportNotice(t, account))
  }, [landOnAccountTab, reloadRivalFeed, t])

  // Platform filter gate: null (no dropdown) while a single platform is known.
  const platformOptions = buildPlatformFilterOptions(availablePlatforms, t)
  const rivalPlatformOptions = buildRivalPlatformOptions(t)

  // The row the last import produced is pinned above the list while it is
  // missing from it: the tab switch that follows an import refetches page 1, and
  // a row created a second ago can be sorted off that page even with no filter.
  const visibleItems = useMemo(
    () => withLandedItem(items, landedItem, tab),
    [items, landedItem, tab],
  )
  const landedId = landedItem?.id

  // Bring the landed card into view and flash it. The effect owns the highlight;
  // the pin above is what guarantees there is a card to find.
  useEffect(() => {
    if (landedId == null) return undefined
    return revealLandedCard(landedId)
  }, [landedId])

  useEffect(() => {
    injectInspirationStyles()
  }, [])

  return (
    <div className="omnimux-inspiration-root">
      <div className="omnimux-inspiration-action-row">
        <Button
          variant="primary"
          leadingIcon={<PlusIcon />}
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
              { id: 'rivals', label: t('tab.rivals') },
            ]}
            activeId={tab}
            onChange={setTab}
          />
        }
        search={rivalTab ? (
          <SearchField
            value={rivalQuery}
            placeholder={t('rivalAccounts.import.searchPlaceholder')}
            aria-label={t('rivalAccounts.import.searchPlaceholder')}
            debounceMs={200}
            stretch
            onValueChange={setRivalQuery}
          />
        ) : (
          <SearchField
            value={q}
            placeholder={t('filter.search')}
            aria-label={t('filter.search')}
            debounceMs={0}
            stretch
            onValueChange={setQ}
          />
        )}
        tools={rivalTab ? (
          <>
            <RivalAccountFilter
              t={t}
              accounts={rivalFeed.accounts}
              selection={rivalFeed.selection}
              onToggle={rivalFeed.toggleAccount}
              onInvert={rivalFeed.invertAccounts}
              onReset={rivalFeed.resetAccounts}
            />
            <DropdownSelect
              value={rivalPlatform}
              aria-label={t('filter.platform')}
              onChange={setRivalPlatform}
              className="omnimux-inspiration-filter-select"
              options={rivalPlatformOptions}
            />
          </>
        ) : (
          <>
            {platformOptions ? (
              <DropdownSelect
                value={platform}
                aria-label={t('filter.platform')}
                onChange={setPlatform}
                className="omnimux-inspiration-filter-select"
                options={platformOptions}
              />
            ) : null}
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
                { value: 'views', label: t('sort.views') },
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

      {/* Content area — the one region a tab switch replaces. */}
      {rivalTab ? (
        <RivalAccountsPanel
          t={t}
          active={active !== false}
          query={rivalQuery}
          platform={rivalPlatform}
          feed={{ ...rivalFeed, query: rivalQuery, platform: rivalPlatform }}
          onImported={() => reloadRivalFeed()}
          onAccountImported={handleAccountImported}
          importNotice={accountNotice}
          onDismissNotice={() => setAccountNotice(null)}
        />
      ) : (
        <>
          <div className="omnimux-inspiration-subfilter-row">
            <DropdownSelect
              value={country}
              aria-label={t('filter.country')}
              onChange={setCountry}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('country.all') },
                { value: 'US', label: t('country.us') },
                { value: 'GB', label: t('country.gb') },
                { value: 'ID', label: t('country.id') },
                { value: 'TH', label: t('country.th') },
                { value: 'MY', label: t('country.my') },
                { value: 'VN', label: t('country.vn') },
                { value: 'PH', label: t('country.ph') },
              ]}
            />
            <DropdownSelect
              value={category}
              aria-label={t('filter.category')}
              onChange={setCategory}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('category.all') },
                { value: '美妆护肤', label: '美妆护肤' },
                { value: '厨房用品', label: '厨房用品' },
                { value: '家居生活', label: '家居生活' },
                { value: '健康保健', label: '健康保健' },
                { value: '服装服饰', label: '服装服饰' },
                { value: '母婴玩具', label: '母婴玩具' },
                { value: '数码科技', label: '数码科技' },
                { value: '食品饮料', label: '食品饮料' },
                { value: '汽车与户外', label: '汽车与户外' },
              ]}
            />
            <DropdownSelect
              value={duration}
              aria-label={t('filter.duration')}
              onChange={setDuration}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('duration.all') },
                { value: '0-15', label: t('duration.under15') },
                { value: '15-30', label: t('duration.15to30') },
                { value: '30-60', label: t('duration.30to60') },
                { value: '60+', label: t('duration.over60') },
              ]}
            />
            <DropdownSelect
              value={views}
              aria-label={t('filter.views')}
              onChange={setViews}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('views.all') },
                { value: '10k+', label: t('views.10k') },
                { value: '100k+', label: t('views.100k') },
                { value: '500k+', label: t('views.500k') },
                { value: '1m+', label: t('views.1m') },
                { value: '5m+', label: t('views.5m') },
                { value: '10m+', label: t('views.10m') },
              ]}
            />
            <DropdownSelect
              value={trafficType}
              aria-label={t('filter.trafficType')}
              onChange={setTrafficType}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('traffic.all') },
                { value: 'ad', label: t('traffic.ad') },
                { value: 'organic', label: t('traffic.organic') },
              ]}
            />
            <DropdownSelect
              value={dateRange}
              aria-label={t('filter.dateRange')}
              onChange={setDateRange}
              className="omnimux-inspiration-subfilter-select"
              options={[
                { value: '', label: t('date.all') },
                { value: 'last7', label: t('date.last7') },
                { value: 'last30', label: t('date.last30') },
                { value: 'last90', label: t('date.last90') },
              ]}
            />
          </div>

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
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="omnimux-inspiration-skel" />
              ))}
            </div>
          ) : null}

          {phase === 'need-login' && tab === 'public' ? <LoginGate t={t} /> : null}

          {phase === 'ready' && error && visibleItems.length === 0 ? (
            <div className="omnimux-inspiration-error">
              <p className="omnimux-inspiration-empty-text">
                {error === 'disabled' ? t('error.disabled') : error || t('error.generic')}
              </p>
            </div>
          ) : null}

          {!loading && visibleItems.length === 0 && (!error || tab === 'local') ? (
            <InspirationEmptyState t={t} onOpenAdd={() => setImportOpen(true)} />
          ) : null}

          {visibleItems.length > 0 ? (
            <div className={`omnimux-inspiration-grid ${selecting ? 'selecting' : ''}`}>
              {visibleItems.map((row) => (
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
              {loadingMore ? Array.from({ length: 10 }).map((_, i) => (
                <div key={`skel_more_${i}`} className="omnimux-inspiration-skel" aria-hidden="true" />
              )) : null}
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

          {/* 后台导入结算通知：降级、失败或 AI 拆解失败时告知结果，点击即清除。
              每段文案各自包一层 <p>：样式表只给 `.omnimux-inspiration-import-notice p`
              设了外边距，裸文本会继承浏览器的默认 margin 而与相邻提示错位。 */}
          {importFailed ? (
            <div
              className="omnimux-inspiration-import-notice"
              role="status"
              onClick={() => clearImportFailed?.(null)}
            >
              <p>
                {t(importFailed.key)}
                {importFailed.detail ? `：${importFailed.detail}` : ''}
              </p>
              {importFailed.retryable ? <p>{t('add.retryHint')}</p> : null}
            </div>
          ) : null}

          <div ref={sentinelRef} />

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
        </>
      )}

      <InspirationInlineImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={handleImportSuccess}
        onAccountImported={handleAccountImported}
      />
    </div>
  )
}
