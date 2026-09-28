import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  EXPLORE_PRIMARY_TABS,
  EXPLORE_SUB_CATEGORIES,
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  FEATURED_APPS_LIST,
  selectShelfItemsFrom,
} from './templates-data.js';
import { loadCreativeTemplates } from './creative-templates-client.js';
import { resolveTemplateCopy } from './template-locale.js';
import { useTemplateLocale } from './use-template-locale.js';
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx';
import { TemplatesGridView } from './TemplatesGridView.jsx';
import { TemplateDetailDrawer } from './TemplateDetailDrawer.jsx';
import FEATURED_SKILLS_JSON from '../skills/featured-skills.json' with { type: 'json' };
import { openWorkbench } from '../../workbench/sidebar-controller.js';
import { loadLibraryCards, promptForCard } from '../../composer-add/library-stage-model.js';
import { FILTER_PILL_ENUM_MAP, adaptCardToAttachmentPayload } from '../../workbench/asset-hub-data.js';
import { ensureAssetCardStyles } from '../../components/asset-picker/AssetPickerCard.jsx';
import { ensureProductCardStyles } from '../../components/product-picker/ProductPickerCard.jsx';
import { ensureInspirationCardStyles } from '../../components/inspiration-picker/InspirationPickerCard.jsx';
import { LibraryCard } from '../LibraryBrowser.jsx';
import { UnifiedLibraryGrid } from '../../components/library-flow/UnifiedLibraryGrid.jsx';
import { SharedTabIcon } from '../../shared/asset-hub-tabs/SharedTabIcons.jsx';

/**
 * 官方标准专属矢量图标渲染（代理共享单一真源）
 */
function renderPrimaryTabIcon(iconName) {
  return <SharedTabIcon name={iconName} size={15} />;
}

function resolveSkillCover(cover, coverIndex) {
  if (typeof coverIndex === 'number' && Number.isFinite(coverIndex)) {
    return `/omnimux/assets/skill-card-covers/skill-card-${coverIndex}.webp`;
  }
  if (!cover || typeof cover !== 'string') return '';
  const trimmed = cover.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const match = trimmed.match(/skill-card-(\d+)\.webp/);
  if (match) {
    return `/omnimux/assets/skill-card-covers/skill-card-${match[1]}.webp`;
  }
  return `/omnimux-market/icon?url=${encodeURIComponent(trimmed)}`;
}

/**
 * 将卡片（商品、爆款视频、资产、灵感、模板）作为附件挂载到会话输入框上方，
 * 并沉淀深度结构化实体上下文，供 Agent 全面感知领域信息。
 * 100% 委托 adaptCardToAttachmentPayload 单一事实源。
 */
export function attachCardToConversation(cardOrItem, customWin) {
  const win = customWin || (typeof window !== 'undefined' ? window : null);
  if (!cardOrItem || !win) return;

  let payload = adaptCardToAttachmentPayload(cardOrItem);
  if (!payload) {
    const raw = cardOrItem.raw || cardOrItem.trending || cardOrItem;
    const isTemplate = cardOrItem.type === 'template' || raw.type === 'template' || cardOrItem.lane === 'featured' || raw.lane === 'featured' || Boolean(raw.categorySlug);
    if (isTemplate && !raw.isApp && raw.type !== 'app') {
      const entityId = String(raw.id || cardOrItem.id || `tpl-${Date.now()}`);
      const title = String(cardOrItem.title || raw.title || raw.name || '创意模板');
      const previewUrl = cardOrItem.thumbnailUrl || raw.thumbnailUrl || raw.coverUrl || raw.cover || '';
      payload = {
        sourcePlugin: 'omnimux',
        kind: 'inspiration',
        entityId,
        title,
        extension: 'TPL',
        relativePath: `materials/templates/${entityId}.tpl`,
        previewUrl,
        duration: raw.duration || '15s',
        metadata: {
          entityType: 'template',
          templateId: entityId,
          categorySlug: raw.categorySlug || 'video',
          prompt: raw.localizedPrompt || raw.prompt || '',
          workflow: raw.workflow,
          sourcePlatform: raw.sourcePlatform || 'creatify',
          summary: `灵感模板：${title}`,
          agentContext: {
            entityType: 'template',
            summary: `模板名称：${title}；分类：${raw.categorySlug || 'video'}；预置指令：${raw.localizedPrompt || raw.prompt || '无'}`,
            details: raw,
          },
        },
      };
    }
  }
  if (!payload) return;

  const store = win.__omnimuxAttachments;
  const activeSessionId = store?.getActiveSessionId?.() || '';

  if (store && typeof store.addAttachment === 'function') {
    // 业务事件素材独占替换：每次复刻/选择先清空已有附件槽，绝不追加堆叠
    if (typeof store.clear === 'function') {
      store.clear(activeSessionId);
    }
    store.addAttachment(activeSessionId, payload);
  } else {
    win.dispatchEvent?.(new CustomEvent('omnimux:add-to-conversation', { detail: payload }));
  }

  win.dispatchEvent?.(
    new CustomEvent('omnimux:attachments:reveal', {
      detail: { sessionId: activeSessionId },
    })
  );
  const composer = win.__omnimuxComposerActions;
  composer?.revealAttachments?.();
}

