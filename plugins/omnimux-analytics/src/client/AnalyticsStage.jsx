import { useEffect, useState } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Divider, IconButton, PageHeader } from 'dsh-ui-kit'
import { injectAnalyticsStyles } from './styles.js'
import { useAnalyticsStore } from './store.js'
import { buildDashboardCsv, downloadCsv } from './csv.js'
import { ActionNavRow } from './components/ActionNavRow.jsx'
import { FilterBar } from './components/FilterBar.jsx'
import { KpiGrid } from './components/KpiGrid.jsx'
import { BasicCharts } from './components/BasicCharts.jsx'
import { EngagementChart } from './components/EngagementChart.jsx'
import { HeatmapChart } from './components/HeatmapChart.jsx'
import { FollowerEvolution } from './components/FollowerEvolution.jsx'
import { PlatformTable } from './components/PlatformTable.jsx'
import { TopPostsTable } from './components/TopPostsTable.jsx'
import { StrategyCharts } from './components/StrategyCharts.jsx'
import { Banner, EmptyState, InboxPlaceholder, LoadingState } from './components/EmptyState.jsx'

const TAB_ID = 'omnimux-analytics:library'

function readLocale() {
  if (typeof document === 'undefined') return 'zh-CN'
  const lang = document.documentElement.lang || ''
  return lang.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

function openAccounts() {
  try {
    const workbench = window.__omnimuxWorkbench
    if (workbench && typeof workbench.open === 'function') {
      workbench.open({ tabId: 'omnimux-accounts:library' })
      return
    }
  } catch {}
}

/**
 * Social analytics workbench tab component in dsh-better-sidebar.
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 * }} props
 */
export function AnalyticsStage({ t, stage, store, visible = true }) {
  useEffect(() => { injectAnalyticsStyles() }, [])
  const everOpened = true

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const [now, setNow] = useState(() => Date.now())
  const analyticsStore = useAnalyticsStore()
  // Primitive fetch keys only — never depend on analyticsStore.query object
  // identity. refresh()/loadDashboard() always clone query into a new object,
  // so an object dependency re-fires this effect forever (React #185 / max update depth).
  // tab + searchQuery are client-side only (see query.patchNeedsFetch / cacheKey).
  const queryPlatform = analyticsStore.query.platform
  const queryProfileId = analyticsStore.query.profileId
  const queryTimeRange = analyticsStore.query.timeRange

  useEffect(() => {
    if (!visible) return undefined
    const timer = setInterval(() => { setNow(Date.now()) }, 30000)
    return () => { clearInterval(timer) }
  }, [visible])

  useEffect(() => {
    if (!visible) return undefined
    void analyticsStore.refresh()
  }, [visible, queryPlatform, queryProfileId, queryTimeRange])

  const payload = analyticsStore.payload
  const empty = payload?.emptyState || null
  const blockingEmpty = empty && (empty.code === 'no_accounts' || empty.code === 'no_data')
  const locale = readLocale()

  const handleAction = (action) => {
    if (action === 'retry') {
      void analyticsStore.refresh()
    } else if (action === 'sync') {
      void analyticsStore.syncNow()
    } else if (action === 'bind') {
      openAccounts()
    }
  }

  const handleExport = () => {
    if (!payload) return
    const csv = buildDashboardCsv(payload, t, locale)
    const ymd = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `omnimux-analytics-${ymd}.csv`)
  }

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
      className="omnimux-analytics-stage"
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
        trailingAction={(
          <IconButton
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!payload || analyticsStore.phase === 'loading'}
            aria-label={t('export.csv')}
            title={t('export.csv')}
          >
            <IconDownloadOutline16 />
          </IconButton>
        )}
        onRefresh={() => { void analyticsStore.refresh() }}
        refreshing={analyticsStore.phase === 'loading'}
        refreshTitle={t('refresh')}
        onClose={handleClose}
        closeTitle={t('close')}
      />
      <ActionNavRow
        t={t}
        tab={analyticsStore.query.tab}
        syncStatus={payload?.syncStatus}
        syncing={analyticsStore.syncing}
        now={now}
        onTabChange={(tab) => analyticsStore.setQuery({ tab })}
        onSync={() => { void analyticsStore.syncNow() }}
      />
      <Divider />
      <FilterBar
        t={t}
        query={analyticsStore.query}
        accounts={payload?.meta?.filterAccounts}
        disabled={analyticsStore.syncing}
        onChange={(patch) => analyticsStore.setQuery(patch)}
      />
      <div className="omnimux-analytics-stage-body">
        {analyticsStore.phase === 'loading' && !payload ? (
          <LoadingState t={t} />
        ) : analyticsStore.query.tab === 'inbox' ? (
          <InboxPlaceholder t={t} />
        ) : blockingEmpty ? (
          <EmptyState t={t} hint={empty} onAction={handleAction} />
        ) : !payload ? (
          <EmptyState t={t} hint={{ code: 'fetch_failed', action: 'retry' }} onAction={handleAction} />
        ) : (
          <>
            {empty && empty.code !== 'no_accounts' ? <Banner t={t} hint={empty} onAction={handleAction} /> : null}
            {analyticsStore.lastError && empty?.code !== 'network_error' ? (
              <Banner t={t} hint={{ code: 'network_error', action: 'retry', detail: analyticsStore.lastError }} onAction={handleAction} />
            ) : null}
            <KpiGrid t={t} kpi={payload.kpi} timeRange={analyticsStore.query.timeRange} />
            <BasicCharts t={t} basicCharts={payload.basicCharts} timeRange={analyticsStore.query.timeRange} />
            <EngagementChart t={t} block={payload.engagementOverTime} locale={locale} />
            <section className="omnimux-analytics-grid-2">
              <HeatmapChart t={t} heatmap={payload.heatmap} locale={locale} />
              <FollowerEvolution t={t} block={payload.followerEvolution} />
            </section>
            <PlatformTable t={t} rows={payload.platformBreakdown} />
            <TopPostsTable t={t} rows={payload.topPosts} />
            <StrategyCharts t={t} strategy={payload.strategy} locale={locale} />
          </>
        )}
      </div>
    </div>
  )
}
