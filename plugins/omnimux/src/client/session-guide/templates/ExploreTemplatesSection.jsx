import React, { useState, useMemo } from 'react';
import {
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  selectShelfItems,
} from './templates-data.js';
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx';
import { TemplatesGridView } from './TemplatesGridView.jsx';
import { TemplateDetailDrawer } from './TemplateDetailDrawer.jsx';
import FEATURED_SKILLS_JSON from '../skills/featured-skills.json' with { type: 'json' };
import { claimProductStage } from '../../conversation-box.js';

/**
 * 分类全量数据内存缓存池
 */
const CATEGORY_DATA_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function resolveSkillCover(cover) {
  if (!cover || typeof cover !== 'string') return '';
  const trimmed = cover.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `/omnimux-market/icon?url=${encodeURIComponent(trimmed)}`;
}

const TIKTOK_TRENDING_FALLBACK_ITEMS = Object.freeze([
  {
    id: 'trend_hair_straighten_01',
    title: '理发沙龙现场：高温夹板拉直柔顺喷雾对半强对比',
    titleEn: 'Salon Live: Heat Press Hair Straightening Half-Split Contrast',
    views: 5820000,
    engagement: 0.021,
    cover: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '前2秒高温蒸汽抓眼球 + 中间分屏对半强对比 + 结尾手触反光顺滑',
  },
  {
    id: 'trend_foundation_redness_02',
    title: '无暇粉底液半脸涂抹测评：瞬间遮盖红血丝',
    titleEn: 'Flawless Foundation Half-Face Review: Instant Redness Eraser',
    views: 8150000,
    engagement: 0.034,
    cover: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '微距镜头直怼毛孔瑕疵 + 刷子一抹即净 + 自然日光无滤镜对比',
  },
  {
    id: 'trend_scalp_scrub_03',
    title: '头皮深度去角质清洁前后微观毛囊放大镜对比',
    titleEn: 'Scalp Deep Exfoliation Microscopic Follicle Contrast',
    views: 12400000,
    engagement: 0.048,
    cover: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '放大镜特写油脂角质 + 清洁啫喱起泡冲洗 + 干净通透毛囊特写',
  },
  {
    id: 'trend_car_scratch_08',
    title: '汽车划痕修复膏钥匙暴力刮擦现场抹平',
    titleEn: 'Car Scratch Repair Wax Key Scratch Live Erase',
    views: 18900000,
    engagement: 0.065,
    cover: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '钥匙刺耳划车漆痛点 + 修复膏海绵涂抹 + 擦亮瞬间反光如新镜面',
  },
]);

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
    title: item.title || item.titleZh || '灵感模板',
    extension: 'TPL',
    relativePath: `templates/${item.categorySlug || 'video'}/${item.id}.json`,
    previewUrl: item.thumbnailUrl || item.cover || '',
    duration: item.duration || '15s',
    metadata: {
      templateId: item.id,
      categorySlug: item.categorySlug,
      prompt: item.prompt,
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

  // 1. 触发附件呼吸高亮与可见性通知
  win.dispatchEvent?.(
    new CustomEvent('omnimux:attachments:reveal', {
      detail: { sessionId: activeSessionId },
    })
  );

  // 2. 填入引导复刻提示词草稿
  const promptText = `请基于挂载的【${item.title || '灵感模板'}】模板，为我的商品定制视频复刻方案与分镜脚本。`;
  const composer = win.__omnimuxComposerActions;
  if (composer && typeof composer.setDraft === 'function') {
    if (!composer.getDraft?.()) {
      composer.setDraft(promptText);
    }
    composer.revealAttachments?.();
  } else {
    win.dispatchEvent?.(
      new CustomEvent('omnimux:composer:set-draft', {
        detail: { sessionId: activeSessionId, draft: promptText },
      })
    );
  }

  // 3. 聚焦输入框
  const inputEl = win.document?.querySelector?.('[data-composer-input="true"]');
  inputEl?.focus?.({ preventScroll: true });
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

  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false;

  // Skills 数据源映射
  const allSkillsItems = useMemo(() => {
    const rawList = Array.isArray(FEATURED_SKILLS_JSON?.skills) ? FEATURED_SKILLS_JSON.skills : [];
    return rawList.map((sk) => ({
      id: sk.id || sk.skill,
      skill: sk.skill || sk.id,
      title: isEn ? (sk.titleEn || sk.title || sk.nameEn || sk.skill) : (sk.titleZh || sk.title || sk.nameZh || sk.skill),
      titleEn: sk.titleEn || sk.title || '',
      summary: isEn ? (sk.summaryEn || sk.summary) : (sk.summaryZh || sk.summary),
      thumbnailUrl: resolveSkillCover(sk.cover),
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

  // 打开官方 AI 应用
  const handleAppLaunch = (item) => {
    if (!item) return;
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage?.getItem('omnimux_apps_manifests');
        let manifestsMap = stored ? JSON.parse(stored) : {};
        if (item.manifest && !manifestsMap[item.appId]) {
          manifestsMap[item.appId] = item.manifest;
          window.localStorage?.setItem('omnimux_apps_manifests', JSON.stringify(manifestsMap));
        }
      } catch {}

      try {
        claimProductStage('omnimux-apps');
      } catch {}

      try {
        if (typeof window.__omnimuxOpenAppTab === 'function') {
          window.__omnimuxOpenAppTab(item.manifest, {
            appId: item.appId,
            title: item.titleZh || item.title || 'AI 应用',
          });
        }
      } catch {}

      try {
        const sidebar = window.__OMNIMUX_BETTER_SIDEBAR__ || window.parent?.__OMNIMUX_BETTER_SIDEBAR__ || window.__omnimuxBetterSidebar;
        if (sidebar && typeof sidebar.openTab === 'function') {
          sidebar.openTab({
            type: 'omnimux-workflow:app',
            id: `app_${item.appId}`,
            title: item.titleZh || item.title || 'AI 应用',
            path: `app://${item.appId}`,
            meta: { appId: item.appId },
            extra: { manifest: item.manifest, appId: item.appId },
          });
        }
      } catch {}

      window.dispatchEvent(
        new CustomEvent('omnimux-app-open', {
          detail: {
            id: item.appId,
            appId: item.appId,
            title: item.titleZh || item.title,
            manifest: item.manifest,
          },
        })
      );
    }

    if (onApplyTemplate) {
      onApplyTemplate({
        appId: item.appId,
        isApp: true,
        template: item,
        manifest: item.manifest,
        title: item.titleZh || item.title,
        titleEn: item.titleEn,
      });
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

    // 2. TikTok 热门
    if (item.type === 'tiktok') {
      if (onApplyTrending) {
        onApplyTrending({
          id: item.id,
          title: item.title,
          titleEn: item.titleEn,
          breakdown: item.breakdown,
          item,
        });
      }
      return;
    }

    // 3. Skill 技能
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

    // 4. 普通灵感模板：自动挂载为附件到输入框上方并聚焦！
    attachTemplateToConversation(item);

    if (onApplyTemplate) {
      onApplyTemplate({
        template: item,
        prompt: item.prompt,
        title: item.title,
        titleEn: item.titleEn,
      });
    }
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
    if (selectedCategory === 'tiktok') {
      fullList = TIKTOK_TRENDING_FALLBACK_ITEMS;
    } else if (selectedCategory === 'skills') {
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

      {/* 视图展现：全部时展现各分类横滑货架行；选定特定分类时展现全量网格 */}
      {selectedCategory === 'all' ? (
        <div className="omnimux-explore-shelves-view">
          {SHELVES_CONFIG.map((shelf) => {
            let shelfItems = [];
            if (shelf.slug === 'tiktok') {
              shelfItems = TIKTOK_TRENDING_FALLBACK_ITEMS.slice(0, 8);
            } else if (shelf.slug === 'skills') {
              shelfItems = allSkillsItems.slice(0, 8);
            } else {
              shelfItems = selectShelfItems(shelf.slug, 8);
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
      />
    </div>
  );
}
