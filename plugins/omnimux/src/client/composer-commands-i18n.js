import { createElement } from 'react'

/**
 * Injects and maintains adaptive localized copy, icons, and smart search for slash commands.
 *
 * Resolves:
 * 1. Visual Icon Matching (Referencing UI Figure 1):
 *    - Layered Media Stack (🗂️) for `add-from-library`
 *    - Dartboard Target (🎯) for `goal`
 *    - Glowing Lightbulb (💡) for `plan`
 *    - Horizontal Squeeze Arrows (🗜️) for `compact`
 *    - Shield Badge (🛡️) for `permission`
 *    - Feedback Bubble (💬) for `feedback`
 *    - Tray Download (📥) for `export`
 * 2. Command name (item.name) adaptive localization:
 *    - In Chinese locale (zh), renders Chinese command names (e.g. "add-from-library" -> "从资产库添加")
 *    - In English locale (en), retains canonical English command names (e.g. "add-from-library")
 * 3. Command description adaptive localization:
 *    - In Chinese locale (zh), renders concise Chinese descriptions (e.g. "从统一资产库选择素材")
 *    - In English locale (en), renders canonical English descriptions
 * 4. Bidirectional transparent mapping:
 *    - Intercepts `dispatch`, `matchSpace`, and `matchEnter` so that selecting or entering
 *      Chinese command names transparently resolves and executes the underlying native Host command.
 * 5. Smart multi-modal query matching:
 *    - Typing Chinese keywords, pinyin, or English tokens all match and prioritize seamlessly.
 * 6. Dual-layer icon rendering:
 *    - Layer A: Direct DOM auto-sync over slash menu items via MutationObserver (instant, 100% reliable)
 *    - Layer B: In-place ReferenceIcon patch for primitives consumers
 */

// ==========================================
// 1. High-fidelity Vector Icon Renderers (Ref: Figure 1)
// ==========================================

export function renderLibraryIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('rect', {
      x: 1.5,
      y: 3.5,
      width: 11,
      height: 9,
      rx: 1.5,
      stroke: 'currentColor',
      strokeWidth: 1.3,
    }),
    createElement('path', {
      d: 'M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    }),
    createElement('circle', {
      cx: 5,
      cy: 6.5,
      r: 1,
      fill: 'currentColor',
    }),
    createElement('path', {
      d: 'M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  )
}

export function renderGoalIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M8 0C8.31 0 8.62 0.02 8.93 0.05C8.48 0.4 8.1 0.83 7.79 1.3C4.19 1.42 1.3 4.37 1.3 8C1.3 11.7 4.3 14.7 8 14.7C11.63 14.7 14.58 11.81 14.69 8.21C15.17 7.9 15.6 7.52 15.94 7.07C15.98 7.37 16 7.69 16 8C16 12.42 12.42 16 8 16C3.58 16 0 12.42 0 8C0 3.58 3.58 0 8 0ZM7.02 3.61C7.01 3.74 7 3.87 7 4C7 4.32 7.03 4.63 7.09 4.93C5.76 5.32 4.8 6.55 4.8 8C4.8 9.77 6.23 11.2 8 11.2C9.45 11.2 10.67 10.23 11.07 8.91C11.37 8.97 11.68 9 12 9C12.13 9 12.26 8.99 12.39 8.98C11.94 10.99 10.15 12.5 8 12.5C5.51 12.5 3.5 10.49 3.5 8C3.5 5.85 5 4.06 7.02 3.61Z',
      fill: 'currentColor',
    }),
    createElement('path', {
      d: 'M7.5 8.62L9.12 7',
      stroke: 'currentColor',
      strokeWidth: 1.3,
    }),
    createElement('path', {
      d: 'M9.08 3.36L11.87 0.58C11.9 0.55 11.95 0.56 11.95 0.61L12.24 3.7C12.24 3.72 12.26 3.74 12.28 3.74L15.37 4.03C15.41 4.03 15.43 4.08 15.4 4.11L12.62 6.89C12.61 6.9 12.6 6.91 12.58 6.91L9.12 6.91C9.09 6.91 9.07 6.89 9.07 6.86L9.07 3.39C9.07 3.38 9.07 3.37 9.08 3.36Z',
      stroke: 'currentColor',
      strokeWidth: 1.3,
    })
  )
}

export function renderPlanIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M6.8 12.8H9.2',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'M7 7.5L8 6.5L9 7.5',
      stroke: 'currentColor',
      strokeWidth: 1.1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M8 1V2M3.1 3.1L3.9 3.9M12.9 3.1L12.1 3.9M1.8 6.6H2.8M14.2 6.6H13.2',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    })
  )
}

export function renderCompactIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M3.5 2H12.5M3.5 14H12.5',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'M8 3.8V6.8M8 12.2V9.2',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'M5.8 5.6L8 7.2L10.2 5.6',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M5.8 10.4L8 8.8L10.2 10.4',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  )
}

export function renderPermissionIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M8 1.5L2.8 3.6V7.2C2.8 10.8 5.1 13.7 8 14.5C10.9 13.7 13.2 10.8 13.2 7.2V3.6L8 1.5Z',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M8 5V8.2M8 10.8H8.01',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    })
  )
}

