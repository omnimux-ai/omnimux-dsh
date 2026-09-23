import React from 'react';
import { getCardVisual } from './cardCoversData.js';
import {
  resolveIconSrc,
  resolveItemDesc,
  resolveItemTitle,
  safeTrySkillInSession,
} from './plazaUtils.js';
import { resolveSkillAuroraStyle } from './auroraGradients.js';

const h = React.createElement;

const COVER_NUMS = [4, 5, 6, 7, 9, 10, 2, 3];

/** 紧凑宽度下文字标签退出布局后，按钮靠图标保持可辨识；图标同时是无障碍名称之外的视觉锚点。 */
export function renderHoverIcon(kind) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  if (kind === 'detail') {
    return h('svg', common,
      h('path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696A10.75 10.75 0 0 1 21.938 12.348a1 1 0 0 1 0 .696A10.75 10.75 0 0 1 2.062 12.348' }),
      h('circle', { cx: 12, cy: 12, r: 3 }),
    );
  }
  return h('svg', common,
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
  );
}

export function renderFeaturedHoverActions(item, opts) {
  const { tr, onOpen, onTry } = opts || {};
  const onOpenClick = (e) => { e && e.stopPropagation(); onOpen && onOpen(item); };
  const onTryClick = (e) => { e && e.stopPropagation(); (onTry || safeTrySkillInSession)(item); };
  const detailTitle = tr ? (tr('workshop.detail') || '查看详情') : '查看详情';
  const tryTitle = tr ? (tr('workshop.try') || '去对话中试试') : '去对话中试试';

  return h('div', { className: 'featured-hover-actions' },
    h('button', {
      type: 'button',
      className: 'hover-btn hover-btn-detail',
      onClick: onOpenClick,
      'aria-label': detailTitle,
      title: detailTitle,
    }, renderHoverIcon('detail'), h('span', { className: 'hover-btn-label' }, detailTitle)),
    h('button', {
      type: 'button',
      className: 'hover-btn hover-btn-try',
      onClick: onTryClick,
      'aria-label': tryTitle,
      title: tryTitle,
    }, renderHoverIcon('try'), h('span', { className: 'hover-btn-label' }, tryTitle)),
  );
}

// 纯矢量火苗 (Hot)
function renderFireSvg() {
  return h('svg', {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': 'true',
  },
    h('path', {
      d: 'M12 2c-.6 1.8-1.5 3.3-2.6 4.7C8.1 8.2 6.8 9.9 6.8 12c0 3.3 2.7 6 6 6s6-2.7 6-6c0-1.8-1.1-4-2.8-5.7-1.1-1.1-2.1-2.4-2.7-4.3z',
    }),
  );
}

// 分类图标
function renderCatIcon(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('ugc')) {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
      h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
      h('circle', { cx: 12, cy: 7, r: 4 }),
    );
  }
  if (cat.includes('story') || cat.includes('script')) {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
      h('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
      h('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }),
    );
  }
  if (cat.includes('image') || cat.includes('static')) {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
      h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
      h('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
      h('polyline', { points: '21 15 16 10 5 21' }),
    );
  }
  if (cat.includes('video')) {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
      h('polygon', { points: '5 3 19 12 5 21 5 3' }),
    );
  }
  if (cat.includes('product')) {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
      h('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }),
      h('polyline', { points: '3.27 6.96 12 12.01 20.73 6.96' }),
      h('line', { x1: 12, y1: 22.08, x2: 12, y2: 12 }),
    );
  }
  return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
    h('circle', { cx: 12, cy: 12, r: 10 }),
    h('line', { x1: 12, y1: 8, x2: 12, y2: 12 }),
    h('line', { x1: 12, y1: 16, x2: 12.01, y2: 16 }),
  );
}

const CATEGORY_NAMES_ZH = {
  'ugc-testimonial': 'UGC 和用户评价',
  'storytelling-script': '故事讲述和脚本',
  'image-static': '图片和静态广告',
  'video-ads': '视频广告',
  'product-showcase': '产品展示',
  'meme-native': '模因与原生',
  'other': '其它营销分类',
};

const CATEGORY_NAMES_EN = {
  'ugc-testimonial': 'UGC & Testimonial',
  'storytelling-script': 'Storytelling & Script',
  'image-static': 'Image & Static Ads',
  'video-ads': 'Video Ads',
  'product-showcase': 'Product Showcase',
  'meme-native': 'Meme & Native',
  'other': 'Other',
};

function resolveCategoryLabel(category, isEn, tr) {
  if (category) {
    if (typeof tr === 'function') {
      const trVal = tr('cat.' + category);
      if (trVal && trVal !== 'cat.' + category) return trVal;
    }
    const dict = isEn ? CATEGORY_NAMES_EN : CATEGORY_NAMES_ZH;
    if (dict[category]) return dict[category];
  }
  return category || (isEn ? 'Marketing' : '营销技能');
}

/**
 * 1:1 复刻 Creatify 官方 3:2 质感卡片
 */
