import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  EXPLORE_PRIMARY_TABS,
  EXPLORE_SUB_CATEGORIES,
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  selectShelfItems,
} from './templates-data.js';
import { resolveTemplateCopy } from './template-locale.js';
import { useTemplateLocale } from './use-template-locale.js';
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx';
import { TemplatesGridView } from './TemplatesGridView.jsx';
import { TemplateDetailDrawer } from './TemplateDetailDrawer.jsx';
import FEATURED_SKILLS_JSON from '../skills/featured-skills.json' with { type: 'json' };
import { openWorkbench } from '../../workbench/sidebar-controller.js';
import { loadLibraryCards, promptForCard } from '../../composer-add/library-stage-model.js';
import { FILTER_PILL_ENUM_MAP } from '../../workbench/asset-hub-data.js';
import { ensureAssetCardStyles } from '../../components/asset-picker/AssetPickerCard.jsx';
import { ensureProductCardStyles } from '../../components/product-picker/ProductPickerCard.jsx';
import { ensureInspirationCardStyles } from '../../components/inspiration-picker/InspirationPickerCard.jsx';
import { LibraryCard } from '../LibraryBrowser.jsx';
import { SharedTabIcon } from '../../shared/asset-hub-tabs/SharedTabIcons.jsx';

/**
 * 官方标准专属矢量图标渲染（代理共享单一真源）
 */
function renderPrimaryTabIcon(iconName) {
  return <SharedTabIcon name={iconName} size={15} />;
}

/**
 * 分类全量数据内存缓存池
 */
const CATEGORY_DATA_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

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
 */