export function renderFeedbackIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5.5L2.5 14.5V3.5Z',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M5.5 5.8H10.5M5.5 8.2H8.8',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    })
  )
}

export function renderExportIcon(size = 16, className) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className,
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M15.37 11.41L15.12 12.89C14.89 14.3 13.66 15.34 12.22 15.34H3.78C2.34 15.34 1.11 14.3 0.88 12.89L0.63 11.41L2.05 11.17L2.3 12.65C2.42 13.37 3.04 13.9 3.78 13.9H12.22C12.96 13.9 13.58 13.37 13.7 12.65L13.95 11.17L15.37 11.41ZM8.72 8.99C8.78 8.94 8.84 8.88 8.9 8.82L12.48 5.23L13.5 6.26L9.92 9.84C9.64 10.12 9.39 10.37 9.16 10.56C8.92 10.75 8.64 10.92 8.29 10.98C8.1 11.01 7.9 11.01 7.71 10.98C7.36 10.92 7.08 10.75 6.84 10.56C6.61 10.37 6.36 10.12 6.08 9.84L2.5 6.26L3.52 5.23L7.1 8.82C7.16 8.88 7.22 8.94 7.28 8.99V1.31H8.72V8.99Z',
      fill: 'currentColor',
    })
  )
}

export const COMMAND_ICONS = {
  'add-from-library': renderLibraryIcon,
  'library': renderLibraryIcon,
  'compact': renderCompactIcon,
  'compress': renderCompactIcon,
  'feedback': renderFeedbackIcon,
  'goal': renderGoalIcon,
  'target': renderGoalIcon,
  'permission': renderPermissionIcon,
  'shield': renderPermissionIcon,
  'plan': renderPlanIcon,
  'lightbulb': renderPlanIcon,
  'export': renderExportIcon,
  'download': renderExportIcon,
}

// ==========================================
// 2. High-fidelity SVG Strings for Direct DOM Sync
// ==========================================