/** 兼容保留旧方法签名 */
export function attachTemplateToConversation(item, customWin) {
  return attachCardToConversation(item, customWin);
}

/**
 * 探索模板核心大专区
 */
export function ExploreTemplatesSection({
  onApplyTemplate,
  onApplyTrending,
  onApplySkill,
  t,
}) {
  const [activePrimaryTab, setActivePrimaryTab] = useState('featured');
  const [selectedSubCategory, setSelectedSubCategory] = useState('all');
  // 创意模板快照：null = 尚未加载完成。适配器内部有单例缓存与共享请求，
  // featured-only 展示路径不触发网络请求（详见 creative-templates-client.js）。
  const [creativeList, setCreativeList] = useState(null);
  const [activeDrawerTemplate, setActiveDrawerTemplate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [appLaunchError, setAppLaunchError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const appLaunchPending = useRef(false);

  // 外部素材库数据加载态（支持无限滚动与状态解耦）
  const [libraryData, setLibraryData] = useState({
    cards: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    page: 1,
    error: null,
    loadMoreError: null,
  });
  const sectionRootRef = useRef(null);
  const filterBarRef = useRef(null);

  // 监听从加号菜单发起的平滑滚动跳转 Tab 事件（宽栏大屏场景）
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onScrollToTab = (e) => {
      const targetTab = e?.detail?.tab;
      if (targetTab) {
        handlePrimaryTabChange(targetTab);
      }

      // 平滑滚动定位到 Tab 栏，给用户完整的大屏浏览与选材视野
      const targetEl = filterBarRef.current || sectionRootRef.current;
      if (!targetEl) return;
      const scroller = targetEl.closest?.('[class*="scrollBody"], [data-conversation-scroll]') ||
        (typeof document !== 'undefined' ? document.querySelector('[class*="scrollBody"]') : null);

      if (scroller && typeof scroller.getBoundingClientRect === 'function') {
        const elRect = targetEl.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const targetOffset = scroller.scrollTop + (elRect.top - scrollerRect.top);
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ top: Math.max(0, targetOffset), behavior: 'smooth' });
        } else {
          scroller.scrollTop = Math.max(0, targetOffset);
        }
      } else if (typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // 关键：不强制派发 force: true 伪吸底事件！输入框随滚动自然响应，消除菜单腰斩与空载钉底
    };

    window.addEventListener('omnimux:explore:scroll-to-tab', onScrollToTab);
    return () => {
      window.removeEventListener('omnimux:explore:scroll-to-tab', onScrollToTab);
    };
  }, []);

  const currentLocale = useTemplateLocale(undefined, t);
  const isEn = String(currentLocale).toLowerCase().startsWith('en');

  // 确保跨库渲染 LibraryCard 时基础卡片样式已全局注入
  useEffect(() => {
    ensureAssetCardStyles();
    ensureProductCardStyles();
    ensureInspirationCardStyles();
  }, []);

  // 精选 tab 存在非 featured-only 货架与分类网格，需要完整创意模板快照。
  // 进入 featured tab 时按需加载一次（适配器内部缓存命中时几乎无感知）；
  // 请求失败保持 creativeList=null，页面继续以 featured 数据渲染，不产生可见错误。
  useEffect(() => {
    if (activePrimaryTab !== 'featured') {
      return undefined;
    }
    const controller = new AbortController();
    loadCreativeTemplates({ signal: controller.signal })
      .then((list) => {
        if (!controller.signal.aborted) setCreativeList(list);
      })
      .catch(() => {
        // AbortError 与业务/快照失败统一不落地为 UI 状态。
      });
    return () => controller.abort();
  }, [activePrimaryTab]);

  // 当切换到资产库/灵感库/商品库/爆款趋势，或切换二级分类时，发起服务端分类下推加载
  useEffect(() => {
    if (activePrimaryTab === 'featured' || activePrimaryTab === 'skills') {
      return undefined;
    }
    const controller = new AbortController();
    setLibraryData((prev) => ({
      ...prev,
      cards: [],
      loading: true,
      loadingMore: false,
      hasMore: false,
      page: 1,
      error: null,
      loadMoreError: null,
    }));

    loadLibraryCards(activePrimaryTab, {
      page: 1,
      pageSize: 48,
      category: selectedSubCategory,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        const laneErrors = Object.values(res.errors || {}).map((e) => e?.message).filter(Boolean);
        setLibraryData({
          cards: res.cards || [],
          loading: false,
          loadingMore: false,
          hasMore: Boolean(res.hasMore),
          page: 1,
          error: laneErrors.length ? laneErrors.join('；') : null,
          loadMoreError: null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLibraryData({
          cards: [],
          loading: false,
          loadingMore: false,
          hasMore: false,
          page: 1,
          error: err instanceof Error ? err.message : String(err),
          loadMoreError: null,
        });
      });

    return () => {
      controller.abort();
    };
  }, [activePrimaryTab, selectedSubCategory, reloadToken]);

  const libraryDataRef = useRef(libraryData);
  libraryDataRef.current = libraryData;

  // 触底加载下一页（增量流式追加）
  const handleLoadMore = useCallback(() => {
    const current = libraryDataRef.current;
    if (
      current.loading ||
      current.loadingMore ||
      !current.hasMore ||
      activePrimaryTab === 'featured' ||
      activePrimaryTab === 'skills'
    ) {
      return;
    }
    const nextPage = (current.page || 1) + 1;
    setLibraryData((prev) => ({ ...prev, loadingMore: true, loadMoreError: null }));

    loadLibraryCards(activePrimaryTab, {
      page: nextPage,
      pageSize: 48,
      category: selectedSubCategory,
    })
      .then((res) => {
        setLibraryData((prev) => {
          const seen = new Set(prev.cards.map((c) => String(c.id)));
          const newCards = (res.cards || []).filter((c) => !seen.has(String(c.id)));
          return {
            ...prev,
            cards: [...prev.cards, ...newCards],
            loadingMore: false,
            hasMore: Boolean(res.hasMore) && newCards.length > 0,
            page: nextPage,
            loadMoreError: null,
          };
        });
      })
      .catch((err) => {
        setLibraryData((prev) => ({
          ...prev,
          loadingMore: false,
          loadMoreError: err instanceof Error ? err.message : String(err),
        }));
      });
  }, [activePrimaryTab, selectedSubCategory]);

  const handleRetryLoadMore = useCallback(() => {
    handleLoadMore();
  }, [handleLoadMore]);

  // Skills 数据源映射
  const allSkillsItems = useMemo(() => {
    const rawList = Array.isArray(FEATURED_SKILLS_JSON?.skills) ? FEATURED_SKILLS_JSON.skills : [];
    return rawList.map((sk) => ({
      ...sk,
      id: sk.id || sk.skill,
      skill: sk.skill || sk.id,
      title: isEn ? (sk.titleEn || sk.title || sk.nameEn || sk.skill) : (sk.titleZh || sk.title || sk.nameZh || sk.skill),
      titleEn: sk.titleEn || sk.title || '',
      summary: isEn ? (sk.summaryEn || sk.summary) : (sk.summaryZh || sk.summary),
      thumbnailUrl: resolveSkillCover(sk.cover, sk.coverIndex),
      type: 'skill',
      categorySlug: sk.category || 'skills',
    }));
  }, [isEn]);

  // 打开详情抽屉
  const handleOpenDetail = (item) => {
    if (!item) return;
    if (item.isApp || item.type === 'app') {
      handleAppLaunch(item);
      return;
    }
    if (item.type === 'skill') {
      handleItemRecreate(item);
      return;
    }
    setActiveDrawerTemplate(item);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setActiveDrawerTemplate(null);
  };

  const handleAppLaunch = async (item) => {
    if (!item || typeof window === 'undefined' || appLaunchPending.current) return;
    appLaunchPending.current = true;
    setAppLaunchError('');
    const failure = isEn
      ? 'Unable to open this app. Check your workspace and try again.'
      : '应用暂时无法打开，请确认已选择工作区后重试。';
    try {
      const appId = typeof item.appId === 'string' ? item.appId.trim() : '';
      if (!appId) throw new Error('Missing app identity');
      const stored = window.localStorage.getItem('omnimux_apps_manifests');
      let parsed = {};
      try {
        parsed = stored ? JSON.parse(stored) : {};
      } catch {}
      const manifestsMap = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      if (item.manifest) {
        manifestsMap[appId] = item.manifest;
        window.localStorage.setItem('omnimux_apps_manifests', JSON.stringify(manifestsMap));
      }
      const title = item.manifest?.metadata?.name || resolveTemplateCopy(item, currentLocale).title || 'AI 应用';
      const opened = await openWorkbench({
        tabId: 'omnimux-workflow:app',
        id: `app_${appId}`,
        title,
        path: `app://${appId}`,
        meta: { appId },
        extra: { manifest: item.manifest, appId },
      });
      if (!opened) {
        setAppLaunchError(failure);
        return;
      }
      window.dispatchEvent(new CustomEvent('omnimux-app-open', {
        detail: { id: appId, appId, title, manifest: item.manifest },
      }));
    } catch {
      setAppLaunchError(failure);
    } finally {
      appLaunchPending.current = false;
    }
  };

  // 统一分发卡片动作
  const handleItemRecreate = (item) => {
    if (!item) return;

    if (item.isApp || item.type === 'app') {
      handleAppLaunch(item);
      return;
    }

    if (item.type === 'skill') {
      if (onApplySkill) {
        onApplySkill({
          id: item.id,
          skill: item.skill || item.id,
          title: item.title,
          item,
        });
      }
      return;
    }

    const copy = resolveTemplateCopy(item, currentLocale);
    const localizedItem = {
      ...item,
      localizedTitle: copy.title,
      localizedPrompt: copy.prompt,
    };
    if (onApplyTemplate) {
      onApplyTemplate({
        template: localizedItem,
        prompt: copy.prompt,
        title: copy.title,
        titleEn: item.titleEn,
      });
    }

    attachTemplateToConversation(localizedItem);
  };

  // 挑选外部库卡片
  const handleLibraryCardPick = (card) => {
    if (!card) return;
    const prompt = promptForCard(card);
    const itemData = card.trending || card.raw || card;

    // 关键！将卡片的素材主图/封面及深度结构化信息独占加载到素材卡槽，为 Agent 注入完整上下文
    attachCardToConversation(card);

    if (card.lane === 'trending' && onApplyTrending) {
      onApplyTrending(itemData);
    } else if (onApplyTemplate) {
      onApplyTemplate({
        template: itemData,
        prompt,
        title: card.title,
      });
    }
  };

  const handlePrimaryTabChange = (tabId) => {
    setActivePrimaryTab(tabId);
    setSelectedSubCategory('all');
  };

  const currentSubCategories = EXPLORE_SUB_CATEGORIES[activePrimaryTab] || EXPLORE_SUB_CATEGORIES.featured;

  // 计算精选模板在网格视图下的数据集；
  // 快照未就绪时退回 featured 列表，保持页面有内容（原同步行为近似）。
  const featuredGridItems = useMemo(() => {
    if (activePrimaryTab !== 'featured' || selectedSubCategory === 'all') return [];
    const list = creativeList || FEATURED_APPS_LIST;
    return list.filter(
      (item) => item.categorySlug === selectedSubCategory || item.categoryKey === selectedSubCategory
    );
  }, [activePrimaryTab, selectedSubCategory, creativeList]);

  // 计算技能在选定二级分类下的数据集
  const filteredSkills = useMemo(() => {
    if (activePrimaryTab !== 'skills') return [];
    if (selectedSubCategory === 'all') return allSkillsItems;
    const target = String(selectedSubCategory).toLowerCase();
    return allSkillsItems.filter((sk) => {
      const cat = String(sk.categorySlug || sk.category || '').toLowerCase();
      const tags = Array.isArray(sk.tags) ? sk.tags.map((t) => String(t).toLowerCase()) : [];
      if (target === 'voice-audio') {
        return cat.includes('voice') || cat.includes('audio') || tags.some((t) => t.includes('音频') || t.includes('画外音'));
      }
      if (target === 'storytelling') {
        return cat.includes('storytelling') || cat.includes('script') || tags.some((t) => t.includes('故事') || t.includes('脚本'));
      }
      return cat.includes(target) || tags.some((t) => t.includes(target));
    });
  }, [activePrimaryTab, selectedSubCategory, allSkillsItems]);

  // 外部库过滤卡片数据集
  const filteredLibraryCards = useMemo(() => {
    if (activePrimaryTab === 'featured' || activePrimaryTab === 'skills') return [];
    // 爆款趋势（trending）与灵感库（inspiration）已由服务端精准分类下推，直接展示服务端下发的数据集
    if (activePrimaryTab === 'trending' || activePrimaryTab === 'inspiration' || selectedSubCategory === 'all') {
      return libraryData.cards;
    }
    const target = String(selectedSubCategory).toLowerCase();
    const currentSubObj = currentSubCategories.find((s) => s.id === selectedSubCategory);
    const subNameZh = currentSubObj?.nameZh || '';
    const aliases = (FILTER_PILL_ENUM_MAP[subNameZh] || [target]).map((a) => String(a).toLowerCase());

    return libraryData.cards.filter((c) => {
      const trending = c.trending || {};
      const raw = c.raw || {};
      const categories = Array.isArray(raw.categories) ? raw.categories.join(' ').toLowerCase() : '';
      const cat = String(
        trending.industry || trending.category || raw.category || raw.type || raw.kind || c.lane || ''
      ).toLowerCase();
      return (
        aliases.some((alias) => cat.includes(alias) || categories.includes(alias)) ||
        cat.includes(target) ||
        categories.includes(target)
      );
    });
  }, [activePrimaryTab, selectedSubCategory, libraryData.cards, currentSubCategories]);

  const currentCategoryObj =
    TEMPLATE_CATEGORIES.find((c) => c.slug === selectedSubCategory) || {
      slug: selectedSubCategory,
      nameZh: currentSubCategories.find(s => s.id === selectedSubCategory)?.nameZh || '分类',
      nameEn: currentSubCategories.find(s => s.id === selectedSubCategory)?.nameEn || 'Category',
    };

  return (
    <div ref={sectionRootRef} className="omnimux-explore-templates-root" data-omnimux-explore-section="">
      {/* 标题栏 */}
      <div className="omnimux-explore-header-row">
        <h2 className="omnimux-explore-title" data-explore-title="">
          {isEn ? 'Explore templates' : '探索模板'}
        </h2>
      </div>

      {/* 一级导航与二级分类工具条 */}
      <div ref={filterBarRef} className="omnimux-explore-filter-bar">
        {/* 一级主库按钮栏：圆角矩形、无边框、无背景、无数量、带专属图标、激活显深底 */}
        <div className="omnimux-explore-primary-tabs" role="tablist" aria-label="一级核心库">
          {EXPLORE_PRIMARY_TABS.map((tab) => {
            const isActive = activePrimaryTab === tab.id;
            const displayName = isEn ? tab.nameEn : tab.nameZh;
            return (
              <button /* exempt-ui01: primary tab button */
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`omnimux-explore-primary-tab ${isActive ? 'active' : ''}`}
                onClick={() => handlePrimaryTabChange(tab.id)}
                data-primary-tab={tab.id}
                data-category-slug={tab.id}
              >
                {renderPrimaryTabIcon(tab.iconName)}
                <span>{displayName}</span>
              </button>
            );
          })}
        </div>

        {/* 二级场景与类目选项卡：极简下划线文本选项卡（Underline Tabs） */}
        <div className="omnimux-explore-sub-tabs" role="tablist" aria-label="二级细分分类">
          {currentSubCategories.map((sub) => {
            const isActive = selectedSubCategory === sub.id;
            const displayName = isEn ? sub.nameEn : sub.nameZh;
            return (
              <button /* exempt-ui01: sub category underline tab button */
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`omnimux-explore-sub-tab ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedSubCategory(sub.id)}
                data-sub-category={sub.id}
                data-category-slug={sub.id}
              >
                <span>{displayName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {appLaunchError && <div role="alert" className="omnimux-starter-notice">{appLaunchError}</div>}

      {/* 视图展现 */}
      {activePrimaryTab === 'featured' && selectedSubCategory === 'all' && (
        <div className="omnimux-explore-shelves-view">
          {SHELVES_CONFIG.map((shelf) => {
            const shelfItems =
              shelf.slug === 'skills'
                ? allSkillsItems.slice(0, 5)
                : selectShelfItemsFrom(creativeList || FEATURED_APPS_LIST, shelf.slug, 5);
            return (
              <TemplatesShelfRow
                key={shelf.slug}
                shelf={shelf}
                items={shelfItems}
                onSelectTemplate={handleItemRecreate}
                onOpenDetail={handleOpenDetail}
                onViewAll={(targetCat) => {
                  if (targetCat === 'skills') {
                    setActivePrimaryTab('skills');
                    setSelectedSubCategory('all');
                  } else {
                    setSelectedSubCategory(targetCat || 'all');
                  }
                }}
                t={t}
              />
            );
          })}
        </div>
      )}

      {activePrimaryTab === 'featured' && selectedSubCategory !== 'all' && (
        <div className="omnimux-explore-grid-view-wrap">
          <TemplatesGridView
            category={currentCategoryObj}
            items={featuredGridItems}
            onBackToAll={() => setSelectedSubCategory('all')}
            onSelectTemplate={handleItemRecreate}
            onOpenDetail={handleOpenDetail}
            t={t}
          />
        </div>
      )}

      {activePrimaryTab === 'skills' && (
        <div className="omnimux-explore-grid-view-wrap">
          <TemplatesGridView
            category={currentCategoryObj}
            items={filteredSkills}
            onBackToAll={() => setSelectedSubCategory('all')}
            onSelectTemplate={handleItemRecreate}
            onOpenDetail={handleOpenDetail}
            t={t}
          />
        </div>
      )}

      {activePrimaryTab !== 'featured' && activePrimaryTab !== 'skills' && (
        <div className="omnimux-explore-grid-view-wrap">
          <UnifiedLibraryGrid
            items={filteredLibraryCards}
            loading={libraryData.loading}
            loadingMore={libraryData.loadingMore}
            hasMore={libraryData.hasMore}
            error={libraryData.error}
            loadMoreError={libraryData.loadMoreError}
            emptyText="暂无素材"
            onLoadMore={handleLoadMore}
            onRetry={() => setReloadToken((c) => c + 1)}
            onRetryLoadMore={handleRetryLoadMore}
            onPick={handleLibraryCardPick}
            t={t}
            options={{ minColWidth: 180, gap: 16, maxCols: 6, minCols: 2 }}
          />
        </div>
      )}

      {/* 模板详情抽屉 */}
      <TemplateDetailDrawer
        isOpen={isDrawerOpen}
        template={activeDrawerTemplate}
        onClose={handleCloseDrawer}
        onApply={handleItemRecreate}
        t={t}
        locale={currentLocale}
      />
    </div>
  );
}
