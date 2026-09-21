import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import featuredSkillsData from './skills/featured-skills.json';

// 纯矢量 SVG 图标，严格遵从 design.md UI04 硬门禁，零 Emoji 零字符替代
function ZapIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function PlayIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ImageIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function SearchIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ArrowUpIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function UserIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BoxIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ClockIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// 真实采集数据源
const SUBPROMPTS_DATA = {
  'video-ads': [
    {
      labelZh: "使用 AI 数字人为您的网站制作视频广告:",
      labelEn: "Create a video ad with an AI avatar for your website:",
      promptZh: "使用 AI 数字人为我的网站制作视频广告：",
      promptEn: "Create a video ad with an AI avatar for ",
      prompt: "Create a video ad with an AI avatar for "
    },
    {
      labelZh: "为您的网站制作 TikTok 竖屏视频广告:",
      labelEn: "Create a TikTok video ad for your website:",
      promptZh: "为我的网站制作 TikTok 竖屏视频广告：",
      promptEn: "Create a vertical TikTok video ad for ",
      prompt: "Create a vertical TikTok video ad for "
    },
    {
      labelZh: "为您的网站制作 UGC 风格的好物推荐视频:",
      labelEn: "Create a UGC-style testimonial video for your website:",
      promptZh: "使用 AI 数字人为我的网站制作 UGC 风格的好物推荐视频：",
      promptEn: "Create a UGC-style testimonial video with an AI avatar for ",
      prompt: "Create a UGC-style testimonial video with an AI avatar for "
    },
    {
      labelZh: "为您的网站制作 Facebook / Instagram 视频广告:",
      labelEn: "Create a Facebook / Instagram video ad for your website:",
      promptZh: "为我的网站制作 Facebook / Instagram 视频广告：",
      promptEn: "Create a video ad for Facebook and Instagram for ",
      prompt: "Create a video ad for Facebook and Instagram for "
    },
    {
      labelZh: "为您的网站制作 30 秒产品演示视频:",
      labelEn: "Create a 30-second product demo for your website:",
      promptZh: "为我的网站制作 30 秒产品演示视频：",
      promptEn: "Create a 30-second product demo video ad for ",
      prompt: "Create a 30-second product demo video ad for "
    },
    {
      labelZh: "为您的独立站制作 Shopify 产品视频:",
      labelEn: "Create a Shopify product video for your store:",
      promptZh: "为我的独立站制作 Shopify 产品视频广告：",
      promptEn: "Create a product video ad for my Shopify store: ",
      prompt: "Create a product video ad for my Shopify store: "
    },
    {
      labelZh: "为您的商品制作 Amazon 视频广告:",
      labelEn: "Create an Amazon product video for your listing:",
      promptZh: "为我的商品制作 Amazon 视频广告：",
      promptEn: "Create a product showcase video for my Amazon listing: ",
      prompt: "Create a product showcase video for my Amazon listing: "
    }
  ],
  'image-ads': [
    {
      labelZh: "为您的网站制作产品主图海报:",
      labelEn: "Create a product hero shot for your website:",
      promptZh: "为我的网站制作产品主图海报：",
      promptEn: "Create a product hero shot image ad for ",
      prompt: "Create a product hero shot image ad for "
    },
    {
      labelZh: "为您的网站制作 Instagram 轮播广告组:",
      labelEn: "Create an Instagram carousel ad set for your website:",
      promptZh: "为我的网站制作 Instagram 轮播广告组：",
      promptEn: "Create an Instagram carousel ad set for ",
      prompt: "Create an Instagram carousel ad set for "
    },
    {
      labelZh: "为您的网站制作生活场景氛围图:",
      labelEn: "Create a lifestyle scene image for your website:",
      promptZh: "为我的网站制作生活场景氛围图：",
      promptEn: "Create a lifestyle image ad for ",
      prompt: "Create a lifestyle image ad for "
    },
    {
      labelZh: "为您的网站制作 Facebook 横幅广告:",
      labelEn: "Create Facebook banner ads for your website:",
      promptZh: "为我的网站制作 Facebook 横幅广告：",
      promptEn: "Create Facebook banner ads in multiple sizes for ",
      prompt: "Create Facebook banner ads in multiple sizes for "
    },
    {
      labelZh: "为您的 Shopify 店铺制作商品图片:",
      labelEn: "Create product images for your Shopify store:",
      promptZh: "为我的 Shopify 店铺制作商品图片与横幅广告：",
      promptEn: "Create product images and banner ads for my Shopify store: ",
      prompt: "Create product images and banner ads for my Shopify store: "
    },
    {
      labelZh: "为您的产品制作 Amazon 详情页主图:",
      labelEn: "Create Amazon listing images for your product:",
      promptZh: "为我的产品制作 Amazon 详情页主图：",
      promptEn: "Create product listing images for my Amazon product: ",
      prompt: "Create product listing images for my Amazon product: "
    }
  ],
  'competitor': [
    {
      labelZh: "查看竞争对手正在投放哪些广告...",
      labelEn: "Show me what ads my competitors are running...",
      promptZh: "查看竞争对手正在投放哪些广告：",
      promptEn: "Show me what ads my competitors are running for ",
      prompt: "Show me what ads my competitors are running for "
    },
    {
      labelZh: "我所在行业的当前广告创意趋势是什么？",
      labelEn: "What ad trends are working in my industry?",
      promptZh: "我所在行业的当前广告创意趋势是什么：",
      promptEn: "What ad creative trends are working right now in my industry: ",
      prompt: "What ad creative trends are working right now in my industry: "
    },
    {
      labelZh: "查找竞争对手表现最佳的 Facebook 广告:",
      labelEn: "Find top performing Facebook ads for a competitor:",
      promptZh: "查找竞争对手表现最佳的 Facebook 广告：",
      promptEn: "Find top performing Facebook ads for ",
      prompt: "Find top performing Facebook ads for "
    },
    {
      labelZh: "查找竞争对手表现最佳的 TikTok 爆款广告:",
      labelEn: "Find top performing TikTok ads for a competitor:",
      promptZh: "查找竞争对手表现最佳的 TikTok 爆款广告：",
      promptEn: "Find top performing TikTok ads for ",
      prompt: "Find top performing TikTok ads for "
    },
    {
      labelZh: "将我的广告与竞争对手进行对比分析:",
      labelEn: "Compare my ads against a competitor:",
      promptZh: "将我的广告与竞争对手进行对比分析，告诉我如何胜出：",
      promptEn: "Compare my ads against this competitor and tell me how to win: ",
      prompt: "Compare my ads against this competitor and tell me how to win: "
    }
  ]
};

