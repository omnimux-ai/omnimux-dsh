import React, { useMemo } from 'react';
import { SHELVES_CONFIG, selectShelfItems } from './templates-data.js';
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx';

/**
 * 探索模板 (Explore Templates) 核心大专区
 * 战略大瘦身收敛版本：只保留 1 个核心货架分组，精选 7 大分类王牌爆款应用，点击秒级直通 AI 应用表单出片
 */
export function ExploreTemplatesSection({ onApplyTemplate, t }) {
  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false;

  // 获取 7 大精选出厂 AI 应用
  const items = useMemo(() => selectShelfItems('explore-templates', 7), []);

  const shelfConfig = SHELVES_CONFIG[0] || {
    slug: 'explore-templates',
    titleZh: '探索模板',
    titleEn: 'Explore Templates',
    subtitleZh: '精选 7 大分类王牌爆款短视频应用 · 传图一键出片',
    targetCategory: 'all',
    type: 'app',
  };

  // 点击卡片直接唤起对应的 AI 应用面板
  const handleItemSelect = (item) => {
    if (!item) return;

    if (typeof window !== 'undefined') {
      // 1. 确保 builtin manifest 预置进客户端 localStorage
      try {
        const stored = window.localStorage?.getItem('omnimux_apps_manifests');
        let manifestsMap = stored ? JSON.parse(stored) : {};
        if (item.manifest && !manifestsMap[item.appId]) {
          manifestsMap[item.appId] = item.manifest;
          window.localStorage?.setItem('omnimux_apps_manifests', JSON.stringify(manifestsMap));
        }
      } catch {
        // ignore storage error
      }

      // 2. 优先通过宿主更好侧栏打开 AI 应用 Tab
      const sidebar = window.__OMNIMUX_BETTER_SIDEBAR__ || window.parent?.__OMNIMUX_BETTER_SIDEBAR__;
      if (sidebar && typeof sidebar.openTab === 'function') {
        sidebar.openTab({
          type: 'omnimux_app',
          id: `app_${item.appId}`,
          title: item.titleZh || item.title || 'AI 应用',
          path: `app://${item.appId}`,
          meta: { appId: item.appId },
          extra: { manifest: item.manifest, appId: item.appId },
        });
      }

      // 3. 全局广播官方应用打开事件（唤醒已有 AppWorkspaceView 或主界面视图）
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

    // 兼顾原组件回调
    if (onApplyTemplate) {
      onApplyTemplate({
        appId: item.appId,
        template: item,
        manifest: item.manifest,
        title: item.titleZh || item.title,
        titleEn: item.titleEn,
      });
    }
  };

  const handleViewAll = () => {
    if (items.length > 0) {
      handleItemSelect(items[0]);
    }
  };

  return (
    <div className="omnimux-explore-templates-root" data-omnimux-explore-section="">
      {/* 单一精简货架流：呈现 7 大王牌应用大卡片 */}
      <div className="omnimux-explore-shelves-view">
        <TemplatesShelfRow
          shelf={shelfConfig}
          items={items}
          onSelectTemplate={handleItemSelect}
          onOpenDetail={handleItemSelect}
          onViewAll={handleViewAll}
          t={t}
        />
      </div>
    </div>
  );
}
