import { useEffect, useState } from 'react'
import { Divider, PageHeader } from 'dsh-ui-kit'
import { injectPublishStyles } from './styles.js'
import { usePublishFeed } from './usePublishFeed.js'
import { AccountsSidebar } from './AccountsSidebar.jsx'
import { PublishActionRow } from './views/PublishActionRow.jsx'
import { PublishControlBar } from './views/PublishControlBar.jsx'
import { PublishViewport } from './views/PublishViewport.jsx'
import { PublishOverlays, PublishDeleteConfirmModal } from './views/PublishOverlays.jsx'

const TAB_ID = 'omnimux-publish:library'

/** Stage 顶层视图：发布（默认） / 账号侧栏。 */
const STAGE_VIEWS = ['publish', 'accounts']

/**
 * 顶层分段切换（单行工具栏，pill 选中态）。
 * @param {{
 *   t: (key: string) => string,
 *   stageView: string,
 *   onChange: (view: string) => void,
 * }} props
 */
function StageViewSwitch({ t, stageView, onChange }) {
  return (
    <div className="omnimux-publish-stage-switch" role="tablist">
      {STAGE_VIEWS.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={stageView === name}
          className={`omnimux-publish-stage-switch-btn${stageView === name ? ' active' : ''}`}
          onClick={() => { onChange(name) }}
        >
          {t(`stage.view.${name}`)}
        </button>
      ))}
    </div>
  )
}

function createBatchActions(feed) {
  return {
    onToggleAll: feed.handleToggleAll,
    onBatchRetry: feed.handleBatchRetry,
    onBatchDeleteDrafts: feed.handleBatchDeleteDrafts,
    onExitBatch: () => feed.setIsBatchMode(false),
  }
}

function createItemActions(feed, setView) {
  return {
    onToggleSelect: feed.handleToggleSelect,
    onView: (record) => setView({ name: 'detail', recordId: String(record.id) }),
    onEdit: (record) => setView({ name: 'composer', draftId: String(record.id) }),
    onDelete: feed.setPendingDelete,
    onRetry: feed.handleSingleRetry,
  }
}

export function PublishStageContent(props) {
  const { t, feed, viewMode, setViewMode, setView } = props
  return (
    <>
      <PublishActionRow
        t={t}
        onNew={() => setView({ name: 'composer' })}
        onToggleBatch={() => feed.setIsBatchMode((prev) => !prev)}
        onExport={feed.handleExport}
      />
      <Divider />
      <PublishControlBar
        t={t}
        tab={feed.tab}
        counts={feed.counts}
        onTabChange={feed.setTab}
        searchQuery={feed.searchQuery}
        onSearchChange={feed.setSearchQuery}
        sortOption={feed.sortOption}
        onSortChange={feed.setSortOption}
        typeFilter={feed.typeFilter}
        onTypeChange={feed.setTypeFilter}
        channelFilter={feed.channelFilter}
        onChannelChange={feed.setChannelFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
    </>
  )
}

export function PublishStageModals(props) {
  const { t, feed, view, setView } = props
  return (
    <>
      <PublishOverlays
        t={t}
        view={view}
        onBack={() => setView({ name: 'list' })}
        onSubmitted={(recordId) => {
          setView({ name: 'detail', recordId })
          feed.startTracking()
        }}
        onSaved={feed.loadList}
        onChanged={() => {
          void feed.loadList()
          feed.startTracking()
        }}
        detailTick={feed.detailTick}
      />
      <PublishDeleteConfirmModal
        t={t}
        pendingDelete={feed.pendingDelete}
        busyDelete={feed.busyDelete}
        onClose={() => feed.setPendingDelete(null)}
        onConfirm={feed.confirmDelete}
      />
    </>
  )
}

/**
 * Publish workbench tab component in dsh-better-sidebar.
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 * }} props
 */
export function PublishStage(props) {
  const { t, stage, store, visible = true } = props
  useEffect(() => { injectPublishStyles() }, [])
  const everOpened = true

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const [viewMode, setViewMode] = useState('grid')
  const [view, setView] = useState({ name: 'list' })
  const [stageView, setStageView] = useState('publish')
  const [accountsRefreshKey, setAccountsRefreshKey] = useState(0)
  const feed = usePublishFeed({ open: visible, view, t })
  const batchActions = createBatchActions(feed)
  const itemActions = createItemActions(feed, setView)

  const handleClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  return (
    <div
      role="region"
      aria-label={t('title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-publish-stage"
      data-visible={visible ? 'true' : 'false'}
      style={{
        display: visible ? 'flex' : 'none',
        position: 'relative',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onRefresh={stageView === 'accounts' ? () => setAccountsRefreshKey((key) => key + 1) : feed.loadList}
        refreshing={stageView === 'accounts' ? false : feed.listLoading}
        refreshTitle={t('records.refresh')}
        onClose={handleClose}
        closeTitle={t('close')}
      />
      <StageViewSwitch t={t} stageView={stageView} onChange={setStageView} />
      {stageView === 'accounts' ? (
        <AccountsSidebar key={accountsRefreshKey} t={t} />
      ) : (
        <>
          <PublishStageContent t={t} feed={feed} viewMode={viewMode} setViewMode={setViewMode} setView={setView} />
          <PublishViewport
            t={t}
            viewMode={viewMode}
            filteredRecords={feed.filteredRecords}
            selectedIds={feed.selectedIds}
            isBatchMode={feed.isBatchMode}
            toastMsg={feed.toastMsg}
            batchActions={batchActions}
            itemActions={itemActions}
          />
        </>
      )}
      <PublishStageModals t={t} feed={feed} view={view} setView={setView} />
    </div>
  )
}