const FEATURED_SKILLS = [
  {
    id: "ugc-confessional",
    titleZh: "UGC 忏悔室",
    titleEn: "UGC Confessional",
    descZh: "用于制作UGC（用户生成内容）风格的视频广告——竖屏9:16，创作者对镜头，自拍视角，快速剪辑，真实的iPhone质感，烧录字幕。",
    descEn: "Use when producing a UGC style video ad — vertical 9:16, creator-to-camera, selfie POV, fast cuts, authentic iPhone texture, burned-in captions.",
    bestFor: ["TikTok UGC", "Instagram Reels ads", "selfie testimonial", "POV creator ads"],
    style: ["vertical 9:16", "creator-to-camera", "fast cuts", "iPhone texture"],
    slash: "/ugc-confessional",
    iconType: "user",
    isRecent: true,
  },
  {
    id: "ugc-fit-check",
    titleZh: "UGC 穿搭检查",
    titleEn: "UGC Fit Check",
    descZh: "用于创建UGC试穿/购物分享/“穿搭检查”视频广告——单次拍摄的四段式Seedance片段，遵循经典的“穿前→穿着中→材质特写→造型展示”弧线。",
    descEn: "Use when creating UGC try-on / haul / 'fit check' video ads — single-take 4-cut Seedance clips with the canonical PRE_WEAR → WEARING → TEXTURE → STYLE arc.",
    bestFor: ["UGC try-on ads", "fit check videos", "OOTD reveals", "fashion hauls"],
    style: ["single-take 4-cut", "texture closeups", "vertical video"],
    slash: "/ugc-fit-check",
    iconType: "user",
  },
  {
    id: "ugc-unwrap",
    titleZh: "UGC开箱",
    titleEn: "UGC Unwrap",
    descZh: "用于创建UGC开箱视频广告——单次拍摄的四段式Seedance片段，遵循经典的“包装→揭示→产品聚焦→满意”弧线。",
    descEn: "Use when creating UGC unboxing video ads — single-take 4-cut Seedance clips with the canonical PACKED → REVEAL → FOCUS → SATISFACTION arc.",
    bestFor: ["UGC unboxing ads", "package reveals", "product unwrapping"],
    style: ["first-person POV", "close-up unpack", "satisfying reveal"],
    slash: "/ugc-unwrap",
    iconType: "user",
  },
  {
    id: "ugc-showcase",
    titleZh: "UGC 展示",
    titleEn: "UGC Showcase",
    descZh: "用于制作产品英雄UGC视频广告——单次拍摄的四段式Seedance短片，其中产品是每个片段的焦点（介绍→演示A→演示B→效果）。",
    descEn: "Use when creating product-hero UGC video ads — single-take 4-cut Seedance clips where the PRODUCT is the focal subject of every cut.",
    bestFor: ["product hero demo", "how it works", "hardware reviews"],
    style: ["product-centric", "voiceover narration", "feature highlight"],
    slash: "/ugc-showcase",
    iconType: "box",
  },
  {
    id: "ugc-walkthrough",
    titleZh: "UGC 演练",
    titleEn: "UGC Walkthrough",
    descZh: "用于创建UGC教程/操作指南/步骤拆解视频广告——单次拍摄的四段式片段，每个镜头展示使用产品的一个时间步骤。",
    descEn: "Use when creating UGC tutorial / how-to / step-by-step video ads — single-take 4-cut clips where each cut is ONE chronological step of using the product.",
    bestFor: ["tutorial ads", "routine breakdown", "step-by-step"],
    style: ["numbered steps", "instructional", "clear demo"],
    slash: "/ugc-walkthrough",
    iconType: "user",
  }
];

