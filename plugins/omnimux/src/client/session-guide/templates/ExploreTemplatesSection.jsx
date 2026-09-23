import React, { useState, useMemo, useRef } from 'react';
import {
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
 * 将模板作为附件挂载到会话输入框上方
 */
export function attachTemplateToConversation(item, customWin) {
  const win = customWin || (typeof window !== 'undefined' ? window : null);
  if (!item || !win) return;

  const payload = {
    sourcePlugin: 'omnimux',
    kind: 'inspiration',
    entityId: item.id || `tpl-${Date.now()}`,
    title: item.localizedTitle || item.title || item.titleZh || '灵感模板',
    extension: 'TPL',
    relativePath: `templates/${item.categorySlug || 'video'}/${item.id}.json`,
    previewUrl: item.thumbnailUrl || item.cover || '',
    duration: item.duration || '15s',
    metadata: {
      templateId: item.id,
      categorySlug: item.categorySlug,
      prompt: item.localizedPrompt || item.prompt,
      workflow: item.workflow,
      sourcePlatform: item.sourcePlatform || 'creatify',
    },
  };

  const store = win.__omnimuxAttachments;
  const activeSessionId = store?.getActiveSessionId?.() || '';

  if (store && typeof store.addAttachment === 'function') {
    store.addAttachment(activeSessionId, payload);
  } else {
    win.dispatchEvent?.(new CustomEvent('omnimux:add-to-conversation', { detail: payload }));
  }

  // 触发附件呼吸高亮与可见性通知
  win.dispatchEvent?.(
    new CustomEvent('omnimux:attachments:reveal', {
      detail: { sessionId: activeSessionId },
    })
  );
  const composer = win.__omnimuxComposerActions;
  composer?.revealAttachments?.();
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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeDrawerTemplate, setActiveDrawerTemplate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [appLaunchError, setAppLaunchError] = useState('');
  const appLaunchPending = useRef(false);

  const currentLocale = useTemplateLocale(undefined, t);
  const isEn = String(currentLocale).toLowerCase().startsWith('en');

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
      categorySlug: 'skills',
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

  // 应用与其它工作台页面共用会话、服务就绪和布局导航。
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
      } catch {
        // A malformed cache can be rebuilt; storage access failures must still fail.
      }
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

    // 1. AI 应用：走直通打开
    if (item.isApp || item.type === 'app') {
      handleAppLaunch(item);
      return;
    }

    // 2. Skill 技能
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

    // 3. 普通灵感模板：先触发吸底（同一帧同步写入停靠态），再挂载附件。
    //    附件挂载提醒的强制滚动定位晚于吸底先手执行，落在已 fixed 到底部的
    //    输入框上即天然失效，页面保持原地不动。
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

  const handleViewAllFromShelf = (targetCat) => {
    setSelectedCategory(targetCat || 'all');
  };

  const handleBackToAll = () => {
    setSelectedCategory('all');
  };

  const currentCategoryObj =
    TEMPLATE_CATEGORIES.find((c) => c.slug === selectedCategory) || TEMPLATE_CATEGORIES[0];

  // 计算当前分类在网格视图下的全量数据集
  const gridItems = useMemo(() => {
    if (selectedCategory === 'all') return [];

    const cached = CATEGORY_DATA_CACHE.get(selectedCategory);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.items;
    }

    let fullList = [];
    if (selectedCategory === 'skills') {
      fullList = allSkillsItems;
    } else {
      fullList = selectTemplatesByCategory(selectedCategory);
    }

    CATEGORY_DATA_CACHE.set(selectedCategory, {
      items: fullList,
      timestamp: now,
    });

    return fullList;
  }, [selectedCategory, allSkillsItems]);

  return (
    <div className="omnimux-explore-templates-root" data-omnimux-explore-section="">
      {/* 标题栏 */}
      <div className="omnimux-explore-header-row">
        <h2 className="omnimux-explore-title" data-explore-title="">
          {isEn ? 'Explore templates' : '探索模板'}
        </h2>
      </div>

      {/* 10 大分类扁平胶囊栏 */}
      <div className="omnimux-explore-filter-bar">
        <div className="omnimux-explore-pills-row" role="tablist" aria-label="分类列表">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.slug;
            const displayName = isEn ? (cat.nameEn || cat.nameZh) : (cat.nameZh || cat.nameEn);
            return (
              <button /* exempt-ui01: category filter tab button */
                key={cat.slug}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`omnimux-explore-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
                data-category-slug={cat.slug}
              >
                <span>{displayName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {appLaunchError && <div role="alert" className="omnimux-starter-notice">{appLaunchError}</div>}

      {/* 视图展现：全部时展现各分类横滑货架行；选定特定分类时展现全量网格 */}
      {selectedCategory === 'all' ? (
        <div className="omnimux-explore-shelves-view">
          {SHELVES_CONFIG.map((shelf) => {
            let shelfItems = [];
            if (shelf.slug === 'skills') {
              shelfItems = allSkillsItems.slice(0, 5);
            } else {
              shelfItems = selectShelfItems(shelf.slug, 5);
            }

            return (
              <TemplatesShelfRow
                key={shelf.slug}
                shelf={shelf}
                items={shelfItems}
                onSelectTemplate={handleItemRecreate}
                onOpenDetail={handleOpenDetail}
                onViewAll={handleViewAllFromShelf}
                t={t}
              />
            );
          })}
        </div>
      ) : (
        <div className="omnimux-explore-grid-view-wrap">
          <TemplatesGridView
            category={currentCategoryObj}
            items={gridItems}
            onBackToAll={handleBackToAll}
            onSelectTemplate={handleItemRecreate}
            onOpenDetail={handleOpenDetail}
            t={t}
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
