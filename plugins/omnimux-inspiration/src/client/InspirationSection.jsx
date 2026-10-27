import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ConfirmModal, Divider, DropdownSelect, EmptyState, FilterBar, SearchField, Tabs } from 'dsh-ui-kit'
import { CollectionHeader } from './CollectionHeader.jsx'
import { InspirationCollectionCard, toCollectionCardRow } from './InspirationCollectionCard.jsx'
import { InspirationCollectionDialog } from './InspirationCollectionDialog.jsx'
import { InspirationCollectionMenu } from './InspirationCollectionMenu.jsx'
import { InspirationCardMenu } from './InspirationCardMenu.jsx'
import { buildCardMenuItems } from './card-actions.js'
import { addCardToSession } from './card-to-chat.js'
import { addCollectionToSession } from './collection-to-chat.js'
import { injectCollectionStyles } from './collection-styles.js'
import { useCollectionDrag, useInspirationCollections } from './use-inspiration-collections.js'
import { RivalAccountColumn } from './RivalAccountColumn.jsx'
import { RivalAccountsPanel, buildRivalPlatformOptions } from './RivalAccountsPanel.jsx'
import { RivalRefreshButton } from './RivalPoolStatusBar.jsx'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'
import { RivalMasonry } from './RivalMasonry.jsx'
import { toCollectionMemberCard, toInspirationCardRow } from './inspiration-card.js'
import { InspirationInlineImportDialog } from './InspirationInlineImportDialog.jsx'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { buildCategoryFilterOptions, buildPlatformFilterOptions, formatPlatformName } from './feed-helpers.js'
import { CheckIcon, PlusIcon } from './icons.jsx'
import { revealLandedCard, withLandedItem } from './import-landing.js'
import { injectInspirationStyles } from './styles.js'
import { useInspirationFeed } from './use-inspiration-feed.js'
import { useRivalFeed } from './use-rival-feed.js'
import { fetchRivalAccounts, removeRivalAccount, requestRivalPluginRefresh } from './rival-api.js'
import { openExternalUrl } from './open-url.js'
import {
  accountHealth,
  poolQuota,
} from './rival-health.js'

export { formatPlatformName }

/** 气泡停留时长：够看清一句话，又不至于让人等它消失。 */
const TOAST_VISIBLE_MS = 2500

/** 退场动画时长，必须与样式表里 `.omnimux-inspiration-toast` 的 transition 一致。 */
const TOAST_FADE_MS = 180

/**
 * 浏览器采集回写的等待窗口与轮询间隔。
 *
 * 采集发生在用户自己的浏览器里，host 不推送结果，所以点完必须自己问一次
 * 「回来了没有」。窗口比一次性 token 的 2 分钟略宽（用户可能还没登录、要扫码），
 * 但不会无限等：超时后不再重读，用户手动刷新页面也能看到。
 */