// 技能列表数据源：来自技能市场真实精选技能（65+ 项全量数据）
const MARKET_SKILLS = Array.isArray(featuredSkillsData?.skills) && featuredSkillsData.skills.length > 0
  ? featuredSkillsData.skills.map((item, idx) => ({
      id: item.id || item.skill,
      titleZh: item.titleZh || item.title || item.skill,
      titleEn: item.titleEn || item.title || item.skill,
      descZh: item.summaryZh || item.summary || '',
      descEn: item.summaryEn || item.summary || '',
      slash: item.skill ? `/${item.skill}` : `/${item.id}`,
      iconType: item.category === 'sk-visual' ? 'box' : 'user',
      isRecent: idx === 0,
      bestFor: item.tags || [],
      style: item.tags || [],
    }))
  : FEATURED_SKILLS;

/**
 * 校验是否为合法语言代码（如 'zh'、'en'、'zh-CN'、'en-US'）
 * 匹配正则 /^[a-zA-Z]{2}(-[a-zA-Z0-9]+)?$/
 * 严格过滤非字符串、空串、未知标识或未命中的翻译 key（如 'locale'、'guide.locale'）
 */
export function isValidLanguageCode(code) {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (!trimmed) return false;
  return /^[a-zA-Z]{2}(-[a-zA-Z0-9]+)?$/.test(trimmed);
}

/**
 * 统一语言判定纯函数：
 * 优先级：
 * a. t('locale') 或 t('guide.locale')（若返回有效合法的 'zh' 或 'en' 等字符串）；
 * b. typeof document !== 'undefined' && document?.documentElement?.lang（若合法有效）；
 * c. 显式传入且合法的 locale prop；
 * d. 兜底回退为 'zh'。
 */
export function resolveLocale(locale, t) {
  // a. t('locale') 或 t('guide.locale')
  if (typeof t === 'function') {
    try {
      const tLocale = t('locale');
      if (isValidLanguageCode(tLocale) && tLocale.trim() !== 'locale') {
        return tLocale.trim();
      }
      const tGuideLocale = t('guide.locale');
      if (isValidLanguageCode(tGuideLocale) && tGuideLocale.trim() !== 'guide.locale') {
        return tGuideLocale.trim();
      }
    } catch {}
  }

  // b. typeof document !== 'undefined' && document?.documentElement?.lang
  if (typeof document !== 'undefined' && document?.documentElement?.lang) {
    const docLang = String(document.documentElement.lang).trim();
    if (isValidLanguageCode(docLang)) {
      return docLang;
    }
  }

  // c. 显式传入且合法的 locale prop
  if (isValidLanguageCode(locale)) {
    return locale.trim();
  }

  // d. 兜底回退为 'zh'
  return 'zh';
}

