import React from 'react'

function MarketingInsightCover() {
  return (
    <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="240" height="135" className="cover-bg-mesh" />
      <rect x="45" y="20" width="150" height="85" rx="6" className="cover-screen" strokeWidth="1.5" />
      <rect x="52" y="27" width="136" height="62" rx="3" className="cover-display" />
      <rect x="75" y="38" width="90" height="18" rx="4" className="cover-brand-badge" />
      <text x="120" y="50" className="cover-text-white" fontSize="9" fontWeight="700" textAnchor="middle">
        MARKETING INSIGHT
      </text>
      <circle cx="68" cy="70" r="7" className="cover-node-purple" strokeWidth="1" />
      <text x="68" y="73" className="cover-text-muted" fontSize="9" textAnchor="middle">
        Market
      </text>
      <circle cx="120" cy="74" r="8" className="cover-node-pink" strokeWidth="1" />
      <text x="120" y="77" className="cover-text-muted" fontSize="9" textAnchor="middle">
        Audience
      </text>
      <circle cx="172" cy="70" r="7" className="cover-node-blue" strokeWidth="1" />
      <text x="172" y="73" className="cover-text-muted" fontSize="9" textAnchor="middle">
        ROAS
      </text>
      <path
        d="M75 68 L95 56 M120 66 L120 56 M165 68 L145 56"
        className="cover-line"
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />
      <path d="M110 105 L130 105 L125 116 L115 116 Z" className="cover-stand" />
      <rect x="95" y="116" width="50" height="3" rx="1.5" className="cover-stand-base" />
    </svg>
  )
}

function UrlToVideoCover() {
  return (
    <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="240" height="135" className="cover-bg-alt" />
      <circle cx="120" cy="55" r="32" className="cover-circle-halo" />
      <rect x="30" y="85" width="180" height="28" rx="14" className="cover-url-bar" strokeWidth="1.2" />
      <circle cx="45" cy="99" r="6" className="cover-url-icon" strokeWidth="1.2" />
      <path d="M41 99 H49 M45 95 V103" className="cover-url-icon" strokeWidth="1" />
      <text x="58" y="102" className="cover-text-muted" fontSize="9">
        https://example.com/product...
      </text>
      <circle cx="196" cy="99" r="9" className="cover-circle-btn" />
      <path
        d="M194 96 L198 99 L194 102"
        className="cover-text-white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RecreateViralAdsCover() {
  return (
    <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="240" height="135" className="cover-bg-alt" />
      <rect x="50" y="32" width="140" height="70" rx="6" className="cover-screen" strokeWidth="1" />
      <rect x="58" y="38" width="124" height="50" rx="3" className="cover-display" />
      <rect x="68" y="48" width="104" height="20" rx="4" className="cover-brand-badge" strokeWidth="1" />
      <text x="120" y="62" className="cover-text-white" fontSize="9" fontWeight="700" textAnchor="middle">
        RECREATE VIRAL ADS
      </text>
      <polygon points="116,74 126,80 116,86" className="cover-play-triangle" />
    </svg>
  )
}

function DefaultBatchAdsCover() {
  return (
    <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="240" height="135" className="cover-bg-mesh" />
      <rect x="40" y="24" width="48" height="68" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="94" y="24" width="52" height="42" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="152" y="24" width="48" height="68" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="94" y="72" width="52" height="20" rx="4" className="cover-brand-badge" strokeWidth="1" />
      <text x="120" y="85" className="cover-text-muted" fontSize="9" fontWeight="600" textAnchor="middle">
        Batch Ads
      </text>
    </svg>
  )
}

const COVER_MAP = {
  'marketing-insight': MarketingInsightCover,
  'url-to-video': UrlToVideoCover,
  'recreate-viral-ads': RecreateViralAdsCover,
  'creative-presets': DefaultBatchAdsCover,
  'bulk-create-ads': DefaultBatchAdsCover,
}

/**
 * Render cover graphics for popular starter cards.
 */
export function PopularCardCover({ id }) {
  const Component = COVER_MAP[id] || DefaultBatchAdsCover
  return <Component />
}

function UnboxingCover() {
  return (
    <svg viewBox="0 0 210 280" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="210" height="280" className="cover-bg-mesh" />
      <rect x="45" y="80" width="120" height="90" rx="8" className="cover-screen" strokeWidth="1.5" />
      <path d="M45 105 L105 135 L165 105 M105 135 V170" className="cover-line" strokeWidth="1.5" />
      <circle cx="105" cy="65" r="22" className="cover-node-purple" strokeWidth="1" />
      <text x="105" y="69" className="cover-text-white" fontSize="10" textAnchor="middle">
        UGC
      </text>
      <circle cx="105" cy="220" r="16" className="cover-circle-btn" />
      <polygon points="102,213 111,220 102,227" className="cover-text-white" />
    </svg>
  )
}

function FoodSnackCover() {
  return (
    <svg viewBox="0 0 210 280" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="210" height="280" className="cover-bg-alt" />
      <rect x="55" y="110" width="100" height="110" rx="6" className="cover-brand-badge" strokeWidth="1.5" />
      <path
        d="M70 110 L75 40 M90 110 L92 35 M105 110 L105 30 M120 110 L118 35 M135 110 L140 45"
        className="cover-line"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="105" cy="220" r="16" className="cover-circle-btn" />
      <polygon points="102,213 111,220 102,227" className="cover-text-white" />
    </svg>
  )
}

function DefaultExampleCover() {
  return (
    <svg viewBox="0 0 210 280" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="210" height="280" className="cover-bg-mesh" />
      <path
        d="M105 50 Q125 30 145 60 T105 160 Q85 130 105 50 Z"
        className="cover-node-pink"
        strokeWidth="1.5"
      />
      <rect x="75" y="150" width="60" height="80" rx="4" className="cover-screen" strokeWidth="1" />
      <circle cx="105" cy="40" r="14" className="cover-node-purple" strokeWidth="1" />
      <circle cx="105" cy="220" r="16" className="cover-circle-btn" />
      <polygon points="102,213 111,220 102,227" className="cover-text-white" />
    </svg>
  )
}

const EXAMPLE_COVER_MAP = {
  unboxing: UnboxingCover,
  'food-snack': FoodSnackCover,
}

/**
 * Render example media cover for carousel items.
 */
export function ExampleMediaCover({ id }) {
  const Component = EXAMPLE_COVER_MAP[id] || DefaultExampleCover
  return <Component />
}
