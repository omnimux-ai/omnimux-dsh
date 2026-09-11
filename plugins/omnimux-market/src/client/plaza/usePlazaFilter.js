import { useEffect, useState } from 'react';
import * as LocalSkillShelf from '../skill-picker-logic.js';
import {
  DEFAULT_MARKET_EXPERTS,
  WORKSHOP_DOMAIN_ORDER,
} from './plazaUtils.js';

function getSkillShelf() {
  if (typeof SkillShelf !== 'undefined') return SkillShelf;
  return LocalSkillShelf;
}

export function updateInstalledItemsList(cur, item, installed) {
  if (!installed) return cur.filter((it) => it.slug !== item.slug && it.id !== item.id);
  const match = (it) => it.slug === item.slug || it.id === item.id;
  if (cur.some(match)) return cur.map((it) => (match(it) ? { ...it, installed: true } : it));
  return [{ ...item, installed: true, enabled: true }, ...cur];
}

export function matchesCategoryFilter(item, category, presetBinding) {
  const shelf = getSkillShelf();
  if (shelf && !presetBinding) {
    return shelf.matchesDomainTag(item, category);
  }
  const cat = String(item.category || item.categoryLabel || '').trim();
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
  return cat === category || tags.includes(category);
}

export function itemMatchesCategory(item, category, presetBinding) {
  if (!category) return true;
  if (category === 'featured') {
    const shelf = getSkillShelf();
    return Boolean(shelf && shelf.isRecommendedInstalledSkill(item));
  }
  return matchesCategoryFilter(item, category, presetBinding);
}

function getItemSource(item) {
  const origin = item.source || item.origin;
  const channel = origin || item.channel;
  return String(channel || 'OmniMux').toLowerCase();
}

export function itemMatchesMineMeta(item, mineCategory, mineSource) {
  const shelf = getSkillShelf();
  if (mineCategory && shelf) {
    if (!shelf.matchesDomainTag(item, mineCategory)) return false;
  }
  if (mineSource) {
    const itemSrc = getItemSource(item);
    if (itemSrc !== mineSource.toLowerCase()) return false;
  }
  return true;
}