export function CreatifyPillsBar({ onApplyPrompt, t, locale }) {
  const [activeMenu, setActiveMenu] = useState(null); // null | 'skills' | 'video-ads' | 'image-ads' | 'competitor'
  const [hoverSkill, setHoverSkill] = useState(MARKET_SKILLS[0]);
  const [searchKey, setSearchKey] = useState('');
  const containerRef = useRef(null);

  const [currentLocale, setCurrentLocale] = useState(() => resolveLocale(locale, t));

  // 合并与统一多语言监听与同步生命周期：严格保持「只读宿主环境」的单向数据流，绝不修改全局 DOM
  useEffect(() => {
    const syncLocale = (candidateLocale) => {
      if (isValidLanguageCode(candidateLocale)) {
        setCurrentLocale((prev) => (prev === candidateLocale ? prev : candidateLocale));
        return;
      }
      const nextLocale = resolveLocale(locale, t);
      setCurrentLocale((prev) => (prev === nextLocale ? prev : nextLocale));
    };

    // 基于当前 [locale, t] 计算并同步更新当前语言
    syncLocale();

    let observer = null;
    const ObserverClass = (typeof document !== 'undefined' && document?.defaultView?.MutationObserver)
      || (typeof window !== 'undefined' && window?.MutationObserver)
      || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);

    if (ObserverClass && typeof document !== 'undefined' && document?.documentElement) {
      observer = new ObserverClass(() => {
        syncLocale();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['lang'],
      });
    }

    const handleCustomLocaleEvent = (event) => {
      const rawEventLocale = event?.detail?.locale || event?.detail || (typeof event?.data === 'string' ? event.data : null);
      const eventLocale = typeof rawEventLocale === 'string' ? rawEventLocale.trim() : null;
      if (isValidLanguageCode(eventLocale)) {
        syncLocale(eventLocale);
      } else {
        syncLocale();
      }
    };

    const targetWindow = typeof window !== 'undefined'
      ? window
      : (typeof document !== 'undefined' ? document?.defaultView : null);

    if (targetWindow && typeof targetWindow.addEventListener === 'function') {
      targetWindow.addEventListener('languagechange', handleCustomLocaleEvent);
      targetWindow.addEventListener('omnimux:locale-change', handleCustomLocaleEvent);
      targetWindow.addEventListener('localechange', handleCustomLocaleEvent);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (targetWindow && typeof targetWindow.removeEventListener === 'function') {
        targetWindow.removeEventListener('languagechange', handleCustomLocaleEvent);
        targetWindow.removeEventListener('omnimux:locale-change', handleCustomLocaleEvent);
        targetWindow.removeEventListener('localechange', handleCustomLocaleEvent);
      }
    };
  }, [locale, t]);

  const isZh = currentLocale ? String(currentLocale).toLowerCase().startsWith('zh') : true;

  const toggleMenu = useCallback((menuId) => {
    setActiveMenu((prev) => (prev === menuId ? null : menuId));
  }, []);

  const handleClose = useCallback(() => {
    setActiveMenu(null);
  }, []);

  // 点击外部收起
  useEffect(() => {
    function handleDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  const handleSelectPrompt = useCallback((item) => {
    handleClose();
    const promptText = typeof item === 'string'
      ? item
      : (isZh ? (item?.promptZh || item?.prompt || '') : (item?.promptEn || item?.prompt || ''));

    if (onApplyPrompt) {
      onApplyPrompt(promptText);
    } else {
      try {
        const editor = document.querySelector('[data-chip-editor], [contenteditable="true"], .dsh-composer-input');
        if (editor) {
          editor.focus();
          editor.innerText = promptText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch {}
    }
  }, [handleClose, onApplyPrompt, isZh]);

  const handleSelectSkill = useCallback((skill) => {
    handleClose();
    try {
      const editor = document.querySelector('[data-chip-editor], [contenteditable="true"], .dsh-composer-input');
      if (editor) {
        editor.focus();
        const chip = document.createElement('span');
        chip.className = 'omnimux-skill-chip';
        chip.contentEditable = 'false';
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-hover);border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);margin:0 4px 0 1px;user-select:all;vertical-align:baseline;';
        chip.innerHTML = `<span style="pointer-events:none;">${skill.slash}</span><span style="cursor:pointer;margin-left:4px;opacity:0.65;" onclick="this.parentElement.remove();">&times;</span>`;

        const space = document.createTextNode(' ');
        editor.prepend(space);
        editor.prepend(chip);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch {}
  }, [handleClose]);

  const filteredSkills = useMemo(() => {
    const list = MARKET_SKILLS;
    if (!searchKey) return list;
    const q = searchKey.toLowerCase().trim();
    return list.filter(s =>
      s.titleZh.toLowerCase().includes(q) ||
      s.titleEn.toLowerCase().includes(q) ||
      s.descZh.toLowerCase().includes(q) ||
      s.descEn.toLowerCase().includes(q) ||
      s.slash.toLowerCase().includes(q)
    );
  }, [searchKey]);

  return (
    <div
      ref={containerRef}
      className="omnimux-creatify-pills-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        margin: activeMenu ? '4px auto 16px' : '6px auto 16px',
        position: 'relative',
        zIndex: 120,
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 'var(--dsh-composer-card-max-width, 952px)',
      }}
    >
      {/* 4 个 1:1 大胶囊按钮：激活面板时隐退，将空间直接让位给依附于输入框下方的面板 */}
      <button /* exempt-ui01: 4大胶囊按钮之Skills */
        type="button"
        className={`omnimux-pill-btn ${activeMenu === 'skills' ? 'active' : ''}`}
        onClick={() => toggleMenu('skills')}
        style={{
          display: activeMenu ? 'none' : 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          height: '38px',
          padding: '0 18px',
          borderRadius: '9999px',
          background: activeMenu === 'skills' ? 'var(--dsw-alias-interactive-bg-active)' : 'var(--dsw-alias-bg-layer-1)',
          border: '1px solid var(--dsw-alias-border)',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
      >
        <ZapIcon size={15} />
        <span>{isZh ? '技能' : 'Skills'}</span>
      </button>

      <button /* exempt-ui01: 4大胶囊按钮之Video ads */
        type="button"
        className={`omnimux-pill-btn ${activeMenu === 'video-ads' ? 'active' : ''}`}
        onClick={() => toggleMenu('video-ads')}
        style={{
          display: activeMenu ? 'none' : 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          height: '38px',
          padding: '0 18px',
          borderRadius: '9999px',
          background: activeMenu === 'video-ads' ? 'var(--dsw-alias-interactive-bg-active)' : 'var(--dsw-alias-bg-layer-1)',
          border: '1px solid var(--dsw-alias-border)',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
      >
        <PlayIcon size={15} />
        <span>{isZh ? '视频广告' : 'Video ads'}</span>
      </button>

      <button /* exempt-ui01: 4大胶囊按钮之Image ads */
        type="button"
        className={`omnimux-pill-btn ${activeMenu === 'image-ads' ? 'active' : ''}`}
        onClick={() => toggleMenu('image-ads')}
        style={{
          display: activeMenu ? 'none' : 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          height: '38px',
          padding: '0 18px',
          borderRadius: '9999px',
          background: activeMenu === 'image-ads' ? 'var(--dsw-alias-interactive-bg-active)' : 'var(--dsw-alias-bg-layer-1)',
          border: '1px solid var(--dsw-alias-border)',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
      >
        <ImageIcon size={15} />
        <span>{isZh ? '图片广告' : 'Image ads'}</span>
      </button>

      <button /* exempt-ui01: 4大胶囊按钮之Competitor */
        type="button"
        className={`omnimux-pill-btn ${activeMenu === 'competitor' ? 'active' : ''}`}
        onClick={() => toggleMenu('competitor')}
        style={{
          display: activeMenu ? 'none' : 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          height: '38px',
          padding: '0 18px',
          borderRadius: '9999px',
          background: activeMenu === 'competitor' ? 'var(--dsw-alias-interactive-bg-active)' : 'var(--dsw-alias-bg-layer-1)',
          border: '1px solid var(--dsw-alias-border)',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
      >
        <SearchIcon size={15} />
        <span>{isZh ? '竞争对手研究' : 'Competitor research'}</span>
      </button>

      {/* Skills 专属列表面板：直接依附在输入框正下方 */}
      {activeMenu === 'skills' && (
        <div
          className="omnimux-skills-popover"
          style={{
            position: 'relative',
            left: '0',
            right: '0',
            width: '100%',
            maxWidth: '100%',
            background: 'var(--dsw-alias-bg-elevated)',
            border: '1px solid var(--dsw-alias-border)',
            borderRadius: '16px',
            boxShadow: '0 20px 48px var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.65))', /* exempt-ui03: 弹窗投影 */
            zIndex: 130,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px 6px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border)', borderRadius: '8px', height: '34px', padding: '0 10px' }}>
              <SearchIcon size={14} />
              <input
                type="text"
                placeholder={isZh ? "搜索技能..." : "Search skills"}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--dsw-alias-label-primary)', fontSize: '13px' }}
              />
            </div>
            <button /* exempt-ui01: 浏览全部按钮 */
              type="button"
              style={{
                height: '34px',
                padding: '0 16px',
                borderRadius: '8px',
                background: 'var(--dsw-alias-interactive-bg-subtle, rgba(97, 97, 255, 0.16))',
                border: 'none',
                color: 'var(--dsw-alias-accent, rgb(165, 160, 255))',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isZh ? "浏览全部" : "Browse all"}
            </button>
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px 6px 8px' }}>
            {filteredSkills.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px' }}>
                {isZh ? "暂无匹配的技能" : "No skills available."}
              </div>
            ) : (
              filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => handleSelectSkill(skill)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--dsw-alias-interactive-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ marginTop: '2px', color: 'var(--dsw-alias-label-secondary)', flexShrink: 0 }}>
                    {skill.iconType === 'box' ? <BoxIcon size={16} /> : <UserIcon size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--dsw-alias-label-primary)' }}>
                      {skill.isRecent && (
                        <span style={{ color: 'var(--dsw-alias-label-tertiary)', display: 'inline-flex', alignItems: 'center' }}>
                          <ClockIcon size={12} />
                        </span>
                      )}
                      <span>{isZh ? skill.titleZh : skill.titleEn}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', lineHeight: '1.4' }}>
                      {isZh ? skill.descZh : skill.descEn}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部浏览全部横条，与图 2 一致 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderTop: '1px solid var(--dsw-alias-border)',
              background: 'var(--dsw-alias-bg-layer-1)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ZapIcon size={14} />
              <span>{isZh ? "浏览全部技能" : "Browse all skills"}</span>
            </div>
            <span style={{ fontSize: '14px', opacity: 0.7 }}>&rarr;</span>
          </div>
        </div>
      )}

      {/* 视频/图片/竞品 下拉子提示词菜单：直接依附在输入框正下方 */}
      {activeMenu && activeMenu !== 'skills' && (
        <div
          className="omnimux-subprompt-popover"
          style={{
            position: 'relative',
            left: '0',
            right: '0',
            width: '100%',
            maxWidth: '100%',
            background: 'var(--dsw-alias-bg-elevated)',
            border: '1px solid var(--dsw-alias-border)',
            borderRadius: '16px',
            boxShadow: '0 20px 48px var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.65))', /* exempt-ui03: 弹窗投影 */
            zIndex: 130,
            overflow: 'hidden',
            padding: '8px 10px',
            boxSizing: 'border-box',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', padding: '6px 10px 8px', borderBottom: '1px solid var(--dsw-alias-border)', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--dsw-alias-label-primary)' }}>
              {activeMenu === 'video-ads' ? (isZh ? '视频广告推荐提示词' : 'Video Ads Prompts') :
               activeMenu === 'image-ads' ? (isZh ? '图片广告推荐提示词' : 'Image Ads Prompts') :
               (isZh ? '竞争对手研究推荐' : 'Competitor Research')}
            </span>
          </header>
          {SUBPROMPTS_DATA[activeMenu]?.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSelectPrompt(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--dsw-alias-label-secondary)',
                fontSize: '13px',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)';
                e.currentTarget.style.color = 'var(--dsw-alias-label-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)';
              }}
            >
              <div style={{ opacity: 0.7 }} /* exempt-ui02: 子提示词图标透明度 */><PlayIcon size={13} /></div>
              <div>{isZh ? (item.labelZh || item.label) : (item.labelEn || item.label)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