const BROWSER_UPDATE_WAIT_MS = 150_000
const BROWSER_UPDATE_POLL_MS = 3_000

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
    if (gate && typeof gate.ensureLogin === 'function') gate.ensureLogin({ kind: 'explicit', action: 'inspiration' })
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
  const [collectionId, setCollectionId] = useState('')
  const feed = useInspirationFeed({ active, collectionId })
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
    // The timeline is a publish-time feed (#3432): its order is fixed, and the
    // toolbar no longer offers a sort control.
    sort: 'latest',
  })
  const { reload: reloadRivalFeed } = rivalFeed

  /**
   * R4 刷新置灰的共享事实（#3111）。
   *
   * 额度来自 `rival-health.js` 的纯函数；「存在已停止账号」只看**当前
   * 筛选集**——所以这里必须同时见到 `selection` 与 `accounts`，判据
   * 放在外壳而不是组件里。
   */
  const rivalQuota = useMemo(
    () => poolQuota(rivalFeed.status, rivalFeed.configSummary),
    [rivalFeed.status, rivalFeed.configSummary],
  )
  const rivalStoppedInSelection = useMemo(() => {
    return rivalFeed.scopedAccounts.some((account) => accountHealth(account) === 'stopped')
  }, [rivalFeed.scopedAccounts])
  const rivalCooldownLeft = rivalFeed.manualCooldownLeft
  const rivalRefreshGate = {
    quotaLeft: rivalQuota?.left,
    stoppedInSelection: rivalStoppedInSelection,
    cooldownLeft: rivalCooldownLeft,
  }

  /**
   * 导入结果的统一出口：顶部气泡。
   *
   * 成功回执以前是内容区里的一条通知条，它把账号列表和作品网格整体下推一行 ——
   * 一句「刚刚成功了」的回执不该改变内容区的高度。气泡浮在内容之上，位置固定，
   * 停留 2.5 秒后淡出；同一时刻只留最新的一条，连续导入不会被旧回执盖住。
   */
  const [toast, setToast] = useState(null)
  const [toastLeaving, setToastLeaving] = useState(false)
  const toastSeq = useRef(0)

  const showToast = useCallback((text, options = {}) => {
    const message = String(text ?? '').trim()
    if (!message) return
    toastSeq.current += 1
    setToastLeaving(false)
    setToast({ id: toastSeq.current, text: message, ...options })
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToastLeaving(true), toast.duration || TOAST_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!toastLeaving) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_FADE_MS)
    return () => clearTimeout(timer)
  }, [toastLeaving])

  /**
   * Timer of the pending browser-capture wait.
   *
   * Declared beside the toast timers because both outlive a render: the wait
   * polls for up to {@link BROWSER_UPDATE_WAIT_MS} after the user's browser was
   * opened, and unmounting the page must stop it.
   */
  const browserUpdateTimer = useRef(null)

  // The browser-capture wait outlives a single render but not the tab: leaving
  // the page must not keep a timer (and a poll) alive.
  useEffect(() => () => {
    if (browserUpdateTimer.current !== null) clearTimeout(browserUpdateTimer.current)
    browserUpdateTimer.current = null
  }, [])

  /**
   * 账号导入成功后的统一收口（顶部「导入灵感」弹窗与账号监控页内的弹窗共用）。
   *
   * 只切 tab 是不够的：用户本来就在账号监控页时 tab 不变、`useRivalFeed` 的
   * enabled 也跟着不变，重新请求不会被触发 —— 新账号既不进账号筛选器，也不进
   * 作品流，界面上看起来就是「点了导入没反应」。所以这里显式重读一次第 1 页，
   * 并把成功文案交给顶部气泡，让这次导入在界面上留下痕迹。
   */
  const handleAccountImported = useCallback((account) => {
    landOnAccountTab(account)
    void reloadRivalFeed()
    showToast(accountImportNotice(t, account))
  }, [landOnAccountTab, reloadRivalFeed, showToast, t])

  /**
   * 内容导入成功：先走原有的入库收口（前插新行、切到能显示它的 tab、钉住卡片），
   * 再补一句气泡回执。入库本身的痕迹在网格里，气泡只回答「刚才那一下成了没有」。
   */
  const handleContentImported = useCallback((item) => {
    if (!item) return
    setCollectionId(item.collection_id || '')
    handleImportSuccess(item)
    showToast(t('add.importedToast'))
  }, [handleImportSuccess, showToast, t])

  const libraryCollections = useInspirationCollections({ feed, collectionId, setCollectionId, t, showToast })

  /**
   * Wait for the capture to land, then re-read the feed.
   *
   * The capture happens in the user's own browser and the Host pushes nothing
   * back, so a click that only opens a tab looks like「点了没反应」the moment the
   * user returns. `last_checked_at` is the only field this path writes — a cloud
   * refresh writes `last_refresh_at` — so waiting on it cannot be satisfied by
   * an unrelated cloud cycle.
   * @param {string} id
   */
  const waitForBrowserUpdate = useCallback(async (id) => {
    const startedAt = Date.now()
    const deadline = startedAt + BROWSER_UPDATE_WAIT_MS
    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        browserUpdateTimer.current = setTimeout(resolve, BROWSER_UPDATE_POLL_MS)
      })
      browserUpdateTimer.current = null
      let accounts = null
      try {
        const res = await fetchRivalAccounts({})
        accounts = res?.ok ? (res.body?.data?.items || []) : null
      } catch {
        accounts = null
      }
      const row = Array.isArray(accounts)
        ? accounts.find((account) => String(account?.id) === String(id))
        : null
      const checked = Date.parse(String(row?.last_checked_at || ''))
      if (Number.isFinite(checked) && checked >= startedAt - 1_000) {
        void reloadRivalFeed()
        return
      }
    }
  }, [reloadRivalFeed])

  /**
   * 「更新这个账号（浏览器）」的唯一入口（Issue #3556 / #3839）。
   *
   * 账号行与空态按钮都走这里：先向 Host 要一次性 token，再用默认浏览器打开带
   * token 的主页；失败时给一句气泡，绝不假装已经打开。抽成回调而不是在两处各写
   * 一遍，是因为第二份实现迟早会和 Host 的 400/422 契约漂开。
   */
  const requestBrowserUpdate = useCallback(async (id) => {
    let result
    try {
      result = await requestRivalPluginRefresh(id)
    } catch {
      result = null
    }
    const url = result?.body?.data?.url
    if (!result || result.ok === false || typeof url !== 'string' || url === '') {
      showToast(t('rivalAccounts.refresh.pluginFailed'))
      return false
    }
    if (!openExternalUrl(url)) {
      showToast(t('rivalAccounts.refresh.pluginFailed'))
      return false
    }
    showToast(t('rivalAccounts.refresh.pluginOpened'))
    // 连点两次不该叠出两个等待；旧的那个直接作废。
    if (browserUpdateTimer.current !== null) clearTimeout(browserUpdateTimer.current)
    void waitForBrowserUpdate(id)
    return true
  }, [showToast, t, waitForBrowserUpdate])

  /**
   * 合集卡「加入会话」：同一时刻只处理一个合集。
   *
   * 成功不加气泡——草稿出现在输入框里本身就是回执；失败把模块给的
   * `errorKey` 交给既有顶部气泡通道，不新建全局弹窗。ref 与 state 成对：
   * ref 挡住同一 tick 内的连点，state 只负责按钮忙碌态。
   */
  const [addingCollectionId, setAddingCollectionId] = useState('')
  const addingCollectionRef = useRef('')
  const handleAddCollectionToSession = useCallback(async collection => {
    if (addingCollectionRef.current) {
      showToast(t('collection.sessionBusy'))
      return
    }
    const collectionId = String(collection?.id ?? '')
    addingCollectionRef.current = collectionId || 'pending'
    setAddingCollectionId(collectionId)
    try {
      const result = await addCollectionToSession(collection, {
        t,
        onError: failure => console.error('[omnimux-inspiration] collection to session failed', failure),
      })
      // 成功时输入框里出现原生附件卡就是回执，不再叠加 toast；只有
      // 「该合集已在附件中」需要解释为什么没有第二张卡。
      if (result?.duplicate) showToast(t('collection.attachmentExists'))
      else if (!result?.ok) {
        // 官方 composer 的拒绝原因（提交中/相册上限等）已是宿主本地化文案，
        // 比通用失败文案更能解释「为什么这次没挂上」。
        const detail = typeof result?.detail === 'string' ? result.detail.trim() : ''
        showToast(detail || t(result?.errorKey || 'collection.sessionFailed'))
      }
    } catch (failure) {
      // The module answers recoverable failures with error keys. Only an
      // unexpected fault lands here: keep its detail out of the UI, but do not
      // drop it silently either.
      console.error('[omnimux-inspiration] add collection to session failed', failure)
      showToast(t('collection.sessionFailed'))
    } finally {
      addingCollectionRef.current = ''
      setAddingCollectionId('')
    }
  }, [showToast, t])

  /**
   * 单卡「添加到对话」：与合集「加入会话」同一条 composer 附件通道，只把
   * 一张卡写成一个 Markdown 附件；成功不叠 toast（附件卡就是回执），
   * 重复与失败走既有气泡。
   */
  const addingCardRef = useRef('')
  const handleAddCardToSession = useCallback(async (descriptor) => {
    const row = descriptor?.source_row
    if (!row) return
    if (addingCardRef.current) {
      showToast(t('card.sessionBusy'))
      return
    }
    addingCardRef.current = String(row.id ?? 'pending')
    try {
      const result = await addCardToSession(row, {
        t,
        onError: failure => console.error('[omnimux-inspiration] card to session failed', failure),
      })
      if (result?.duplicate) showToast(t('card.sessionExists'))
      else if (result?.ok) showToast(t('card.sessionAdded'))
      else if (!result?.ok) {
        const detail = typeof result?.detail === 'string' ? result.detail.trim() : ''
        showToast(detail || t(result?.errorKey || 'card.sessionFailed'))
      }
    } catch (failure) {
      console.error('[omnimux-inspiration] add card to session failed', failure)
      showToast(t('card.sessionFailed'))
    } finally {
      addingCardRef.current = ''
    }
  }, [showToast, t])

  // Platform filter gate: null (no dropdown) while a single platform is known.
  const platformOptions = buildPlatformFilterOptions(availablePlatforms, t)
  const rivalPlatformOptions = buildRivalPlatformOptions(t)

  /**
   * Official 18-industry dropdown (Issue #2507 / #2511). The list is local and does
   * not wait on `/categories`. 爆款趋势 applies the official id. On
   * 灵感库 the same labels stay visible but onChange is ignored so a click
   * cannot stash a hidden id that would reappear after switching back.
   */
  const cloudCategoryTab = tab === 'public'
  const categoryOptions = useMemo(() => buildCategoryFilterOptions(t), [t])
  const handleCategoryChange = useCallback((next) => {
    if (!cloudCategoryTab) return
    setCategory(next)
  }, [cloudCategoryTab, setCategory])

  // The row the last import produced is pinned above the list while it is
  // missing from it: the tab switch that follows an import refetches page 1, and
  // a row created a second ago can be sorted off that page even with no filter.
  const visibleItems = useMemo(
    () => withLandedItem(items, landedItem, tab),
    [items, landedItem, tab],
  )
  const landedId = landedItem?.id
  const gridCollections = tab === 'local' && !collectionId ? libraryCollections.collections : []
  const gridCards = useMemo(() => [
    ...gridCollections.map(collection => ({ ...toCollectionCardRow(collection), collection })),
    // 合集详情是素材架：成员卡统一封面优先形态；根层信息流保持原映射（#3459）。
    ...visibleItems.map(row => (collectionId ? toCollectionMemberCard(row, t) : toInspirationCardRow(row, t))),
  ], [gridCollections, visibleItems, t, collectionId])
  const drag = useCollectionDrag({
    enabled: tab === 'local' && !collectionId && !selecting && !libraryCollections.busy && !libraryCollections.intent && !selectedItem,
    items: visibleItems, collections: gridCollections, onDrop: libraryCollections.requestMerge, onStart: libraryCollections.cancelSelection, t,
  })
  const selectItem = item => {
    if (libraryCollections.selectedSource && item.is_local) libraryCollections.requestMerge(libraryCollections.selectedSource, item)
    else setSelectedItem(item)
  }
  const selectCollection = collection => {
    if (libraryCollections.selectedSource) libraryCollections.requestMerge(libraryCollections.selectedSource, null, collection)
    else libraryCollections.open(collection)
  }

  // Bring the landed card into view and flash it. The effect owns the highlight;
  // the pin above is what guarantees there is a card to find.
  useEffect(() => {
    if (landedId == null) return undefined
    return revealLandedCard(landedId)
  }, [landedId])

  useEffect(() => {
    injectInspirationStyles()
    injectCollectionStyles()
  }, [])

  const toolbarRef = useRef(null)

  // 一级分类切换后回到页面顶部。
  useEffect(() => {
    const stage = toolbarRef.current?.closest?.('.omx-stage-scroll')
    if (stage) stage.scrollTop = 0
  }, [tab])

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

      {/* 吸附栈：一级 Tab 工具栏（骨架契约 §二·补，Issue 1977） */}
      <div className="omx-stage-sticky" ref={toolbarRef}>
      <FilterBar
        className="omnimux-inspiration-toolbar"
        filters={
          <Tabs
            variant="underline"
            items={[
              { id: 'public', label: t('tab.public') },
              { id: 'local', label: t('tab.local') },
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
            {rivalFeed.accounts.length > 0 ? (
              <RivalRefreshButton
                t={t}
                gate={rivalRefreshGate}
                quota={rivalQuota}
                cooldownLeft={rivalCooldownLeft}
                fresh={rivalCooldownLeft !== null}
                busy={rivalFeed.refreshBusy}
                onRefresh={rivalFeed.refreshPool}
              />
            ) : null}
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
      {tab === 'public' ? (
        <div className="omnimux-inspiration-subfilter-sticky">
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
              value={cloudCategoryTab ? category : ''}
              aria-label={t('filter.category')}
              onChange={handleCategoryChange}
              className="omnimux-inspiration-subfilter-select"
              options={categoryOptions}
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

        </div>
      ) : null}
      {!rivalTab && selecting ? (
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
      </div>

      {/* Content area — the one region a tab switch replaces. */}
      {tab === 'local' && collectionId ? (
        <CollectionHeader
          t={t}
          title={libraryCollections.activeCollection?.title || ''}
          busy={libraryCollections.busy}
          addToSessionBusy={addingCollectionId === String(libraryCollections.activeCollection?.id || collectionId)}
          onBack={libraryCollections.back}
          onRename={libraryCollections.activeCollection ? () => libraryCollections.rename(libraryCollections.activeCollection) : undefined}
          onAddToSession={libraryCollections.activeCollection ? () => handleAddCollectionToSession(libraryCollections.activeCollection) : undefined}
        />
      ) : null}
      {tab === 'local' && libraryCollections.selectedSource ? (
        <div className="omnimux-inspiration-collection-selection" role="status">
          <span>{t('collection.chooseTarget')} · {libraryCollections.selectedSource.title}</span>
          <Button variant="ghost" onClick={libraryCollections.cancelSelection}>{t('collection.cancel')}</Button>
        </div>
      ) : null}
      {rivalTab ? (
        <div className={`omnimux-rival-layout${rivalFeed.accounts.length === 0 ? ' is-single' : ''}`}>
          {rivalFeed.accounts.length > 0 ? (
          <RivalAccountColumn
            t={t}
            accounts={rivalFeed.accounts}
            selection={rivalFeed.selection}
            allIds={rivalFeed.allIds}
            onSelect={rivalFeed.selectAccount}
            onReset={rivalFeed.resetAccounts}
            onRemove={async (id) => {
              let result
              try {
                result = await removeRivalAccount(id)
              } catch {
                return { ok: false }
              }
              if (result?.ok === false) return { ok: false }
              if (rivalFeed.selection.mode === 'subset' && String((rivalFeed.selection.ids || [])[0]) === String(id)) {
                rivalFeed.resetAccounts()
              } else {
                await rivalFeed.reload()
              }
              return { ok: true }
            }}
            onRefresh={rivalFeed.retryAccount}
            onRetry={rivalFeed.retryAccount}
            onPluginRefresh={requestBrowserUpdate}
            quotaLeft={rivalQuota?.left}
            refreshBusy={rivalFeed.refreshBusy}
            active={active !== false}
          />
          ) : null}
          <div className="omnimux-rival-content">
            <RivalAccountsPanel
              t={t}
              active={active !== false}
              feed={{ ...rivalFeed, query: rivalQuery, platform: rivalPlatform }}
              onImported={(item) => {
                void reloadRivalFeed()
                handleContentImported(item)
              }}
              onAccountImported={handleAccountImported}
              onBrowseTrend={() => setTab('public')}
              onBrowserUpdate={requestBrowserUpdate}
            />
          </div>
        </div>
      ) : (
        <>
          {loading && gridCards.length === 0 ? (
            <div className="omnimux-inspiration-skeleton">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="omnimux-inspiration-skel" />
              ))}
            </div>
          ) : null}

          {phase === 'need-login' && tab === 'public' ? <LoginGate t={t} /> : null}

          {phase === 'ready' && error && (tab === 'local' || gridCards.length === 0) ? (
            <div className="omnimux-inspiration-error">
              <p className="omnimux-inspiration-empty-text">
                {error === 'disabled' ? t('error.disabled') : error || t('error.generic')}
              </p>
              {tab === 'local' ? <Button variant="outline" onClick={() => feed.refreshData()}>{t('collection.retry')}</Button> : null}
            </div>
          ) : null}

          {!loading && gridCards.length === 0 && !error ? (
            collectionId ? <EmptyState title={t('collection.empty')} /> : <InspirationEmptyState t={t} onOpenAdd={() => setImportOpen(true)} />
          ) : null}

          {gridCards.length > 0 ? (
            <>
              <div className="omnimux-inspiration-collection-surface" {...drag}>
              <RivalMasonry
                className={`omnimux-inspiration-grid ${selecting ? 'selecting' : ''}`}
                cards={gridCards}
                t={t}
                renderCard={({ card: descriptor, style, column }) => descriptor.card_type === 'collection' ? (
                  <InspirationCollectionCard collection={descriptor.collection} t={t} style={style} column={column}
                    onOpen={selectCollection}
                    onView={() => libraryCollections.open(descriptor.collection)}
                    onAddToSession={handleAddCollectionToSession}
                    addToSessionBusy={addingCollectionId === String(descriptor.collection.id)}
                    menuNode={<InspirationCollectionMenu t={t} disabled={libraryCollections.busy} onRename={() => libraryCollections.rename(descriptor.collection)} />}
                  />
                ) : (
                  <InspirationCoverCard
                    descriptor={descriptor}
                    style={style}
                    column={column}
                    actionsNode={(
                      <InspirationCardMenu
                        t={t}
                        disabled={libraryCollections.busy}
                        items={buildCardMenuItems({
                          t,
                          local: tab === 'local',
                          inCollection: Boolean(collectionId),
                          onAddToConversation: () => handleAddCardToSession(descriptor),
                          onMerge: () => libraryCollections.selectSource(descriptor.source_row),
                          onRemove: () => libraryCollections.remove(descriptor.source_row),
                          onDelete: () => setPendingRemove({ ids: [descriptor.source_row.id], count: 1 }),
                        })}
                      />
                    )}
                    card={{
                      row: descriptor.source_row,
                      t,
                      selected: selectedIds.has(descriptor.source_row.id),
                      selecting,
                      replicateBusy,
                      onToggleSelect: toggleSelect,
                      onSelect: selectItem,
                      onReplicate: handleReplicate,
                    }}
                  />
                )}
              />
              </div>
              {loadingMore ? <div className="omnimux-inspiration-skeleton omnimux-rival-loadmore">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={`skel_more_${i}`} className="omnimux-inspiration-skel" aria-hidden="true" />
                ))}
              </div> : null}
            </>
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
            <ConfirmModal
              open
              onClose={() => setPendingRemove(null)}
              title={t('confirmRemove.title').replace('{n}', String(pendingRemove.count))}
              message={pendingRemove.error || t('confirmRemove.description')}
              confirmLabel={removing ? t('confirmRemove.deleting') : t('confirmRemove.confirm')}
              cancelLabel={t('confirmRemove.cancel')}
              confirmVariant="danger"
              confirmLoading={removing}
              onConfirm={handleConfirmBatchRemove}
            />
          ) : null}
        </>
      )}

      <InspirationInlineImportDialog
        open={importOpen}
        t={t}
        onClose={() => setImportOpen(false)}
        onImported={handleContentImported}
        onAccountImported={handleAccountImported}
      />
      <InspirationCollectionDialog intent={libraryCollections.intent} t={t} onClose={libraryCollections.close}
        onConfirm={libraryCollections.confirm} busy={libraryCollections.busy} error={libraryCollections.error} />

      {/* 导入成功的气泡：浮在内容之上，不占内容区高度。 */}
      {toast ? (
        <div
          className={`omnimux-inspiration-toast${toastLeaving ? ' is-leaving' : ''}${toast.action ? ' has-action' : ''}`}
          role="status"
          data-toast-id={toast.id}
        >
          <span className="omnimux-inspiration-toast-icon" aria-hidden="true">
            <CheckIcon size={16} />
          </span>
          <span className="omnimux-inspiration-toast-text">{toast.text}</span>
          {toast.action ? <Button variant="ghost" size="sm" disabled={libraryCollections.busy} onClick={toast.action}>{toast.actionLabel}</Button> : null}
        </div>
      ) : null}
    </div>
  )
}