export function attachCardToConversation(cardOrItem, customWin) {
  const win = customWin || (typeof window !== 'undefined' ? window : null);
  if (!cardOrItem || !win) return;

  const raw = cardOrItem.trending || cardOrItem.raw || cardOrItem;
  const lane = cardOrItem.lane || raw.lane || (cardOrItem.trending ? 'trending' : (raw.price !== undefined || raw.sellingPoints ? 'products' : 'templates'));
  const entityId = raw.id || cardOrItem.id || `entity-${Date.now()}`;
  const title = cardOrItem.title || raw.title || raw.name || '创作素材';

  let kind = 'inspiration';
  let extension = 'TPL';
  let previewUrl = raw.thumbnailUrl || raw.cover || raw.coverUrl || raw.mainImage || raw.image || cardOrItem.thumbnailUrl || '';
  let metadata = {};

  if (lane === 'products') {
    kind = 'product';
    extension = 'PRD';
    previewUrl = raw.mainImage || raw.image || raw.thumbnailUrl || raw.cover || (Array.isArray(raw.images) ? raw.images[0] : '') || previewUrl;
    metadata = {
      entityType: 'product',
      productId: entityId,
      title,
      price: raw.price || '',
      category: raw.category || '',
      sellingPoints: raw.sellingPoints || raw.description || '',
      specs: raw.specs || [],
      images: Array.isArray(raw.images) ? raw.images : (raw.image ? [raw.image] : []),
      originUrl: raw.url || raw.originUrl || '',
      sourcePlatform: raw.sourcePlatform || 'internal',
      agentContext: {
        entityType: 'product',
        summary: `产品名称：${title}；价格：${raw.price || '未标明'}；核心卖点：${raw.sellingPoints || raw.description || '无'}`,
        details: raw,
      },
    };
  } else if (lane === 'trending') {
    kind = 'inspiration';
    extension = 'MP4';
    previewUrl = raw.cover || raw.thumbnailUrl || raw.coverUrl || previewUrl;
    metadata = {
      entityType: 'trending_video',
      videoId: entityId,
      title,
      coverUrl: previewUrl,
      videoUrl: raw.videoUrl || '',
      metrics: raw.metrics || { views: raw.views, likes: raw.likes, engagementRate: raw.engagementRate },
      breakdown: raw.breakdown || '',
      script: raw.script || raw.transcript || '',
      tags: raw.tags || [],
      agentContext: {
        entityType: 'trending_video',
        summary: `爆款视频：${title}；播放量：${raw.views || '-'}；分镜拆解：${raw.breakdown || '无'}`,
        details: raw,
      },
    };
  } else if (lane === 'assets') {
    kind = 'asset';
    extension = (raw.type || 'file').toUpperCase();
    metadata = {
      entityType: 'asset',
      assetId: entityId,
      fileType: raw.type,
      url: raw.url || previewUrl,
      dimensions: raw.dimensions,
      duration: raw.duration,
      summary: `素材资产：${title} (${raw.type || 'file'})`,
    };
  } else {
    kind = 'inspiration';
    extension = raw.workflow ? 'TPL' : 'MP4';
    metadata = {
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
    };
  }

  const payload = {
    sourcePlugin: 'omnimux',
    kind,
    entityId,
    title,
    extension,
    relativePath: `materials/${lane}/${entityId}.${extension.toLowerCase()}`,
    previewUrl,
    duration: raw.duration || '15s',
    metadata,
  };

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
  const [activeDrawerTemplate, setActiveDrawerTemplate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [appLaunchError, setAppLaunchError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const appLaunchPending = useRef(false);

  // 外部素材库数据加载态
  const [libraryData, setLibraryData] = useState({ cards: [], loading: false, error: null });

  const currentLocale = useTemplateLocale(undefined, t);
  const isEn = String(currentLocale).toLowerCase().startsWith('en');

  // 确保跨库渲染 LibraryCard 时基础卡片样式已全局注入
  useEffect(() => {
    ensureAssetCardStyles();
    ensureProductCardStyles();
    ensureInspirationCardStyles();
  }, []);

  // 当切换到资产库/灵感库/商品库/爆款趋势时，自动加载其卡片数据
  useEffect(() => {
    if (activePrimaryTab === 'featured' || activePrimaryTab === 'skills') {
      return;
    }
    let alive = true;
    setLibraryData((prev) => ({ ...prev, loading: true, error: null }));
    loadLibraryCards(activePrimaryTab)
      .then((res) => {
        if (!alive) return;
        const laneErrors = Object.values(res.errors || {}).map((e) => e?.message).filter(Boolean);
        setLibraryData({
          cards: res.cards || [],
          loading: false,
          error: laneErrors.length ? laneErrors.join('；') : null,
        });
      })
      .catch((err) => {
        if (!alive) return;
        setLibraryData({ cards: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { alive = false; };
  }, [activePrimaryTab, reloadToken]);

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

  // 计算精选模板在网格视图下的数据集
  const featuredGridItems = useMemo(() => {
    if (activePrimaryTab !== 'featured' || selectedSubCategory === 'all') return [];
    return selectTemplatesByCategory(selectedSubCategory);
  }, [activePrimaryTab, selectedSubCategory]);

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
    if (selectedSubCategory === 'all') return libraryData.cards;
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
    <div className="omnimux-explore-templates-root" data-omnimux-explore-section="">
      {/* 标题栏 */}
      <div className="omnimux-explore-header-row">
        <h2 className="omnimux-explore-title" data-explore-title="">
          {isEn ? 'Explore templates' : '探索模板'}
        </h2>
      </div>

      {/* 一级导航与二级分类工具条 */}
      <div className="omnimux-explore-filter-bar">
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
                : selectShelfItems(shelf.slug, 5);
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
          {libraryData.loading ? (
            <p className="omnimux-library-stage-status">正在加载素材…</p>
          ) : libraryData.error ? (
            <div className="omnimux-library-stage-status">
              <p>{libraryData.error}</p>
              <button /* exempt-ui01: retry button */
                type="button"
                className="omnimux-library-stage-retry"
                onClick={() => setReloadToken((c) => c + 1)}
              >
                重试
              </button>
            </div>
          ) : filteredLibraryCards.length === 0 ? (
            <p className="omnimux-library-stage-status">暂无对应素材</p>
          ) : (
            <div className="omnimux-library-stage-grid">
              {filteredLibraryCards.map((card) => (
                <div
                  key={`${card.lane}:${card.id}`}
                  className="omnimux-library-stage-cell"
                  data-library-lane={card.lane}
                >
                  <LibraryCard card={card} t={t} onPick={handleLibraryCardPick} />
                </div>
              ))}
            </div>
          )}
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
