import React from 'react';
import {
  resolveItemDesc,
  resolveItemTitle,
  safeTrySkillInSession,
} from './plazaUtils.js';

const h = React.createElement;

function getIconSrc(asset) {
  if (typeof iconSrc === 'function') return iconSrc(asset);
  return asset || '';
}

function renderFeaturedCoverSvg(item) {
  const letters = (item.name || item.title || 'SK').slice(0, 4);
  return h('svg', {
    viewBox: '0 0 320 180',
    width: '100%',
    height: '100%',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  },
    h('rect', { width: '320', height: '180', fill: 'var(--dsw-alias-bg-layer-1, #1a1c24)' }),
    h('circle', { cx: '160', cy: '90', r: '36', fill: 'var(--dsw-alias-bg-layer-2, #272a38)' }),
    h('text', { x: '160', y: '96', textAnchor: 'middle', fill: 'var(--dsw-alias-brand-primary, #6f59ff)', fontSize: '16', fontWeight: '600' }, letters),
  );
}

function renderFeaturedCover(coverSrc, item, title, hoverNode) {
  const altText = item.cover?.alt || title || 'Cover';
  const onCoverErr = (e) => {
    e.currentTarget.style.display = 'none';
    const n = e.currentTarget.nextElementSibling;
    if (n) n.style.display = 'block';
  };
  return h('div', { className: 'featured-cover-wrap' },
    coverSrc ? h('img', {
      src: coverSrc, alt: altText, loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      onError: onCoverErr,
    }) : null,
    coverSrc ? null : renderFeaturedCoverSvg(item),
    hoverNode,
  );
}

function renderFeaturedHoverActions(item, opts) {
  const { tr, onPin, onOpen, onTry } = opts;
  const onPinClick = (e) => { e.stopPropagation(); onPin(item.id); };
  const onOpenClick = (e) => { e.stopPropagation(); onOpen(item); };
  const onTryClick = (e) => { e.stopPropagation(); (onTry || safeTrySkillInSession)(item); };
  const pinTitle = tr ? (tr('workshop.pinToTop') || '置顶') : '置顶';
  const detailTitle = tr ? (tr('workshop.detail') || '查看详情') : '查看详情';
  const tryTitle = tr ? (tr('workshop.try') || '去对话中试试') : '去对话中试试';

  return h('div', { className: 'featured-hover-actions' },
    // exempt-ui01 pin to top hover button
    h('button', { type: 'button', className: 'hover-btn hover-btn-pin', title: pinTitle, onClick: onPinClick }, pinTitle),
    // exempt-ui01 open detail hover button
    h('button', { type: 'button', className: 'hover-btn hover-btn-detail', onClick: onOpenClick }, detailTitle),
    // exempt-ui01 try in session hover button
    h('button', { type: 'button', className: 'hover-btn hover-btn-try', onClick: onTryClick }, tryTitle),
  );
}

export function renderFeaturedCard(item, opts) {
  const safeOpts = opts && typeof opts === 'object' ? opts : {};
  const { tr, onOpen } = safeOpts;
  const coverAsset = item.cover?.asset;
  const coverSrc = coverAsset ? getIconSrc(coverAsset) : (item.coverUrl || '');
  const title = resolveItemTitle(item, tr);
  const desc = resolveItemDesc(item, tr) || '暂无描述';

  const hoverNode = renderFeaturedHoverActions(item, safeOpts);
  const coverNode = renderFeaturedCover(coverSrc, item, title, hoverNode);

  return h('div', { key: item.slug || item.id, className: 'featured-card', onClick: () => onOpen(item) },
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
