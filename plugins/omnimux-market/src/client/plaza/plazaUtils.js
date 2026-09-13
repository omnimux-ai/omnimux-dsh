import React from 'react';

export function isValidPositiveNumber(val) {
  if (typeof val !== 'number') return false;
  return Number.isFinite(val) && val > 0;
}

export function resolvePlazaIconSize(size) {
  if (isValidPositiveNumber(size)) return size;
  if (!size || typeof size !== 'object') return 16;
  if (isValidPositiveNumber(size.size)) return size.size;
  if (isValidPositiveNumber(size.width)) return size.width;
  return 16;
}

export function renderPlazaIcon(size = 16) {
  const h = React.createElement;
  const px = resolvePlazaIconSize(size);
  const iconStyle = { width: px, height: px, minWidth: px, minHeight: px, flex: 'none', flexShrink: 0, display: 'block' };
  return h('svg', { width: px, height: px, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet', style: iconStyle },
    h('rect', { x: '1.75', y: '1.75', width: '5.5', height: '5.5', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.4', fill: 'none' }),
    h('rect', { x: '8.75', y: '1.75', width: '5.5', height: '5.5', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.4', fill: 'none' }),
    h('rect', { x: '1.75', y: '8.75', width: '5.5', height: '5.5', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.4', fill: 'none' }),
    h('rect', { x: '8.75', y: '8.75', width: '5.5', height: '5.5', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.4', fill: 'none' }),
  );
}

export function PlazaIcon(props) {
  return renderPlazaIcon(props);
}

export function resolvePlazaPluginUrl(path) {
  const suffix = String(path || '').replace(/^\/+/, '');
  const sub = './omnimux-market' + (suffix ? '/' + suffix : '');
  try {
    const base = typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
    return new URL(sub, base).toString();
  } catch {
    return '/' + sub.replace(/^\.\//, '');
  }
}

export function resolveIconSrc(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  if (typeof globalThis !== 'undefined' && typeof globalThis.iconSrc === 'function') {
    try {
      const res = globalThis.iconSrc(url);
      if (res) return res;
    } catch {}
  }
  return resolvePlazaPluginUrl('icon?url=' + encodeURIComponent(url));
}

export function resolveInitials(name) {
  if (typeof initials === 'function') {
    try {
      const res = initials(name);
      if (res) return res;
    } catch {}
  }
  const t = String(name || '').replace(/[a-zA-Z0-9._-]/g, '');
  return (t.slice(0, 3) || String(name || 'SK').slice(0, 2)).toUpperCase();
}

export function getIsLocaleEn(tr) {
  if (typeof tr === 'function') {
    return Boolean(tr('locale') === 'en' || tr.locale === 'en');
  }
  if (tr && typeof tr === 'object') {
    return Boolean(tr.locale === 'en');
  }
  return false;
}

export function getItemPreferredTitle(item, isEn) {
  const enTitle = item.titleEn || item.nameEn;
  const zhTitle = item.titleZh || item.nameZh;
  return isEn ? enTitle : zhTitle;
}

export function resolveItemTitle(item, tr) {
  if (typeof skillTitle === 'function') return skillTitle(item, tr);
  if (typeof SkillShelf !== 'undefined' && typeof SkillShelf.skillTitle === 'function') {
    return SkillShelf.skillTitle(item, tr);
  }
  if (!item) return '';
  const isEn = getIsLocaleEn(tr);
  const preferred = getItemPreferredTitle(item, isEn);
  if (preferred) return preferred;
  const fallback = item.name || item.title;
  return fallback || item.slug || '';
}

export function getItemPreferredDesc(item, isEn) {
  const enDesc = item.descriptionEn || item.summaryEn;
  const zhDesc = item.descriptionZh || item.summaryZh;
  return isEn ? enDesc : zhDesc;
}

export function resolveItemDesc(item, tr) {
  if (typeof skillDesc === 'function') return skillDesc(item, tr);
  if (typeof SkillShelf !== 'undefined' && typeof SkillShelf.skillDesc === 'function') {
    return SkillShelf.skillDesc(item, tr);
  }
  if (!item) return '';
  const isEn = getIsLocaleEn(tr);
  const preferred = getItemPreferredDesc(item, isEn);
  if (preferred) return preferred;
  return item.description || item.summary || '';
}

export function WorkshopSwitch(props) {
  const h = React.createElement;
  const { checked, onChange, disabled } = props || {};
  const toggle = () => { if (!disabled && onChange) onChange(!checked); };
  const handleClick = (e) => { e.stopPropagation(); toggle(); };
  const handleKeyDown = (e) => {
    const isTrigger = e.key === 'Enter' || e.key === ' ';
    if (isTrigger) { e.preventDefault(); e.stopPropagation(); toggle(); }
  };
  return h('div', {
    className: 'toggle-wrap', role: 'switch', 'aria-checked': Boolean(checked), tabIndex: disabled ? -1 : 0,
    onClick: handleClick, onKeyDown: handleKeyDown,
  }, h('div', { className: 'switch-bg' + (checked ? ' on' : '') }, h('div', { className: 'switch-knob' })));
}

export const WORKSHOP_DOMAIN_ORDER = [
  '短剧漫剧',
  '专业影视',
  '动画',
  '商业广告',
  '电商',
  '教育',
  '创意实验',
  '音频音乐',
  '平台工具',
];

export const DEFAULT_MARKET_EXPERTS = [
  { id: 'shopee-ops-expert', name: 'Shopee运营专家', nameEn: 'Shopee Ops Expert', description: '负责市场、产品、店铺、品牌和关键词分析的Shopee运营专员。', descriptionEn: 'Shopee operation specialist for market, product, shop, brand and keyword analysis.', avatar: 'catalog/covers/expert-shopee-ops.png', status: 'enabled' },
  { id: 'youtube-creator-expert', name: 'YouTube创作者专家', nameEn: 'YouTube Creator Expert', description: '帮助商家利用Topview自有创作者池数据寻找和评估YouTube创作者。', descriptionEn: 'Help merchants find and evaluate YouTube creators using Topview self-owned creator pool data.', avatar: 'catalog/covers/expert-youtube-creator.png', status: 'enabled' },
  { id: 'amazon-ops-expert', name: '亚马逊运营专家', nameEn: 'Amazon Ops Expert', description: '亚马逊市场、产品、列表、关键词、评论和风险分析运营专家。', descriptionEn: 'Amazon operation specialist for market, product, listing, keyword, review and risk analysis.', avatar: 'catalog/covers/expert-amazon-ops.png', status: 'enabled' },
  { id: 'tiktok-shop-ops-expert', name: 'TikTok Shop运营专家', nameEn: 'TikTok Shop Ops Expert', description: '负责TikTok Shop趋势、产品、素材、内容、联盟、广告和直播运营的专家。', descriptionEn: 'TikTok Shop operation specialist for trends, products, materials, content, affiliates, ads and live ops.', avatar: 'catalog/covers/expert-tiktok-shop-ops.png', status: 'enabled' },
  { id: 'media-creator', name: '媒体创作者', nameEn: 'Media Creator', description: 'AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。', descriptionEn: 'AI content generation: videos, images, digital avatars, background removal, TTS, and voice cloning using Topview AI', avatar: 'catalog/covers/expert-media-creator.png', status: 'available' },
  { id: 'html-generator', name: 'HTML生成器', nameEn: 'HTML Generator', description: '根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示', descriptionEn: '根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示', avatar: 'catalog/covers/expert-html-generator.png', status: 'available' },
  { id: 'amazon-operations-expert', name: '亚马逊运营专家', nameEn: 'Amazon Operations Expert', description: '专注于亚马逊店铺运营、商品详情优化、广告投放和竞争对手分析，以提高转化率和销售额。', descriptionEn: 'Focused on Amazon store operations, listing optimization, advertising, and competitor analysis to improve conversion', avatar: 'catalog/covers/expert-amazon-operations.png', status: 'available' },
  { id: 'tiktok-ecommerce-expert', name: 'TikTok电商专家', nameEn: 'TikTok Ecommerce Expert', description: '擅长TikTok短视频销售、创作者合作和增长策略，帮助品牌在TikTok Shop上推出产品。', descriptionEn: 'Expert in TikTok short-video selling, creator partnerships, and growth strategies to help brands launch on TikTok Shop.', avatar: 'catalog/covers/expert-tiktok-ecommerce.png', status: 'available' },
];

export function safeTrySkillInSession(item) {
  if (typeof trySkillInSession === 'function') {
    trySkillInSession(item);
    return;
  }
  if (typeof SkillShelf !== 'undefined' && typeof SkillShelf.trySkillInSession === 'function') {
    SkillShelf.trySkillInSession(item);
    return;
  }
  if (typeof window !== 'undefined' && typeof window.trySkillInSession === 'function') {
    window.trySkillInSession(item);
  }
}

export const EXPERT_STATUS_CONFIG = {
  enabled: { statusKey: 'expertMarket.enabled', defaultZh: '已入职', defaultEn: 'Employed', btnKey: 'expertMarket.disable', defaultBtn: '解聘', defaultBtnEn: 'Dismiss' },
  available: { statusKey: 'expertMarket.available', defaultZh: '可聘用', defaultEn: 'Hireable', btnKey: 'expertMarket.install', defaultBtn: '招聘', defaultBtnEn: 'Hire' },
  disabled: { statusKey: 'expertMarket.disabled', defaultZh: '已离职', defaultEn: 'Resigned', btnKey: 'expertMarket.install', defaultBtn: '招聘', defaultBtnEn: 'Hire' },
  coming_soon: { statusKey: 'expertMarket.comingSoon', defaultZh: '即将推出', defaultEn: 'Coming soon', btnKey: '', defaultBtn: '', defaultBtnEn: '' },
};

export function getExpertButtonText(conf, tr, isEn) {
  if (!conf.btnKey) return '';
  const val = tr(conf.btnKey);
  if (val) return val;
  return isEn ? conf.defaultBtnEn : conf.defaultBtn;
}

export function getExpertLocalizedNames(item, isEn) {
  const title = isEn ? (item.nameEn || item.name) : item.name;
  const desc = isEn ? (item.descriptionEn || item.description) : item.description;
  return { title, desc };
}

export function getExpertStatusText(conf, tr, isEn) {
  const statusVal = tr(conf.statusKey);
  const fallback = isEn ? conf.defaultEn : conf.defaultZh;
  return '[ ' + (statusVal || fallback) + ' ]';
}

export function resolveIntroHeading(isExpertTab, isEn, tr) {
  if (isExpertTab) {
    const defaultEn = 'Experts Market';
    const defaultZh = '专家市场';
    return tr('expertMarket.title') || (isEn ? defaultEn : defaultZh);
  }
  return tr('workshop.title') || 'Skill';
}

export function resolveIntroSubtitle(isExpertTab, isEn, tr) {
  if (isExpertTab) {
    const defaultEn = 'Discover and install AI Agents to extend your workspace';
    const defaultZh = '发现并安装AI代理以扩展您的工作区';
    return tr('expertMarket.subtitle') || (isEn ? defaultEn : defaultZh);
  }
  return tr('workshop.subtitle');
}

export function resolvePlaceholderText(isExpertTab, isEn, mainTab, tr) {
  if (isExpertTab) {
    return tr('expertMarket.searchPlaceholder') || (isEn ? 'Search all experts...' : '搜索全部专家');
  }
  const key = mainTab === 'mine' ? 'workshop.searchMinePlaceholder' : 'workshop.searchPlaceholder';
  return tr(key);
}

export function resolveIntroTexts(state, tr, isEn, isExpertTab) {
  return {
    introHeading: resolveIntroHeading(isExpertTab, isEn, tr),
    introSubtitle: resolveIntroSubtitle(isExpertTab, isEn, tr),
    placeholderText: resolvePlaceholderText(isExpertTab, isEn, state.mainTab, tr),
  };
}

export function extractItemSourceKey(it) {
  const primary = it.source || it.origin;
  return primary || it.channel || 'OmniMux';
}

export function handleMoveToTop(targetId, featuredItems, state, apiFn) {
  const rest = featuredItems.map((it) => it.id).filter((id) => id !== targetId);
  const newOrder = [targetId, ...rest];
  state.setCustomOrder(newOrder);
  if (typeof SkillShelf !== 'undefined' && typeof SkillShelf.saveHomeCustomOrder === 'function') {
    SkillShelf.saveHomeCustomOrder(newOrder);
  }
  const runApi = apiFn || (typeof api === 'function' ? api : null);
  if (runApi) runApi('homeCustomOrder', { order: newOrder }).catch(() => {});
}

export function handleResetOrder(state, apiFn) {
  state.setCustomOrder(null);
  if (typeof SkillShelf !== 'undefined' && typeof SkillShelf.saveHomeCustomOrder === 'function') {
    SkillShelf.saveHomeCustomOrder(null);
  }
  const runApi = apiFn || (typeof api === 'function' ? api : null);
  if (runApi) runApi('homeCustomOrder', { order: [] }).catch(() => {});
}

export function setSingleExpertStatus(setItems, id, status) {
  setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status } : it)));
}

export async function executeToggleExpert(item, state, apiFn) {
  if (state.expertMarketToggling) return;
  const isEnabled = item.status === 'enabled';
  const action = isEnabled ? 'expertMarketDisable' : 'expertMarketInstall';
  const nextStatus = isEnabled ? 'disabled' : 'enabled';
  setSingleExpertStatus(state.setExpertMarketItems, item.id, nextStatus);
  state.setExpertMarketToggling(item.id);
  const runApi = apiFn || (typeof api === 'function' ? api : null);
  if (!runApi) {
    state.setExpertMarketToggling('');
    return;
  }
  try {
    const res = await runApi(action, { id: item.id });
    const finalStatus = res ? (res.status || nextStatus) : nextStatus;
    setSingleExpertStatus(state.setExpertMarketItems, item.id, finalStatus);
  } catch {
    setSingleExpertStatus(state.setExpertMarketItems, item.id, item.status);
  } finally {
    state.setExpertMarketToggling('');
  }
}

export function updatePlazaItemInstalled(item, installed, state, updater) {
  state.setItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id ? { ...it, installed } : it)));
  state.setInstalledItems((cur) => updater(cur, item, installed));
  state.setOpen((cur) => (cur && (cur.slug === item.slug || cur.id === item.id) ? { ...cur, installed } : cur));
}

export function handleSwitchToggle(item, state) {
  if (item.installed) {
    const next = item.enabled === false;
    state.setItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id ? { ...it, enabled: next } : it)));
    state.setInstalledItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id ? { ...it, enabled: next } : it)));
    return;
  }
  state.setConfirmInstallError('');
  state.setConfirmInstallItem(item);
}

export function resolveItemSlug(item) {
  const token = item.slug || item.token;
  return token || item.skillKey || '';
}

export async function handleConfirmInstall(item, state, mark, apiFn) {
  if (!item || state.confirmInstalling) return;
  const slug = resolveItemSlug(item);
  state.setConfirmInstalling(true);
  state.setConfirmInstallError('');
  const runApi = apiFn || (typeof api === 'function' ? api : null);
  if (!runApi) {
    state.setConfirmInstalling(false);
    return;
  }
  try {
    await runApi('install', { slug, catalogId: item.catalogId || item.id });
    mark(item, true);
    state.setConfirmInstallItem(null);
  } catch (err) {
    state.setConfirmInstallError(err ? (err.message || String(err)) : '安装失败');
  } finally {
    state.setConfirmInstalling(false);
  }
}
