import React from 'react';
import { renderFeaturedCard } from './FeaturedCard.jsx';
import {
  safeTrySkillInSession,
  WorkshopSwitch,
  resolveItemDesc,
  resolveItemTitle,
  WORKSHOP_DOMAIN_ORDER,
} from './plazaUtils.js';

function getH(opts) {
  if (opts && typeof opts.h === 'function') return opts.h;
  if (typeof h === 'function') return h;
  return React.createElement;
}

function resolveCardMeta(item, tr) {
  const title = resolveItemTitle(item, tr);
  const desc = resolveItemDesc(item, tr) || '暂无描述';
  return { title, desc };
}

function getFmt(downloads, tr) {
  if (typeof fmt === 'function') return fmt(downloads, tr);
  return String(downloads);
}

function normalizeCardArgs(arg1, arg2, arg3) {
  if (arg1 && typeof arg1 === 'object' && typeof arg1 !== 'function') {
    return {
      tr: arg1.tr,
      onOpen: arg1.onOpen,
      onToggle: arg1.onToggle,
      h: arg1.h,
    };
  }
  return {
    tr: arg1,
    onOpen: arg2,
    onToggle: arg3,
    h: undefined,
  };
}

export function renderRegularCard(item, ...args) {
  const { tr, onOpen, onToggle, h: customH } = normalizeCardArgs(...args);
  const h = customH || getH();
  const { title, desc } = resolveCardMeta(item, tr);
  const isChecked = Boolean(item.installed && item.enabled !== false);
  const onCardClick = () => { if (onOpen) onOpen(item); };
  const onSwitchChange = () => { if (onToggle) onToggle(item); };

  return h('div', { key: item.slug || item.id, className: 'regular-card', onClick: onCardClick },
    h('div', { className: 'regular-card-info' },
      h('div', { className: 'regular-card-top' },
        h('div', { className: 'regular-card-title', title }, title),
        item.downloads ? h('span', { className: 'regular-card-dl' }, getFmt(item.downloads, tr)) : null,
      ),
      h('div', { className: 'regular-card-desc' }, desc),
    ),
    h(WorkshopSwitch, { checked: isChecked, onChange: onSwitchChange }),
  );
}

export function renderMineCard(item, ...args) {
  const { tr, onOpen, onToggle, h: customH } = normalizeCardArgs(...args);
  const h = customH || getH();
  const { title, desc } = resolveCardMeta(item, tr);
  const isChecked = item.enabled !== false;
  const onCardClick = () => { if (onOpen) onOpen(item); };
  const onSwitchChange = () => { if (onToggle) onToggle(item); };

  return h('div', { key: item.slug || item.id, className: 'regular-card', onClick: onCardClick },
    h('div', { className: 'regular-card-info' },
      h('div', { className: 'regular-card-top' },
        h('div', { className: 'regular-card-title', title }, title),
      ),
      h('div', { className: 'regular-card-desc' }, desc),
    ),
    h(WorkshopSwitch, { checked: isChecked, onChange: onSwitchChange }),
  );
}