export const COMMAND_SVG_STRINGS = {
  'add-from-library': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '从资产库添加': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  'compact': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 2H12.5M3.5 14H12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 3.8V6.8M8 12.2V9.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M5.8 5.6L8 7.2L10.2 5.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.8 10.4L8 8.8L10.2 10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '压缩历史': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 2H12.5M3.5 14H12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 3.8V6.8M8 12.2V9.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M5.8 5.6L8 7.2L10.2 5.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.8 10.4L8 8.8L10.2 10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  'feedback': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5.5L2.5 14.5V3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 5.8H10.5M5.5 8.2H8.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  '会话反馈': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3.5C2 2.67 2.67 2 3.5 2H12.5C13.33 2 14 2.67 14 3.5V10.5C14 11.33 13.33 12 12.5 12H5.5L2.5 14.5V3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 5.8H10.5M5.5 8.2H8.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',

  'permission': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.8 3.6V7.2C2.8 10.8 5.1 13.7 8 14.5C10.9 13.7 13.2 10.8 13.2 7.2V3.6L8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 5V8.2M8 10.8H8.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  '权限预设': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.8 3.6V7.2C2.8 10.8 5.1 13.7 8 14.5C10.9 13.7 13.2 10.8 13.2 7.2V3.6L8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 5V8.2M8 10.8H8.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',

  'plan': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.8 12.8H9.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><path d="M7 7.5L8 6.5L9 7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 1V2M3.1 3.1L3.9 3.9M12.9 3.1L12.1 3.9M1.8 6.6H2.8M14.2 6.6H13.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  '计划模式': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.8 12.8H9.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><path d="M7 7.5L8 6.5L9 7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 1V2M3.1 3.1L3.9 3.9M12.9 3.1L12.1 3.9M1.8 6.6H2.8M14.2 6.6H13.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',

  'goal': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 0C8.31 0 8.62 0.02 8.93 0.05C8.48 0.4 8.1 0.83 7.79 1.3C4.19 1.42 1.3 4.37 1.3 8C1.3 11.7 4.3 14.7 8 14.7C11.63 14.7 14.58 11.81 14.69 8.21C15.17 7.9 15.6 7.52 15.94 7.07C15.98 7.37 16 7.69 16 8C16 12.42 12.42 16 8 16C3.58 16 0 12.42 0 8C0 3.58 3.58 0 8 0ZM7.02 3.61C7.01 3.74 7 3.87 7 4C7 4.32 7.03 4.63 7.09 4.93C5.76 5.32 4.8 6.55 4.8 8C4.8 9.77 6.23 11.2 8 11.2C9.45 11.2 10.67 10.23 11.07 8.91C11.37 8.97 11.68 9 12 9C12.13 9 12.26 8.99 12.39 8.98C11.94 10.99 10.15 12.5 8 12.5C5.51 12.5 3.5 10.49 3.5 8C3.5 5.85 5 4.06 7.02 3.61Z" fill="currentColor"/><path d="M7.5 8.62L9.12 7" stroke="currentColor" stroke-width="1.3"/><path d="M9.08 3.36L11.87 0.58C11.9 0.55 11.95 0.56 11.95 0.61L12.24 3.7C12.24 3.72 12.26 3.74 12.28 3.74L15.37 4.03C15.41 4.03 15.43 4.08 15.4 4.11L12.62 6.89C12.61 6.9 12.6 6.91 12.58 6.91L9.12 6.91C9.09 6.91 9.07 6.89 9.07 6.86L9.07 3.39C9.07 3.38 9.07 3.37 9.08 3.36Z" stroke="currentColor" stroke-width="1.3"/></svg>',
  '任务目标': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 0C8.31 0 8.62 0.02 8.93 0.05C8.48 0.4 8.1 0.83 7.79 1.3C4.19 1.42 1.3 4.37 1.3 8C1.3 11.7 4.3 14.7 8 14.7C11.63 14.7 14.58 11.81 14.69 8.21C15.17 7.9 15.6 7.52 15.94 7.07C15.98 7.37 16 7.69 16 8C16 12.42 12.42 16 8 16C3.58 16 0 12.42 0 8C0 3.58 3.58 0 8 0ZM7.02 3.61C7.01 3.74 7 3.87 7 4C7 4.32 7.03 4.63 7.09 4.93C5.76 5.32 4.8 6.55 4.8 8C4.8 9.77 6.23 11.2 8 11.2C9.45 11.2 10.67 10.23 11.07 8.91C11.37 8.97 11.68 9 12 9C12.13 9 12.26 8.99 12.39 8.98C11.94 10.99 10.15 12.5 8 12.5C5.51 12.5 3.5 10.49 3.5 8C3.5 5.85 5 4.06 7.02 3.61Z" fill="currentColor"/><path d="M7.5 8.62L9.12 7" stroke="currentColor" stroke-width="1.3"/><path d="M9.08 3.36L11.87 0.58C11.9 0.55 11.95 0.56 11.95 0.61L12.24 3.7C12.24 3.72 12.26 3.74 12.28 3.74L15.37 4.03C15.41 4.03 15.43 4.08 15.4 4.11L12.62 6.89C12.61 6.9 12.6 6.91 12.58 6.91L9.12 6.91C9.09 6.91 9.07 6.89 9.07 6.86L9.07 3.39C9.07 3.38 9.07 3.37 9.08 3.36Z" stroke="currentColor" stroke-width="1.3"/></svg>',

  'export': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M15.37 11.41L15.12 12.89C14.89 14.3 13.66 15.34 12.22 15.34H3.78C2.34 15.34 1.11 14.3 0.88 12.89L0.63 11.41L2.05 11.17L2.3 12.65C2.42 13.37 3.04 13.9 3.78 13.9H12.22C12.96 13.9 13.58 13.37 13.7 12.65L13.95 11.17L15.37 11.41ZM8.72 8.99C8.78 8.94 8.84 8.88 8.9 8.82L12.48 5.23L13.5 6.26L9.92 9.84C9.64 10.12 9.39 10.37 9.16 10.56C8.92 10.75 8.64 10.92 8.29 10.98C8.1 11.01 7.9 11.01 7.71 10.98C7.36 10.92 7.08 10.75 6.84 10.56C6.61 10.37 6.36 10.12 6.08 9.84L2.5 6.26L3.52 5.23L7.1 8.82C7.16 8.88 7.22 8.94 7.28 8.99V1.31H8.72V8.99Z" fill="currentColor"/></svg>',
  '导出日志': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M15.37 11.41L15.12 12.89C14.89 14.3 13.66 15.34 12.22 15.34H3.78C2.34 15.34 1.11 14.3 0.88 12.89L0.63 11.41L2.05 11.17L2.3 12.65C2.42 13.37 3.04 13.9 3.78 13.9H12.22C12.96 13.9 13.58 13.37 13.7 12.65L13.95 11.17L15.37 11.41ZM8.72 8.99C8.78 8.94 8.84 8.88 8.9 8.82L12.48 5.23L13.5 6.26L9.92 9.84C9.64 10.12 9.39 10.37 9.16 10.56C8.92 10.75 8.64 10.92 8.29 10.98C8.1 11.01 7.9 11.01 7.71 10.98C7.36 10.92 7.08 10.75 6.84 10.56C6.61 10.37 6.36 10.12 6.08 9.84L2.5 6.26L3.52 5.23L7.1 8.82C7.16 8.88 7.22 8.94 7.28 8.99V1.31H8.72V8.99Z" fill="currentColor"/></svg>',
}

/**
 * Synchronize command icons directly to matching menu items in the DOM.
 * @param {Document|HTMLElement} [root]
 * @returns {number} Count of patched buttons
 */
export function syncMenuIcons(root) {
  const doc = root?.ownerDocument || root || (typeof document !== 'undefined' ? document : null)
  if (!doc) return 0
  const buttons = Array.from(doc.querySelectorAll('button[role="option"]'))
  let patched = 0
  for (const btn of buttons) {
    const nameSpan = btn.querySelector('[class*="itemName"]')
    if (!nameSpan) continue
    const name = nameSpan.textContent.trim()
    const svg = COMMAND_SVG_STRINGS[name] || COMMAND_SVG_STRINGS[resolveRawCommandName(name)]
    if (!svg) continue

    let iconSpan = btn.querySelector('[class*="itemIcon"]')
    if (!iconSpan) {
      iconSpan = doc.createElement('span')
      iconSpan.className = 'iRJKyq_itemIcon'
      iconSpan.setAttribute('aria-hidden', 'true')
      btn.insertBefore(iconSpan, nameSpan)
    }

    if (iconSpan.dataset.iconCommand !== name || !iconSpan.querySelector('svg')) {
      iconSpan.innerHTML = svg
      iconSpan.dataset.iconCommand = name
      iconSpan.style.display = 'inline-flex'
      iconSpan.style.width = '16px'
      iconSpan.style.height = '16px'
      iconSpan.style.alignItems = 'center'
      iconSpan.style.justifyContent = 'center'
      iconSpan.style.flex = 'none'
      patched++
    }
  }
  return patched
}