export function renderFeaturedCard(item, opts, onOpenArg, onPinArg, onTryArg) {
  let safeOpts = {};
  if (typeof opts === 'function') {
    const onTry = typeof onPinArg === 'function' && typeof onTryArg === 'function' ? onTryArg : onPinArg;
    safeOpts = { tr: opts, onOpen: onOpenArg, onTry };
  } else if (opts && typeof opts === 'object') {
    safeOpts = opts;
  }
  const { tr, onOpen, onTry, cardIndex } = safeOpts;
  const isEn = typeof tr === 'function' ? (tr('locale') === 'en') : (typeof document !== 'undefined' && document.documentElement.lang && /^en\b/i.test(document.documentElement.lang));

  const safeTr = (key, params, fallback) => {
    if (typeof tr === 'function') {
      const res = tr(key, params);
      if (res && res !== key) return res;
    }
    return fallback;
  };

  const title = resolveItemTitle(item, tr);
  const desc = resolveItemDesc(item, tr) || (isEn ? 'No description' : '暂无描述');

  // 极光色彩光学算法：每个技能卡片计算一套高颜值流光
  const aurora = resolveSkillAuroraStyle(item);
  // 兼容自定义封面与历史契约 (支持 item.homeCover / item.cover 及 featured-cover-svg 标记)
  const customCover = item.homeCover || item.cover;
  const coverSvgFallback = !customCover && item.icon ? 'featured-cover-svg' : '';

  const isHot = Boolean(item.isHot || item.tags?.includes('热门精选'));
  const isNew = Boolean(item.isNew || item.tags?.includes('新品上市'));
  const categoryLabel = resolveCategoryLabel(item.category, isEn, tr);
  const usesText = item.downloads
    ? safeTr('workshop.uses', { n: item.downloads }, `${item.downloads} ${isEn ? 'uses' : '次使用'}`)
    : safeTr('workshop.usesDefault', undefined, isEn ? '100+ uses' : '100+ 次使用');
  const bookmarkText = safeTr('workshop.bookmark', undefined, isEn ? 'Bookmark' : '收藏');
  const newBadgeText = safeTr('workshop.badgeNew', undefined, isEn ? 'NEW' : '新');
  const hotBadgeTitle = safeTr('workshop.hotPicks', undefined, isEn ? 'HOT PICKS' : '热门精选');
  const tryButtonText = safeTr('workshop.try', undefined, isEn ? 'Try in Chat' : '去对话中试试');
  // 悬停气泡提示：有意使用更紧凑精炼的「去对话试试」（相比按钮展开全称「去对话中试试」更轻量，避免气泡文字冗长）
  const tryTooltip = safeTr('workshop.tryTooltip', undefined, isEn ? 'Try in Chat' : '去对话试试');

  const onCardClick = () => { if (onOpen) onOpen(item); };
  const onTryClick = (e) => {
    e.stopPropagation();
    (onTry || safeTrySkillInSession)(item);
  };

  return h('div', {
    key: item.slug || item.id,
    className: 'featured-card omnimux-creatify-card',
    onClick: onCardClick,
    style: {
      background: aurora.bg,
    },
  },
    // 1. 动态极光流光背景层（纯算法渲染，零破图风险）
    h('div', {
      className: 'omnimux-creatify-card-bg-img',
      style: {
        background: aurora.bg,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      },
      'aria-hidden': 'true',
    }),
    // 2. 点阵纹理 Overlay
    h('div', { className: 'omnimux-creatify-dot-overlay', 'aria-hidden': 'true' }),
    // 3. 左上角徽标（热门/新品，移除冗余拥挤的分类胶囊）
    (isHot || isNew) ? h('div', { className: 'omnimux-creatify-card-top-left' },
      isHot ? h('span', { className: 'omnimux-creatify-badge-hot', title: hotBadgeTitle }, renderFireSvg()) : null,
      isNew ? h('span', { className: 'omnimux-creatify-badge-new' }, newBadgeText) : null,
    ) : null,
    // 4. 居中白色加粗大标题
    h('div', { className: 'omnimux-creatify-card-center' },
      h('h3', { className: 'omnimux-creatify-center-title' },
        h('span', null, title),
      ),
    ),
    // 6. 悬停浮层：滑出双行描述 + 使用量 + 快捷调用
    h('div', { className: 'omnimux-creatify-card-hover-drawer' },
      h('div', { className: 'omnimux-creatify-drawer-bg' }),
      h('div', { className: 'omnimux-creatify-drawer-content' },
        h('p', { className: 'omnimux-creatify-drawer-desc', title: desc }, desc),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '4px' } },
          h('div', { className: 'omnimux-creatify-drawer-uses' },
            h('svg', { width: 12, height: 12, viewBox: '0 0 24 24' },
              h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
              h('polyline', { points: '7 10 12 15 17 10' }),
              h('line', { x1: 12, y1: 15, x2: 12, y2: 3 }),
            ),
            h('span', null, usesText),
          ),
          h('button', {
            type: 'button',
            className: 'omnimux-creatify-quick-try-btn',
            title: tryTooltip,
            'aria-label': tryTooltip,
            onClick: onTryClick,
          },
            renderHoverIcon('try'),
            h('span', { className: 'omnimux-creatify-quick-try-label' }, tryButtonText),
          ),
        ),
      ),
    ),
  );
}

export function FeaturedCard(props) {
  const { item, ...rest } = props;
  return renderFeaturedCard(item, rest);
}