export function renderFeaturedSection(opts) {
  const h = getH(opts);
  const { featuredItems, tr, setOpen } = opts;
  if (!featuredItems || !(featuredItems.length > 0)) return null;
  return h('section', { className: 'featured-section' },
    h('div', { className: 'featured-title-bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } },
      h('h2', { className: 'featured-title', style: { margin: 0 } }, tr('workshop.featuredTitle') || '官方精选'),
    ),
    h('div', { className: 'featured-grid' },
      featuredItems.map((item) => renderFeaturedCard(item, { tr, onOpen: setOpen, onTry: safeTrySkillInSession })),
    ),
  );
}

export function renderRegularStatus(statusOpts, tr) {
  const h = getH();
  const { status, page, err, count } = statusOpts;
  if (status === 'loading' && page === 1) return h('p', { className: 'sh-mkt-status' }, tr('mkt.loading'));
  if (status === 'error') return h('p', { className: 'sh-mkt-status' }, tr('mkt.error', { m: err }));
  if (status === 'ready' && count === 0) return h('p', { className: 'sh-mkt-status' }, tr('search.empty'));
  return null;
}

export function renderRegularSection(opts) {
  const h = getH(opts);
  const { hasQuery, regularItems, uninstalledOnly, setUninstalledOnly, status, page, err, tr, setOpen, onToggle } = opts;
  const titleKey = hasQuery ? 'workshop.searchResults' : 'workshop.otherTitle';
  const statusNode = renderRegularStatus({ status, page, err, count: regularItems.length }, tr);
  const onFilterClick = () => setUninstalledOnly(!uninstalledOnly);
  return h('section', { className: 'regular-section' },
    h('div', { className: 'regular-header' },
      h('div', { className: 'regular-title-row' },
        h('span', null, tr(titleKey)),
        h('span', { className: 'regular-title-count' }, ' · ' + regularItems.length),
      ),
      h('div', { className: 'regular-controls' },
        h('div', { className: 'filter-item' + (uninstalledOnly ? ' checked' : ''), onClick: onFilterClick },
          h('div', { className: 'filter-circle' }),
          h('span', null, tr('workshop.onlyUninstalled') || '仅显示未安装'),
        ),
        h('div', { className: 'sort-btn' }, h('span', null, tr('workshop.sortRecent') || '排序: 最近')),
      ),
    ),
    statusNode,
    regularItems.length ? h('div', { className: 'regular-grid' }, regularItems.map((item) => renderRegularCard(item, tr, setOpen, onToggle))) : null,
  );
}

function resolveStateHook(hooks) {
  if (hooks && typeof hooks.useState === 'function') return hooks.useState;
  if (typeof useState === 'function') return useState;
  return React.useState;
}

function resolveRefHook(hooks) {
  if (hooks && typeof hooks.useRef === 'function') return hooks.useRef;
  if (typeof useRef === 'function') return useRef;
  return React.useRef;
}

function resolveEffectHook(hooks) {
  if (hooks && typeof hooks.useEffect === 'function') return hooks.useEffect;
  if (typeof useEffect === 'function') return useEffect;
  return React.useEffect;
}

function renderCheckIcon(h) {
  return h('svg', {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    fill: 'none',
    className: 'mine-dropdown-check',
    'aria-hidden': 'true',
  },
    h('path', {
      d: 'M3.5 8.5L6.5 11.5L12.5 4.5',
      stroke: 'currentColor',
      strokeWidth: '1.8',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

export function MineToolbar(props) {
  const h = getH(props);
  const stateFn = resolveStateHook(props?.hooks);
  const refFn = resolveRefHook(props?.hooks);
  const effectFn = resolveEffectHook(props?.hooks);

  const {
    mineCategory = '',
    setMineCategory = () => {},
    mineSource = '',
    setMineSource = () => {},
    availableSources = [],
    autoUpdate = false,
    setAutoUpdate = () => {},
    tr,
  } = props || {};

  const [openMenu, setOpenMenu] = stateFn(null);
  const catRef = refFn(null);
  const srcRef = refFn(null);

  effectFn(() => {
    if (!openMenu) return undefined;
    if (typeof document === 'undefined') return undefined;
    const onDocClick = (e) => {
      const target = e.target;
      if (openMenu === 'category' && catRef.current && !catRef.current.contains(target)) {
        setOpenMenu(null);
      } else if (openMenu === 'source' && srcRef.current && !srcRef.current.contains(target)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const isZh = tr ? tr('locale') === 'zh' : true;
  const isCatOpen = openMenu === 'category';
  const isSrcOpen = openMenu === 'source';

  const defaultCatText = tr ? (tr('workshop.category') || '分类') : '分类';
  const catPrefix = tr ? (tr('workshop.catPrefix') || '分类 ') : '分类 ';
  const catDisplay = mineCategory === '短剧漫剧' && isZh ? '短剧/漫剧' : mineCategory;
  const catBtnText = mineCategory ? (catPrefix + catDisplay) : defaultCatText;

  const defaultSrcText = tr ? (tr('workshop.source') || '来源') : '来源';
  const srcPrefix = tr ? (tr('workshop.sourcePrefix') || '来源 ') : '来源 ';
  const srcBtnText = mineSource ? (srcPrefix + mineSource) : defaultSrcText;

  const allCatLabel = isZh ? '全部分类' : (tr ? (tr('workshop.catAll') || 'All') : 'All');
  const allSrcLabel = isZh ? '全部来源' : (tr ? (tr('workshop.catAll') || 'All') : 'All');

  const isAllCatActive = !mineCategory;
  const isAllSrcActive = !mineSource;

  const toggleCatMenu = () => setOpenMenu(isCatOpen ? null : 'category');
  const toggleSrcMenu = () => setOpenMenu(isSrcOpen ? null : 'source');

  return h('div', { className: 'mine-toolbar' },
    h('div', { className: 'mine-dropdown-wrap', ref: catRef },
      // exempt-ui01 mine category dropdown button
      h('button', {
        type: 'button',
        className: 'pill-dropdown' + (isCatOpen ? ' open' : ''),
        'aria-expanded': isCatOpen,
        onClick: toggleCatMenu,
      },
        h('span', null, catBtnText),
        h('span', { className: 'pill-arrow', style: { fontSize: '10px' } }, '▾'),
      ),
      isCatOpen ? h('div', { className: 'mine-dropdown-menu', role: 'menu' },
        h('button', {
          key: '__all_cat__',
          type: 'button',
          className: 'mine-dropdown-item' + (isAllCatActive ? ' active' : ''),
          onClick: () => { setMineCategory(''); setOpenMenu(null); },
        },
          h('span', null, allCatLabel),
          isAllCatActive ? renderCheckIcon(h) : null,
        ),
        WORKSHOP_DOMAIN_ORDER.map((c) => {
          const isSelected = mineCategory === c;
          const label = (c === '短剧漫剧' && isZh) ? '短剧/漫剧' : c;
          return h('button', {
            key: c,
            type: 'button',
            className: 'mine-dropdown-item' + (isSelected ? ' active' : ''),
            onClick: () => { setMineCategory(c); setOpenMenu(null); },
          },
            h('span', null, label),
            isSelected ? renderCheckIcon(h) : null,
          );
        }),
      ) : null,
    ),
    availableSources && availableSources.length ?
      h('div', { className: 'mine-dropdown-wrap', ref: srcRef },
        // exempt-ui01 mine source dropdown button
        h('button', {
          type: 'button',
          className: 'pill-dropdown' + (isSrcOpen ? ' open' : ''),
          'aria-expanded': isSrcOpen,
          onClick: toggleSrcMenu,
        },
          h('span', null, srcBtnText),
          h('span', { className: 'pill-arrow', style: { fontSize: '10px' } }, '▾'),
        ),
        isSrcOpen ? h('div', { className: 'mine-dropdown-menu', role: 'menu' },
          h('button', {
            key: '__all_src__',
            type: 'button',
            className: 'mine-dropdown-item' + (isAllSrcActive ? ' active' : ''),
            onClick: () => { setMineSource(''); setOpenMenu(null); },
          },
            h('span', null, allSrcLabel),
            isAllSrcActive ? renderCheckIcon(h) : null,
          ),
          availableSources.map((src) => {
            const isSelected = mineSource === src;
            return h('button', {
              key: src,
              type: 'button',
              className: 'mine-dropdown-item' + (isSelected ? ' active' : ''),
              onClick: () => { setMineSource(src); setOpenMenu(null); },
            },
              h('span', null, src),
              isSelected ? renderCheckIcon(h) : null,
            );
          }),
        ) : null,
      ) : null,
    h('div', { className: 'auto-update-wrap' },
      h('span', null, tr ? (tr('workshop.autoUpdate') || '自动更新') : '自动更新'),
      h(WorkshopSwitch, { checked: autoUpdate, onChange: setAutoUpdate }),
    ),
  );
}

export function renderMineToolbar(opts) {
  const h = getH(opts);
  return h(MineToolbar, { ...opts, h });
}

export function renderMineCardsList(filteredMine, opts) {
  const h = getH(opts);
  const { tr, setOpen, handleSwitchToggle } = opts;
  if (!filteredMine.length) {
    const emptyPrompt = tr ? (tr('workshop.emptyMine') || '暂无已安装的 Skill') : '暂无已安装的 Skill';
    return h('p', { className: 'sh-mkt-status' }, emptyPrompt);
  }
  return h('div', { className: 'regular-grid' },
    filteredMine.map((it) => renderMineCard(it, tr, setOpen, handleSwitchToggle)),
  );
}

export function renderMineTab(opts) {
  const h = getH(opts);
  const { mineToolbarOpts, filteredMine, setOpen, handleSwitchToggle, tr } = opts;
  return h('div', null,
    renderMineToolbar(mineToolbarOpts),
    renderMineCardsList(filteredMine, { tr, setOpen, handleSwitchToggle }),
  );
}

export function renderDiscoverTab(opts) {
  const h = getH(opts);
  const { featuredItems, featuredSectionOpts, category, hasQuery, regularSectionOpts, hasMore, onMore, tr } = opts;
  const buttonComp = typeof Button !== 'undefined' ? Button : 'button';
  return h('div', null,
    featuredItems.length > 0 ? renderFeaturedSection(featuredSectionOpts) : null,
    category === 'featured' && !hasQuery ? null : renderRegularSection(regularSectionOpts),
    hasMore ? h(buttonComp, { size: 'sm', variant: 'outline', onClick: onMore }, tr('mkt.more')) : null,
  );
}

export function renderPlazaTabContent(opts, renderExpertsTab) {
  if (opts.isExpertTab) return renderExpertsTab(opts);
  if (opts.mainTab === 'mine') return renderMineTab(opts);
  return renderDiscoverTab(opts);
}

export function PlazaCardGrid(props) {
  const h = getH(props);
  const { items, className = 'regular-grid', renderItem, ...rest } = props;
  if (!items || items.length === 0) return null;
  return h('div', { className },
    items.map((it) => renderItem(it, rest)),
  );
}