export function matchesMineQuery(item, q) {
  const titlePart = item.name || item.title;
  const descPart = item.description || item.slug;
  const hay = [titlePart, descPart].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function filterMineItems(installedItems, opts) {
  const { category, presetBinding, mineCategory, mineSource, searchQuery } = opts;
  const q = (searchQuery || '').trim().toLowerCase();
  return installedItems.filter((item) => {
    const catOk = itemMatchesCategory(item, category, presetBinding);
    const metaOk = itemMatchesMineMeta(item, mineCategory, mineSource);
    const queryOk = !q || matchesMineQuery(item, q);
    return catOk && metaOk && queryOk;
  });
}

export function filterDisplayedExperts(items, isExpertTab, query) {
  const list = items && items.length ? items : DEFAULT_MARKET_EXPERTS;
  const q = (query || '').trim().toLowerCase();
  if (!isExpertTab || !q) return list;
  return list.filter((item) => {
    const namePart = item.name || item.nameEn;
    const descPart = item.description || item.descriptionEn;
    const hay = [namePart, descPart].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function mapDomainTaxonomy(id, tr) {
  const shelf = getSkillShelf();
  const taxonomy = shelf ? shelf.SKILL_SHELF_TAXONOMY : [];
  const row = taxonomy.find((r) => r.id === id);
  const label = row && tr ? tr(row.labelKey) : id;
  return { id, label };
}

function mapPresetCategory(c) {
  return { id: c.id, label: c.name };
}

export function buildWorkshopCategories(presetBinding, tr) {
  const allLabel = tr ? (tr('workshop.catAll') || '全部') : '全部';
  if (presetBinding) {
    const presetCategories = presetBinding.categories.map(mapPresetCategory);
    return [{ id: '', label: allLabel }, ...presetCategories];
  }
  const featLabel = tr ? (tr('workshop.catFeatured') || '精选') : '精选';
  const domainCategories = WORKSHOP_DOMAIN_ORDER.map((id) => mapDomainTaxonomy(id, tr));
  return [{ id: '', label: allLabel }, { id: 'featured', label: featLabel }, ...domainCategories];
}

function updateItemsWithRatings(cur, ratings) {
  return cur.map((it) => {
    const score = ratings[it.slug];
    return score != null ? { ...it, rating: score } : it;
  });
}

function applyRatingsUpdate(setItems, ratings) {
  setItems((cur) => updateItemsWithRatings(cur, ratings));
}

function handleRatingsResponse(r, liveRef, setItems) {
  if (!liveRef.live || !r?.ratings) return;
  applyRatingsUpdate(setItems, r.ratings);
}

function resolveApi(deps) {
  if (deps && typeof deps.api === 'function') return deps.api;
  if (typeof api === 'function') return api;
  return null;
}

export function attachPlazaRatings(slugs, setItems, liveRef, deps) {
  if (!slugs.length) return;
  const apiFn = resolveApi(deps);
  if (!apiFn) return;
  const onRatingsRes = (r) => handleRatingsResponse(r, liveRef, setItems);
  const ignoreErr = () => {};
  apiFn('ratings', { slugs }, { skipCache: true }).then(onRatingsRes).catch(ignoreErr);
}

export function handlePlazaSearchError(e, opts) {
  const { liveRef, page, hasFresh, state } = opts;
  if (!liveRef.live) return;
  if (page !== 1 || hasFresh) return;
  state.setItems([]);
  state.setTotal(0);
  state.setHasMore(false);
  state.setFallback(false);
  state.setStatus('error');
  state.setErr(e.message || String(e));
}

function matchesFilterCategory(it, filterCat) {
  if (!filterCat) return true;
  const shelf = getSkillShelf();
  return Boolean(shelf && shelf.matchesDomainTag(it, filterCat));
}

export function applyPlazaSearchData(d, mode, category, state) {
  const filterCat = category === 'featured' ? '' : category;
  const next = (d.items || []).filter((it) => matchesFilterCategory(it, filterCat));
  const isFallback = Boolean(d.fallback);
  state.setFallback(isFallback);
  const parsedTotal = Number(d.total) || 0;
  const nextTotal = isFallback ? next.length : Math.min(parsedTotal, next.length);
  if (mode === 'replace') state.setItems(next);
  else state.setItems((cur) => cur.concat(next));
  state.setTotal(nextTotal);
  state.setHasMore(isFallback ? false : Boolean(d.hasMore));
  state.setStatus('ready');
  state.setErr('');
  return next;
}

function performSearchQuery(payload, opts, deps) {
  const { liveRef, page, hasFresh, state, category } = opts;
  const apiFn = resolveApi(deps);
  if (!apiFn) return;
  const onSearchSuccess = (d) => {
    if (!liveRef.live) return;
    const mode = page === 1 ? 'replace' : 'append';
    const next = applyPlazaSearchData(d, mode, category, state);
    const slugs = next.map((it) => it.slug).filter(Boolean);
    attachPlazaRatings(slugs, state.setItems, liveRef, deps);
  };
  const onSearchFail = (e) => {
    handlePlazaSearchError(e, { liveRef, page, hasFresh, state });
  };
  apiFn('search', payload).then(onSearchSuccess).catch(onSearchFail);
}

function resolveCacheKeyFn(deps) {
  if (deps && typeof deps.apiCacheKey === 'function') return deps.apiCacheKey;
  if (typeof apiCacheKey === 'function') return apiCacheKey;
  return null;
}

function resolveCacheMap(deps) {
  if (deps && deps.apiCache) return deps.apiCache;
  if (typeof apiCache !== 'undefined') return apiCache;
  return null;
}

function resolveCacheTtl(deps) {
  if (deps && typeof deps.API_CACHE_TTL_MS === 'number') return deps.API_CACHE_TTL_MS;
  if (typeof API_CACHE_TTL_MS !== 'undefined') return API_CACHE_TTL_MS;
  return 60000;
}

function getCachedSearchEntry(payload, deps) {
  const keyFn = resolveCacheKeyFn(deps);
  const cacheKey = keyFn ? keyFn('search', payload) : '';
  const cache = resolveCacheMap(deps);
  const cached = cache && cacheKey ? cache.get(cacheKey) : null;
  const ttl = resolveCacheTtl(deps);
  const hasFresh = Boolean(cached && (Date.now() - cached.at < ttl));
  return { cached, hasFresh };
}

export function usePlazaSearchEffect(state, deps) {
  const { category, submitted, page } = state;
  const pageSize = 80;
  const effectFn = deps && typeof deps.useEffect === 'function' ? deps.useEffect : useEffect;

  effectFn(() => {
    const liveRef = { live: true };
    const queryCat = category === 'featured' ? '' : category;
    const shelf = getSkillShelf();
    const payload = shelf
      ? shelf.buildPlazaSearchPayload(submitted, queryCat, page, pageSize)
      : { query: submitted, page, limit: pageSize };
    const { cached, hasFresh } = getCachedSearchEntry(payload, deps);

    if (page === 1 && hasFresh) {
      applyPlazaSearchData(cached.body, 'replace', category, state);
    } else if (page === 1) {
      state.setStatus('loading');
    }

    performSearchQuery(payload, { liveRef, page, hasFresh, state, category }, deps);
    return () => { liveRef.live = false; };
  }, [submitted, category, page, state]);
}

function getCustomOrderDefault() {
  const shelf = getSkillShelf();
  if (shelf && typeof shelf.getHomeCustomOrder === 'function') {
    return shelf.getHomeCustomOrder();
  }
  return null;
}

export function usePlazaState(initialSubmitted, hooks) {
  const stateFn = hooks && typeof hooks.useState === 'function' ? hooks.useState : useState;
  const [mainTab, setMainTab] = stateFn('discover');
  const [category, setCategory] = stateFn('');
  const [page, setPage] = stateFn(1);
  const [searchQuery, setSearchQuery] = stateFn('');
  const [submitted, setSubmitted] = stateFn(initialSubmitted);
  const [uninstalledOnly, setUninstalledOnly] = stateFn(false);
  const [autoUpdate, setAutoUpdate] = stateFn(false);
  const [mineCategory, setMineCategory] = stateFn('');
  const [mineSource, setMineSource] = stateFn('');
  const [items, setItems] = stateFn([]);
  const [installedItems, setInstalledItems] = stateFn([]);
  const [total, setTotal] = stateFn(0);
  const [hasMore, setHasMore] = stateFn(false);
  const [fallback, setFallback] = stateFn(false);
  const [status, setStatus] = stateFn('loading');
  const [err, setErr] = stateFn('');
  const [open, setOpen] = stateFn(null);
  const [openInstallModal, setOpenInstallModal] = stateFn(false);
  const [confirmInstallItem, setConfirmInstallItem] = stateFn(null);
  const [confirmInstallError, setConfirmInstallError] = stateFn('');
  const [confirmInstalling, setConfirmInstalling] = stateFn(false);
  const [customOrder, setCustomOrder] = stateFn(getCustomOrderDefault);
  const [expertMarketItems, setExpertMarketItems] = stateFn(DEFAULT_MARKET_EXPERTS);
  const [expertMarketToggling, setExpertMarketToggling] = stateFn('');
  return {
    mainTab, setMainTab, category, setCategory, page, setPage, searchQuery, setSearchQuery,
    submitted, setSubmitted, uninstalledOnly, setUninstalledOnly, autoUpdate, setAutoUpdate,
    mineCategory, setMineCategory, mineSource, setMineSource, items, setItems,
    installedItems, setInstalledItems, total, setTotal, hasMore, setHasMore,
    fallback, setFallback, status, setStatus, err, setErr, open, setOpen,
    openInstallModal, setOpenInstallModal, confirmInstallItem, setConfirmInstallItem,
    confirmInstallError, setConfirmInstallError, confirmInstalling, setConfirmInstalling,
    customOrder, setCustomOrder, expertMarketItems, setExpertMarketItems,
    expertMarketToggling, setExpertMarketToggling,
  };
}

export function usePlazaFilter(props) {
  const initialSubmitted = (props && props.submittedQuery) ?? '';
  const state = usePlazaState(initialSubmitted);
  usePlazaSearchEffect(state);
  return state;
}
