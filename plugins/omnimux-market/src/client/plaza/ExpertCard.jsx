import React from 'react';
import {
  EXPERT_STATUS_CONFIG,
  getExpertButtonText,
  getExpertLocalizedNames,
  getExpertStatusText,
  resolveExpertAvatarSrc,
  resolveExpertPixelAvatar,
  resolveInitials,
} from './plazaUtils.js';

const h = React.createElement;

function getIconSrc(item) {
  return resolveExpertAvatarSrc(item);
}

function getInitials(name) {
  return resolveInitials(name);
}

/**
 * 头像兜底：图片加载失败先换成同种子像素头像，像素头像也失败才退回文字首字。
 * 用 dataset 标记保证每个 img 只降级一次，不会陷入无限 onError 循环。
 *
 * @param {string} pixelAvatar 该条目的确定性像素头像 data URL
 * @returns {(e: Event) => void} img onError 处理器
 */
function createAvatarErrorHandler(pixelAvatar) {
  return (e) => {
    const img = e.currentTarget;
    if (img.dataset.pixelFallback !== '1') {
      img.dataset.pixelFallback = '1';
      img.src = pixelAvatar;
      return;
    }
    img.style.display = 'none';
    const fallbackNode = img.nextElementSibling;
    if (fallbackNode) fallbackNode.style.display = 'grid';
  };
}

export function renderExpertCard(item, opts) {
  const { tr, isEn, expertMarketToggling, onToggle } = opts;
  const { title, desc } = getExpertLocalizedNames(item, isEn);
  const conf = EXPERT_STATUS_CONFIG[item.status] || EXPERT_STATUS_CONFIG.available;
  const statusText = getExpertStatusText(conf, tr, isEn);
  const btnText = getExpertButtonText(conf, tr, isEn);
  const isToggling = expertMarketToggling === item.id;

  // 未配置 avatar 的专家（内置预设、自建预设）自动使用像素头像。
  const pixelAvatar = resolveExpertPixelAvatar(item);
  const avatarSrc = getIconSrc(item);
  const onAvatarErr = createAvatarErrorHandler(pixelAvatar);
  const onBtnClick = (e) => {
    e.stopPropagation();
    onToggle(item);
  };

  return h('div', { key: item.id, className: 'expert-card' },
    h('div', { className: 'expert-card-avatar-wrap' },
      h('img', { className: 'expert-card-avatar', src: avatarSrc, alt: title, loading: 'lazy', onError: onAvatarErr }),
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
