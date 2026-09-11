import React from 'react';
import {
  EXPERT_STATUS_CONFIG,
  getExpertButtonText,
  getExpertLocalizedNames,
  getExpertStatusText,
} from './plazaUtils.js';

const h = React.createElement;

function getIconSrc(avatar) {
  if (typeof iconSrc === 'function') return iconSrc(avatar);
  return avatar || '';
}

function getInitials(name) {
  if (typeof initials === 'function') return initials(name);
  return (name || '').slice(0, 2);
}

export function renderExpertCard(item, opts) {
  const { tr, isEn, expertMarketToggling, onToggle } = opts;
  const { title, desc } = getExpertLocalizedNames(item, isEn);
  const conf = EXPERT_STATUS_CONFIG[item.status] || EXPERT_STATUS_CONFIG.available;
  const statusText = getExpertStatusText(conf, tr, isEn);
  const btnText = getExpertButtonText(conf, tr, isEn);
  const isToggling = expertMarketToggling === item.id;

  const onAvatarErr = (e) => {
    e.currentTarget.style.display = 'none';
    const n = e.currentTarget.nextElementSibling;
    if (n) n.style.display = 'grid';
  };
  const onBtnClick = (e) => {
    e.stopPropagation();
    onToggle(item);
  };

  return h('div', { key: item.id, className: 'expert-card' },
    h('div', { className: 'expert-card-avatar-wrap' },
      h('img', { className: 'expert-card-avatar', src: getIconSrc(item.avatar), alt: title, loading: 'lazy', onError: onAvatarErr }),
      h('div', { className: 'expert-card-avatar-fallback', style: { display: 'none' } }, getInitials(title)),
    ),
    conf.btnKey ? h('div', { className: 'expert-card-action' },
      // exempt-ui01 expert pill action button
      h('button', { type: 'button', className: 'expert-pill-btn', disabled: isToggling, onClick: onBtnClick }, isToggling ? '...' : btnText),
    ) : null,
    h('div', { className: 'expert-card-status ' + (item.status || '') }, statusText),
    h('div', { className: 'expert-card-title' }, title),
    h('p', { className: 'expert-card-desc' }, desc),
  );
}

export function ExpertCard(props) {
  const { item, ...rest } = props;
  return renderExpertCard(item, rest);
}