/**
 * Ensure static CSS rules for downward menu placement in full-stage/hero mode.
 * @param {Document} doc
 */
export function ensurePlacementStyles(doc) {
  if (!doc || !doc.head) return
  const STYLE_ID = 'dsh-omnimux-menu-placement'
  if (doc.getElementById(STYLE_ID)) return

  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    /* OmniMux Adaptive Composer Menu Placement */
    [data-menu-placement="bottom"] [class*="overlayAnchor"],
    [data-composer-card][data-menu-placement="bottom"] [class*="overlayAnchor"],
    [class*="overlayAnchor"][data-overlay-placement="bottom"] {
      inset: 0 !important;
      height: 100% !important;
      pointer-events: none !important;
    }
    [data-menu-placement="bottom"] [data-trigger-menu],
    [data-menu-placement="bottom"] [class*="iRJKyq_menu"],
    [data-menu-placement="bottom"] [class*="_1q_ULW_card"],
    [data-trigger-menu][data-placement="bottom"],
    [class*="iRJKyq_menu"][data-placement="bottom"],
    [class*="_1q_ULW_card"][data-placement="bottom"] {
      top: calc(100% + 4px) !important;
      bottom: auto !important;
      pointer-events: auto !important;
    }
  `
  doc.head.appendChild(style)
}

/**
 * Determine whether the candidate menu should be placed below the input box.
 * Rule:
 * 1. If the input box is near the bottom of the page (spaceBelow < 220px),
 *    keep the original behavior (place above).
 * 2. If in Hero/centered/full-stage mode with sufficient space below (spaceBelow >= 220px),
 *    place below so it doesn't obstruct headers and feels natural.
 * 3. Fallback geometric check: if spaceBelow >= 280px and spaceBelow > spaceAbove,
 *    place below.
 * @param {HTMLElement|null} card - The [data-composer-card] element
 * @param {HTMLElement|null} menu - The candidate menu element
 * @param {Window} [windowObj]
 * @returns {boolean} True if menu should be placed below the composer card
 */
export function shouldPlaceMenuBelow(card, menu, windowObj = (typeof window !== 'undefined' ? window : null)) {
  if (!card || !windowObj) return false

  const cardRect = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null
  if (!cardRect) return false

  const viewportHeight = windowObj.innerHeight || windowObj.document?.documentElement?.clientHeight || 800
  const spaceBelow = viewportHeight - cardRect.bottom
  const spaceAbove = cardRect.top

  // Strict lower bound: if space below is too tight, always keep above
  if (spaceBelow < 220) {
    return false
  }

  // Hero / Centered state check (New chat / full-stage hero mode)
  const isHero = Boolean(
    card.closest?.('[class*="hero"]') ||
    card.closest?.('[class*="Hero"]') ||
    card.closest?.('[data-phase="hero"]') ||
    card.closest?.('[class*="composerHero"]') ||
    card.closest?.('[class*="Q7WfXG_hero"]')
  )
  if (isHero && spaceBelow >= 220) {
    return true
  }

  // Geometric adaptive check: if space below is substantially larger than space above
  if (spaceBelow >= 280 && spaceBelow > spaceAbove) {
    return true
  }

  return false
}

/**
 * Synchronize placement and maximum height for a single composer menu.
 * @param {HTMLElement} menu
 * @param {Document} [doc]
 * @returns {boolean} True if placed below
 */
export function syncMenuPlacement(menu, doc) {
  if (!menu) return false
  const d = doc || menu.ownerDocument || (typeof document !== 'undefined' ? document : null)
  if (!d) return false

  const card = menu.closest?.('[data-composer-card]') || d.querySelector?.('[data-composer-card]')
  const anchor = menu.parentElement
  const win = d.defaultView || (typeof window !== 'undefined' ? window : null)

  const placeBelow = shouldPlaceMenuBelow(card, menu, win)

  if (placeBelow) {
    if (anchor) {
      anchor.dataset.overlayPlacement = 'bottom'
      anchor.style.position = 'absolute'
      anchor.style.inset = '0'
      anchor.style.height = '100%'
      anchor.style.pointerEvents = 'none'
    }
    if (card) {
      card.dataset.menuPlacement = 'bottom'
    }
    menu.dataset.placement = 'bottom'
    menu.style.bottom = 'auto'
    menu.style.top = 'calc(100% + 4px)'
    menu.style.pointerEvents = 'auto'

    // Compute and constrain max-height based on available viewport space below card
    if (win && card) {
      const cardRect = card.getBoundingClientRect()
      const vHeight = win.innerHeight || d.documentElement?.clientHeight || 800
      const available = vHeight - cardRect.bottom - 16
      const maxHeight = Math.min(320, Math.max(160, Math.floor(available)))
      menu.style.setProperty('max-height', `${maxHeight}px`, 'important')
    }
  } else {
    // Keep current state (place above input box)
    if (anchor && anchor.dataset.overlayPlacement === 'bottom') {
      delete anchor.dataset.overlayPlacement
      anchor.style.position = ''
      anchor.style.inset = ''
      anchor.style.height = ''
      anchor.style.pointerEvents = ''
    }
    if (card && card.dataset.menuPlacement === 'bottom') {
      delete card.dataset.menuPlacement
    }
    if (menu.dataset.placement === 'bottom') {
      delete menu.dataset.placement
      menu.style.bottom = ''
      menu.style.top = ''
      menu.style.pointerEvents = ''
      menu.style.removeProperty('max-height')
    }
  }

  return placeBelow
}

/**
 * Synchronize both icons and placement for all active candidate menus.
 * @param {Document} [doc]
 * @returns {{ patchedIcons: number, placedBelowCount: number }}
 */
export function syncAllComposerMenus(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return { patchedIcons: 0, placedBelowCount: 0 }
  ensurePlacementStyles(doc)
  const patchedIcons = syncMenuIcons(doc)

  const menus = Array.from(doc.querySelectorAll('[data-trigger-menu], [class*="iRJKyq_menu"], [class*="_1q_ULW_card"]'))
  let placedBelowCount = 0
  for (const menu of menus) {
    if (syncMenuPlacement(menu, doc)) {
      placedBelowCount++
    }
  }

  // If menu is not yet open, but card is in hero mode, pre-tag card so first frame has zero jitter
  const card = doc.querySelector?.('[data-composer-card]')
  if (card && shouldPlaceMenuBelow(card, null, doc.defaultView)) {
    card.dataset.menuPlacement = 'bottom'
    const anchor = card.querySelector?.('[class*="overlayAnchor"]')
    if (anchor) {
      anchor.dataset.overlayPlacement = 'bottom'
    }
  }

  return { patchedIcons, placedBelowCount }
}

/**
 * Automatically observe DOM for slash menu appearance, icons, and adaptive placement.
 * @param {Document} [doc]
 * @returns {() => void} Disposer
 */
export function installMenuAutoSync(doc = (typeof document !== 'undefined' ? document : null)) {
  const ObserverClass = doc?.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null)
  if (!doc || !doc.body) return () => {}

  ensurePlacementStyles(doc)

  let rafId = null
  const requestFrame = doc.defaultView?.requestAnimationFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))
  const cancelFrame = doc.defaultView?.cancelAnimationFrame || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => clearTimeout(id))

  const scheduleSync = () => {
    if (rafId) return
    rafId = requestFrame(() => {
      rafId = null
      syncAllComposerMenus(doc)
    })
  }

  let observer = null
  if (ObserverClass) {
    observer = new ObserverClass((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0 || m.type === 'attributes') {
          scheduleSync()
          return
        }
      }
    })

    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-phase', 'style'],
    })
  }

  // Viewport resize & scroll listeners to dynamically adjust placement and max-height
  const onViewportChange = () => scheduleSync()
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  if (win) {
    win.addEventListener('resize', onViewportChange, { passive: true })
    win.addEventListener('scroll', onViewportChange, { capture: true, passive: true })
  }

  // Pre-sync on "+" button pointerdown/click to preemptively set placement mode
  const onTriggerPointerDown = (e) => {
    const target = e.target
    if (target && target.closest?.('button[aria-label="指令"], button[class*="add"], [class*="Q7WfXG_add"]')) {
      const card = target.closest?.('[data-composer-card]') || doc.querySelector?.('[data-composer-card]')
      if (card && shouldPlaceMenuBelow(card, null, win)) {
        card.dataset.menuPlacement = 'bottom'
        const anchor = card.querySelector?.('[class*="overlayAnchor"]')
        if (anchor) {
          anchor.dataset.overlayPlacement = 'bottom'
          anchor.style.position = 'absolute'
          anchor.style.inset = '0'
          anchor.style.height = '100%'
          anchor.style.pointerEvents = 'none'
        }
      }
      scheduleSync()
    }
  }
  doc.addEventListener('pointerdown', onTriggerPointerDown, true)

  // Initial sync attempt
  scheduleSync()

  return () => {
    if (observer) observer.disconnect()
    if (rafId) {
      cancelFrame(rafId)
      rafId = null
    }
    if (win) {
      win.removeEventListener('resize', onViewportChange)
      win.removeEventListener('scroll', onViewportChange, true)
    }
    doc.removeEventListener('pointerdown', onTriggerPointerDown, true)
  }
}

/**
 * Backward-compatible alias for installMenuAutoSync.
 * @param {Document} [doc]
 * @returns {() => void}
 */
export const installMenuIconsAutoSync = installMenuAutoSync

// ==========================================
// 3. Dictionary & Copy Specifications
// ==========================================

export const COMMAND_I18N = {
  zh: {
    'add-from-library': {
      name: '从资产库添加',
      icon: 'add-from-library',
      description: '从统一资产库选择素材',
      keywords: ['资产', '素材', '资产库', '素材库', 'zichan', 'sucai', 'library', 'add-from-library'],
    },
    'compact': {
      name: '压缩历史',
      icon: 'compact',
      description: '压缩较早的历史对话上下文',
      keywords: ['压缩', '清理', '历史', '会话', '上下文', 'yashuo', 'compact', 'history'],
    },
    'feedback': {
      name: '会话反馈',
      icon: 'feedback',
      description: '记录本轮会话评价或问题',
      keywords: ['反馈', '评价', '建议', 'fankui', 'feedback'],
    },
    'goal': {
      name: '任务目标',
      icon: 'goal',
      description: '设定或查看长任务执行目标',
      keywords: ['目标', '任务', 'mubiao', 'renwu', 'goal', 'task'],
    },
    'permission': {
      name: '权限预设',
      icon: 'permission',
      description: '切换运行权限预设 (沙箱/免审批)',
      keywords: ['权限', '沙箱', '审批', 'quanxian', 'shaxiang', 'permission'],
    },
    'plan': {
      name: '计划模式',
      icon: 'plan',
      description: '开启或退出长任务计划模式',
      keywords: ['计划', '方案', '模式', 'jihua', 'plan', 'mode'],
    },
    'export': {
      name: '导出日志',
      icon: 'export',
      description: '下载当前会话完整日志 (ZIP)',
      keywords: ['导出', '下载', '日志', 'daochu', 'xiazai', 'export', 'log', 'zip'],
    },
  },
  en: {
    'add-from-library': {
      name: 'add-from-library',
      icon: 'add-from-library',
      description: 'Add from library',
      keywords: ['library', 'asset', 'add'],
    },
    'compact': {
      name: 'compact',
      icon: 'compact',
      description: 'Compact older conversation history',
      keywords: ['compact', 'history', 'clean'],
    },
    'feedback': {
      name: 'feedback',
      icon: 'feedback',
      description: 'Record feedback about this session',
      keywords: ['feedback', 'session', 'report'],
    },
    'goal': {
      name: 'goal',
      icon: 'goal',
      description: 'Set or view the goal for a long-running task',
      keywords: ['goal', 'task', 'objective'],
    },
    'permission': {
      name: 'permission',
      icon: 'permission',
      description: 'Switch the permission preset (sandbox, approval)',
      keywords: ['permission', 'sandbox', 'preset'],
    },
    'plan': {
      name: 'plan',
      icon: 'plan',
      description: 'Enter or leave plan mode',
      keywords: ['plan', 'mode', 'planning'],
    },
    'export': {
      name: 'export',
      icon: 'export',
      description: 'Download this Session log as a ZIP archive',
      keywords: ['export', 'download', 'log', 'archive', 'zip'],
    },
  },
}

/**
 * Reverse lookup dictionary: Chinese display name -> canonical raw command name.
 */
export const ZH_NAME_TO_RAW = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMAND_I18N.zh).map(([raw, conf]) => [conf.name, raw])
  )
)

/**
 * Resolve canonical raw command name from any alias or localized display name.
 * @param {string} name
 * @returns {string}
 */
export function resolveRawCommandName(name) {
  if (!name || typeof name !== 'string') return name || ''
  return ZH_NAME_TO_RAW[name] || name
}

/**
 * Determine if current active locale is Chinese.
 * @param {any} locale
 * @returns {boolean}
 */
export function isZhLocale(locale) {
  if (!locale) return true
  const active = (typeof locale.getSnapshot === 'function' ? locale.getSnapshot()?.active : locale.current) || ''
  return !String(active).toLowerCase().startsWith('en')
}

/**
 * Resolve the current active language ('zh' | 'en').
 * @param {any} locale
 * @returns {'zh' | 'en'}
 */
export function getActiveLang(locale) {
  return isZhLocale(locale) ? 'zh' : 'en'
}

/**
 * Split bilingual descriptions like "添加文件 / Add files" if present.
 * @param {string} desc
 * @param {'zh' | 'en'} lang
 * @returns {string}
 */
export function splitBilingualDescription(desc, lang) {
  if (!desc || typeof desc !== 'string') return desc || ''
  const parts = desc.split(/\s*\/\s*/)
  if (parts.length === 2 && /[\u4e00-\u9fa5]/.test(parts[0]) && /^[A-Za-z0-9\s._(),-]+$/.test(parts[1])) {
    return lang === 'zh' ? parts[0].trim() : parts[1].trim()
  }
  return desc
}

/**
 * Resolve localized display name for a command candidate.
 * @param {string} rawName
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveCommandDisplayName(rawName, locale) {
  const lang = getActiveLang(locale)
  const config = COMMAND_I18N[lang]?.[rawName]
  if (config?.name) {
    return config.name
  }
  return rawName
}

/**
 * Resolve localized description for a given command name.
 * @param {string} name
 * @param {string} [fallbackDesc]
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveCommandDescription(name, fallbackDesc, locale) {
  const lang = getActiveLang(locale)
  const rawName = resolveRawCommandName(name)
  const config = COMMAND_I18N[lang]?.[rawName]
  if (config?.description) {
    return config.description
  }
  return splitBilingualDescription(fallbackDesc || '', lang)
}

/**
 * Calculate match relevance score for a command candidate.
 * Higher score means better match. Returns undefined if not matched.
 * @param {{ name: string, rawName?: string, description?: string }} candidate
 * @param {string} rawQuery
 * @param {'zh' | 'en'} lang
 * @returns {number | undefined}
 */
export function scoreCommandCandidate(candidate, rawQuery, lang) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return 1

  const name = (candidate.name || '').toLowerCase()
  const rawName = (candidate.rawName || candidate.name || '').toLowerCase()
  const desc = (candidate.description || '').toLowerCase()
  const config = COMMAND_I18N[lang]?.[candidate.rawName || candidate.name]
  const keywords = (config?.keywords || []).map(k => k.toLowerCase())

  // 1. Exact name or rawName match
  if (name === query || rawName === query) return 1000

  // 2. Name or rawName prefix match
  if (name.startsWith(query)) return 600 - (name.length - query.length)
  if (rawName.startsWith(query)) return 500 - (rawName.length - query.length)

  // 3. Name or rawName substring match
  const nameIdx = name.indexOf(query)
  if (nameIdx >= 0) return 400 - nameIdx
  const rawIdx = rawName.indexOf(query)
  if (rawIdx >= 0) return 300 - rawIdx

  // 4. Description exact or prefix match
  if (desc.startsWith(query)) return 200

  // 5. Description substring match
  const descIdx = desc.indexOf(query)
  if (descIdx >= 0) return 150 - descIdx

  // 6. Keywords match
  for (const kw of keywords) {
    if (kw === query) return 130
    if (kw.startsWith(query)) return 110
    if (kw.includes(query)) return 90
  }

  // 7. Subsequence match on rawName
  let qIdx = 0
  for (let i = 0; i < rawName.length && qIdx < query.length; i++) {
    if (rawName[i] === query[qIdx]) qIdx++
  }
  if (qIdx === query.length) return 50

  return undefined
}

/**
 * Enhance command candidates by localizing names, descriptions, and binding icons.
 * @param {Array<{ name: string, rawName?: string, icon?: string, description?: string, hint?: string }>} allRows
 * @param {{ query?: string }} req
 * @param {any} locale
 * @returns {Array<{ name: string, rawName: string, icon?: string, description?: string, hint?: string }>}
 */
export function enhanceCommandCandidates(allRows, req, locale) {
  if (!Array.isArray(allRows)) return []
  const lang = getActiveLang(locale)

  // 1. Localize name, description and assign matching icon
  const localized = allRows.map((row) => {
    const rawName = row.rawName || row.name
    const config = COMMAND_I18N[lang]?.[rawName]
    const displayName = resolveCommandDisplayName(rawName, locale)
    const displayDesc = resolveCommandDescription(rawName, row.description, locale)
    const iconKind = row.icon || config?.icon || (COMMAND_ICONS[rawName] ? rawName : undefined)
    return {
      ...row,
      name: displayName,
      rawName,
      icon: iconKind,
      description: displayDesc,
    }
  })

  const rawQuery = (req?.query || '').trim()
  if (!rawQuery) {
    return localized
  }

  // 2. Filter and score
  const scored = []
  localized.forEach((candidate, index) => {
    const score = scoreCommandCandidate(candidate, rawQuery, lang)
    if (score !== undefined) {
      scored.push({ candidate, score, index })
    }
  })

  // 3. Stable sort: higher score first, retain original relative index on tie
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.candidate)
}

/**
 * Extract unproxied native primitives exports if available.
 * @param {any} [fallbackPrimitives]
 * @returns {any}
 */
export function getRawPrimitives(fallbackPrimitives) {
  if (typeof window !== 'undefined' && typeof window.__dshClientRequire__ === 'function') {
    try {
      const raw = window.__dshClientRequire__('@deepseek-ai/dsh-client-ui-primitives')
      if (raw && typeof raw.ReferenceIcon === 'function') return raw
    } catch {}
  }
  if (fallbackPrimitives?.default && typeof fallbackPrimitives.default.ReferenceIcon === 'function') {
    return fallbackPrimitives.default
  }
  return fallbackPrimitives
}

/**
 * Patch primitives.ReferenceIcon to seamlessly render command icons.
 * @param {any} primitives
 * @returns {() => void} Disposer to restore original ReferenceIcon
 */
export function patchPrimitivesReferenceIcon(primitives) {
  const target = getRawPrimitives(primitives)
  if (!target || typeof target.ReferenceIcon !== 'function') return () => {}
  const originalRefIcon = target.ReferenceIcon
  const enhancedRefIcon = function EnhancedReferenceIcon(props) {
    const kind = props?.kind
    const renderCustom = COMMAND_ICONS[kind]
    if (typeof renderCustom === 'function') {
      return renderCustom(props?.size ?? 16, props?.className)
    }
    return originalRefIcon(props)
  }
  try {
    target.ReferenceIcon = enhancedRefIcon
  } catch {
    try {
      Object.defineProperty(target, 'ReferenceIcon', {
        value: enhancedRefIcon,
        writable: true,
        configurable: true,
      })
    } catch {}
  }
  return () => {
    if (target.ReferenceIcon === enhancedRefIcon) {
      target.ReferenceIcon = originalRefIcon
    }
  }
}

/**
 * Method-wrap `commandUi` methods (candidates, dispatch, matchSpace, matchEnter) in-place safely.
 * @param {any} commandUi
 * @param {any} locale
 * @returns {() => void} Disposer to restore original methods
 */
export function wrapCommandUi(commandUi, locale) {
  if (!commandUi || typeof commandUi.candidates !== 'function') {
    return () => {}
  }

  const originalCandidates = commandUi.candidates
  const originalDispatch = typeof commandUi.dispatch === 'function' ? commandUi.dispatch : null
  const originalMatchSpace = typeof commandUi.matchSpace === 'function' ? commandUi.matchSpace : null
  const originalMatchEnter = typeof commandUi.matchEnter === 'function' ? commandUi.matchEnter : null

  const boundCandidates = originalCandidates.bind(commandUi)
  const boundDispatch = originalDispatch ? originalDispatch.bind(commandUi) : null
  const boundMatchSpace = originalMatchSpace ? originalMatchSpace.bind(commandUi) : null
  const boundMatchEnter = originalMatchEnter ? originalMatchEnter.bind(commandUi) : null

  // 1. Wrap candidates to yield adaptive names, descriptions, and icons
  const wrappedCandidates = async function (session, req) {
    try {
      const baseReq = req ? { ...req, query: '' } : { query: '' }
      const allRows = await boundCandidates(session, baseReq)
      return enhanceCommandCandidates(allRows, req, locale)
    } catch {
      return boundCandidates(session, req)
    }
  }

  // 2. Wrap dispatch to transparently unwrap localized candidate name to rawName
  const wrappedDispatch = boundDispatch ? function (pick) {
    if (!pick || !pick.candidate) return boundDispatch(pick)
    const rawName = pick.candidate.rawName || resolveRawCommandName(pick.candidate.name)
    const normalizedCandidate = {
      ...pick.candidate,
      name: rawName,
    }
    return boundDispatch({
      ...pick,
      candidate: normalizedCandidate,
    })
  } : null

  // 3. Wrap matchSpace to map localized token to rawName
  const wrappedMatchSpace = boundMatchSpace ? function (session, token) {
    if (!token || typeof token !== 'string' || !token.startsWith('/')) {
      return boundMatchSpace(session, token)
    }
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      return boundMatchSpace(session, `/${rawName}`)
    }
    return boundMatchSpace(session, token)
  } : null

  // 4. Wrap matchEnter to map localized line to rawName
  const wrappedMatchEnter = boundMatchEnter ? async function (session, line, signal, envelope) {
    const trimmed = (line || '').trim()
    if (!trimmed.startsWith('/')) {
      return boundMatchEnter(session, line, signal, envelope)
    }
    const ws = trimmed.search(/\s/)
    const token = ws === -1 ? trimmed : trimmed.slice(0, ws)
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      const mappedLine = ws === -1 ? `/${rawName}` : `/${rawName} ${trimmed.slice(ws + 1)}`
      return boundMatchEnter(session, mappedLine, signal, envelope)
    }
    return boundMatchEnter(session, line, signal, envelope)
  } : null

  commandUi.candidates = wrappedCandidates
  if (wrappedDispatch) commandUi.dispatch = wrappedDispatch
  if (wrappedMatchSpace) commandUi.matchSpace = wrappedMatchSpace
  if (wrappedMatchEnter) commandUi.matchEnter = wrappedMatchEnter

  return () => {
    if (commandUi.candidates === wrappedCandidates) commandUi.candidates = originalCandidates
    if (originalDispatch && commandUi.dispatch === wrappedDispatch) commandUi.dispatch = originalDispatch
    if (originalMatchSpace && commandUi.matchSpace === wrappedMatchSpace) commandUi.matchSpace = originalMatchSpace
    if (originalMatchEnter && commandUi.matchEnter === wrappedMatchEnter) commandUi.matchEnter = originalMatchEnter
  }
}

/**
 * Install the adaptive command localization and icons into client runtime.
 * @param {{ inject?: Function }} ctx
 * @param {any} [primitives]
 */
export function installCommandsI18n(ctx, primitives) {
  if (!ctx || typeof ctx.inject !== 'function') return

  // 1. Install DOM auto sync for command icons
  let stopAutoSync = null
  if (typeof document !== 'undefined') {
    stopAutoSync = installMenuIconsAutoSync(document)
  }

  // 2. Patch primitives.ReferenceIcon as dual-layer defense
  let unpatchPrimitives = null
  if (primitives && typeof primitives.ReferenceIcon === 'function') {
    unpatchPrimitives = patchPrimitivesReferenceIcon(primitives)
  }

  ctx.inject(['commandUi', 'locale'], (inner) => {
    inner.effect?.(() => {
      const commandUi = inner.commandUi || inner.get?.('commandUi')
      const locale = inner.locale || inner.get?.('locale')
      const unwrap = wrapCommandUi(commandUi, locale)
      return () => {
        unwrap?.()
        unpatchPrimitives?.()
        stopAutoSync?.()
      }
    }, 'omnimux: command i18n & query enhancement')
  })
}
