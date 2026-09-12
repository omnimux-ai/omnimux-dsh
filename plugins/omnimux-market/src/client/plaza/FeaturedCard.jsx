import React from 'react';
import {
  resolveIconSrc,
  resolveItemDesc,
  resolveItemTitle,
  safeTrySkillInSession,
} from './plazaUtils.js';

const h = React.createElement;

function renderFeaturedCoverSvg(item, isHidden) {
  const letters = (item.name || item.title || 'SK').slice(0, 4);
  return h('svg', {
    className: 'featured-cover-svg',
    viewBox: '0 0 320 180',
    width: '100%',
    height: '100%',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    style: isHidden ? { display: 'none' } : undefined,
  },
    h('rect', { width: '320', height: '180', fill: 'var(--dsw-alias-bg-layer-1, #1a1c24)' }),
    h('circle', { cx: '160', cy: '90', r: '36', fill: 'var(--dsw-alias-bg-layer-2, #272a38)' }),
    h('text', { x: '160', y: '96', textAnchor: 'middle', fill: 'var(--dsw-alias-brand-primary, #6f59ff)', fontSize: '16', fontWeight: '600' }, letters),
  );
}

function renderFeaturedCover(coverSrc, item, title, hoverNode) {
  const altText = item.cover?.alt || item.homeCover?.alt || title || 'Cover';
  const onCoverErr = (e) => {
    e.currentTarget.style.display = 'none';
    const n = e.currentTarget.nextElementSibling;
    if (n && n.classList && n.classList.contains('featured-cover-svg')) {
      n.style.display = 'block';
    }
  };
  return h('div', { className: 'featured-cover-wrap' },
    coverSrc ? h('img', {
      src: coverSrc, alt: altText, loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      onError: onCoverErr,
    }) : null,
    renderFeaturedCoverSvg(item, Boolean(coverSrc)),
    hoverNode,
  );
}

function renderFeaturedHoverActions(item, opts) {
  const { tr, onOpen, onTry } = opts;
  const onOpenClick = (e) => { e.stopPropagation(); onOpen && onOpen(item); };
  const onTryClick = (e) => { e.stopPropagation(); (onTry || safeTrySkillInSession)(item); };
  const detailTitle = tr ? (tr('workshop.detail') || '查看详情') : '查看详情';
  const tryTitle = tr ? (tr('workshop.try') || '去对话中试试') : '去对话中试试';

  return h('div', { className: 'featured-hover-actions' },
    // exempt-ui01 open detail hover button
    h('button', { type: 'button', className: 'hover-btn hover-btn-detail', onClick: onOpenClick }, detailTitle),
    // exempt-ui01 try in session hover button
    h('button', { type: 'button', className: 'hover-btn hover-btn-try', onClick: onTryClick }, tryTitle),
  );
}

export function renderFeaturedCard(item, opts, onOpenArg, onPinArg, onTryArg) {
  let safeOpts = {};
  if (typeof opts === 'function') {
    // 兼容历史调用签名 (item, tr, onOpen, onPin, onTry) 或 (item, tr, onOpen, onTry)
    const onTry = typeof onPinArg === 'function' && typeof onTryArg === 'function' ? onTryArg : onPinArg;
    safeOpts = { tr: opts, onOpen: onOpenArg, onTry };
  } else if (opts && typeof opts === 'object') {
    safeOpts = opts;
  }
  const { tr, onOpen } = safeOpts;
  const iconSrcFn = typeof safeOpts.iconSrc === 'function'
    ? safeOpts.iconSrc
    : (typeof iconSrc === 'function' ? iconSrc : resolveIconSrc);
  const coverAsset = item.homeCover?.asset || item.cover?.asset || (typeof item.cover === 'string' ? item.cover : '');
  const coverSrc = coverAsset ? iconSrcFn(coverAsset) : (item.coverUrl || item.avatarUrl || '');
  const title = resolveItemTitle(item, tr);
  const desc = resolveItemDesc(item, tr) || '暂无描述';

  const hoverNode = renderFeaturedHoverActions(item, safeOpts);
  const coverNode = renderFeaturedCover(coverSrc, item, title, hoverNode);

  return h('div', { key: item.slug || item.id, className: 'featured-card', onClick: () => onOpen && onOpen(item) },
    coverNode,
    h('div', { className: 'featured-content' },
      h('div', { className: 'featured-card-name', title }, title),
      h('div', { className: 'featured-card-desc' }, desc),
    ),
  );
}

export function FeaturedCard(props) {
  const { item, ...rest } = props;
  return renderFeaturedCard(item, rest);
}
