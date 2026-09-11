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
  const { featuredItems, customOrder, onResetOrder, tr, setOpen, onMoveToTop } = opts;
  if (!featuredItems || !(featuredItems.length > 0)) return null;
  const hasCustom = customOrder && customOrder.length;
  const resetBtnStyle = { background: 'transparent', border: '1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,.12))', borderRadius: '6px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #cbd5e1)', padding: '3px 8px', cursor: 'pointer' };
  return h('section', { className: 'featured-section' },
    h('div', { className: 'featured-title-bar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } },
      h('h2', { className: 'featured-title', style: { margin: 0 } }, tr('workshop.featuredTitle') || '官方精选'),
      hasCustom ?
        // exempt-ui01 reset order button
        h('button', { type: 'button', className: 'btn-reset-order', style: resetBtnStyle, onClick: onResetOrder }, tr('workshop.resetOrder') || '恢复默认排序') : null,
    ),
    h('div', { className: 'featured-grid' },
      featuredItems.map((item) => renderFeaturedCard(item, { tr, onOpen: setOpen, onPin: onMoveToTop, onTry: safeTrySkillInSession })),
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

export function renderMineToolbar(opts) {
  const h = getH(opts);
  const { mineCategory, setMineCategory, mineSource, setMineSource, availableSources, autoUpdate, setAutoUpdate, tr } = opts;
  const catAll = tr('workshop.catAll') || '全部';
  const nextMineCat = () => { const o = ['', ...WORKSHOP_DOMAIN_ORDER]; setMineCategory(o[(o.indexOf(mineCategory) + 1) % o.length]); };
  const nextMineSrc = () => { const o = ['', ...availableSources]; setMineSource(o[(o.indexOf(mineSource) + 1) % o.length]); };
  return h('div', { className: 'mine-toolbar' },
    // exempt-ui01 mine category dropdown button
    h('button', { type: 'button', className: 'pill-dropdown', onClick: nextMineCat },
      h('span', null, (tr('workshop.catPrefix') || '分类 ') + (mineCategory || catAll)),
      h('span', { style: { fontSize: '10px' } }, '▾'),
    ),
    availableSources.length ?
      // exempt-ui01 mine source dropdown button
      h('button', { type: 'button', className: 'pill-dropdown', onClick: nextMineSrc },
        h('span', null, (tr('workshop.sourcePrefix') || '来源 ') + (mineSource || catAll)),
        h('span', { style: { fontSize: '10px' } }, '▾'),
      ) : null,
    h('div', { className: 'auto-update-wrap' },
      h('span', null, tr('workshop.autoUpdate') || '自动更新'),
      h(WorkshopSwitch, { checked: autoUpdate, onChange: setAutoUpdate }),
    ),
  );
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
