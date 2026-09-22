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
 *    - In Chinese locale (zh), renders Chinese command names (e.g. "add-from-library" -> "从资产库选择")
 *    - In English locale (en), retains canonical English command names (e.g. "add-from-library")
 * 3. Command description adaptive localization:
 *    - In Chinese locale (zh), renders concise Chinese descriptions (e.g. "从统一资产库选择素材")
 *    - In English locale (en), renders canonical English descriptions
 * 4. Bidirectional transparent mapping:
 *    - Intercepts `dispatch`, `matchSpace`, and `matchEnter` so that selecting or entering
 *      Chinese command names transparently resolves and executes the underlying native Host command.
 *    - Each wrapper delegates with the receiver the runtime handed it, so the Host method keeps
 *      running against the service's own context instead of the narrow scope that read the service
 *      (`this.ctx.remote.commands` in the Host dispatch path must not resolve against that scope).
 * 5. Smart multi-modal query matching:
 *    - Typing Chinese keywords, pinyin, or English tokens all match and prioritize seamlessly.
 * 6. Dual-layer icon rendering:
 *    - Layer A: Direct DOM auto-sync over slash menu items via MutationObserver (instant, 100% reliable)
 *    - Layer B: In-place ReferenceIcon patch for primitives consumers
 */

// ==========================================
// 1. High-fidelity Vector Icon Renderers (Ref: Figure 1)
// ==========================================

export function renderPaperclipIcon(size = 16, className) {
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
      d: 'M5.55 9.75V5H6.95V9.75C6.95 10.33 7.42 10.8 8 10.8C8.58 10.8 9.05 10.33 9.05 9.75V4.5C9.05 2.95 7.8 1.7 6.25 1.7C4.7 1.7 3.45 2.95 3.45 4.5V9.75C3.45 12.26 5.49 14.3 8 14.3C10.51 14.3 12.55 12.26 12.55 9.75V4H13.95V9.75C13.95 13.04 11.29 15.7 8 15.7C4.71 15.7 2.05 13.04 2.05 9.75V4.5C2.05 2.18 3.93 0.3 6.25 0.3C8.57 0.3 10.45 2.18 10.45 4.5V9.75C10.45 11.1 9.35 12.2 8 12.2C6.65 12.2 5.55 11.1 5.55 9.75Z',
      fill: 'currentColor',
    })
  )
}

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

export function renderProductIcon(size = 16, className) {
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
      d: 'M4 2L2 5v8.5A1.5 1.5 0 003.5 15h9A1.5 1.5 0 0014 13.5V5L12 2H4z',
      stroke: 'currentColor',
      strokeWidth: 1.3,
    }),
    createElement('path', {
      d: 'M2 5h12M10 7.5a2 2 0 01-4 0',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
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
  'add-file': renderPaperclipIcon,
  'paperclip': renderPaperclipIcon,
  'add-from-library': renderLibraryIcon,
  'library': renderLibraryIcon,
  'add-from-product': renderProductIcon,
  'product': renderProductIcon,
  'add-from-inspiration': renderPlanIcon,
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
  'add-file': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.55 9.75V5H6.95V9.75C6.95 10.33 7.42 10.8 8 10.8C8.58 10.8 9.05 10.33 9.05 9.75V4.5C9.05 2.95 7.8 1.7 6.25 1.7C4.7 1.7 3.45 2.95 3.45 4.5V9.75C3.45 12.26 5.49 14.3 8 14.3C10.51 14.3 12.55 12.26 12.55 9.75V4H13.95V9.75C13.95 13.04 11.29 15.7 8 15.7C4.71 15.7 2.05 13.04 2.05 9.75V4.5C2.05 2.18 3.93 0.3 6.25 0.3C8.57 0.3 10.45 2.18 10.45 4.5V9.75C10.45 11.1 9.35 12.2 8 12.2C6.65 12.2 5.55 11.1 5.55 9.75Z" fill="currentColor"/></svg>',
  '添加文件': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.55 9.75V5H6.95V9.75C6.95 10.33 7.42 10.8 8 10.8C8.58 10.8 9.05 10.33 9.05 9.75V4.5C9.05 2.95 7.8 1.7 6.25 1.7C4.7 1.7 3.45 2.95 3.45 4.5V9.75C3.45 12.26 5.49 14.3 8 14.3C10.51 14.3 12.55 12.26 12.55 9.75V4H13.95V9.75C13.95 13.04 11.29 15.7 8 15.7C4.71 15.7 2.05 13.04 2.05 9.75V4.5C2.05 2.18 3.93 0.3 6.25 0.3C8.57 0.3 10.45 2.18 10.45 4.5V9.75C10.45 11.1 9.35 12.2 8 12.2C6.65 12.2 5.55 11.1 5.55 9.75Z" fill="currentColor"/></svg>',

  'add-from-library': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '从资产库选择': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '从资产库添加': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'add-from-product': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2L2 5v8.5A1.5 1.5 0 003.5 15h9A1.5 1.5 0 0014 13.5V5L12 2H4z" stroke="currentColor" stroke-width="1.3"/><path d="M2 5h12M10 7.5a2 2 0 01-4 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  '从商品库选择': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2L2 5v8.5A1.5 1.5 0 003.5 15h9A1.5 1.5 0 0014 13.5V5L12 2H4z" stroke="currentColor" stroke-width="1.3"/><path d="M2 5h12M10 7.5a2 2 0 01-4 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'add-from-inspiration': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.8 12.8H9.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>',
  '从灵感库选择': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.8 12.8H9.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>',
  '上传媒体或文件': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.55 9.75V5H6.95V9.75C6.95 10.33 7.42 10.8 8 10.8C8.58 10.8 9.05 10.33 9.05 9.75V4.5C9.05 2.95 7.8 1.7 6.25 1.7C4.7 1.7 3.45 2.95 3.45 4.5V9.75C3.45 12.26 5.49 14.3 8 14.3C10.51 14.3 12.55 12.26 12.55 9.75V4H13.95V9.75C13.95 13.04 11.29 15.7 8 15.7C4.71 15.7 2.05 13.04 2.05 9.75V4.5C2.05 2.18 3.93 0.3 6.25 0.3C8.57 0.3 10.45 2.18 10.45 4.5V9.75C10.45 11.1 9.35 12.2 8 12.2C6.65 12.2 5.55 11.1 5.55 9.75Z" fill="currentColor"/></svg>',
  'Upload media or files': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.55 9.75V5H6.95V9.75C6.95 10.33 7.42 10.8 8 10.8C8.58 10.8 9.05 10.33 9.05 9.75V4.5C9.05 2.95 7.8 1.7 6.25 1.7C4.7 1.7 3.45 2.95 3.45 4.5V9.75C3.45 12.26 5.49 14.3 8 14.3C10.51 14.3 12.55 12.26 12.55 9.75V4H13.95V9.75C13.95 13.04 11.29 15.7 8 15.7C4.71 15.7 2.05 13.04 2.05 9.75V4.5C2.05 2.18 3.93 0.3 6.25 0.3C8.57 0.3 10.45 2.18 10.45 4.5V9.75C10.45 11.1 9.35 12.2 8 12.2C6.65 12.2 5.55 11.1 5.55 9.75Z" fill="currentColor"/></svg>',
  'Choose from asset library': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 1.8H12.8C13.6 1.8 14.2 2.4 14.2 3.2V10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5" cy="6.5" r="1" fill="currentColor"/><path d="M2.5 10.8L5.2 8L7.8 10.5L9.8 8.5L11.5 10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Choose from product library': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2L2 5v8.5A1.5 1.5 0 003.5 15h9A1.5 1.5 0 0014 13.5V5L12 2H4z" stroke="currentColor" stroke-width="1.3"/><path d="M2 5h12M10 7.5a2 2 0 01-4 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'Choose from inspiration library': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2C6.12 3.2 4.6 4.72 4.6 6.6C4.6 7.82 5.25 8.9 6.2 9.5V11C6.2 11.22 6.38 11.4 6.6 11.4H9.4C9.62 11.4 9.8 11.22 9.8 11V9.5C10.75 8.9 11.4 7.82 11.4 6.6C11.4 4.72 9.88 3.2 8 3.2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.8 12.8H9.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>',

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
    /* 仅底选弹窗菜单（如+号命令卡片）在特定条件下方展开 */
    [data-menu-placement="bottom"] [class*="_1q_ULW_card"],
    [class*="_1q_ULW_card"][data-placement="bottom"] {
      top: calc(100% + 4px) !important;
      bottom: auto !important;
      pointer-events: auto !important;
      z-index: 1000 !important;
    }
    /* 默认（斜杠联想、输入框在底部）贴在输入框上方。
       输入框在页面顶部且加号处于展开时，同一菜单改到输入框下方，避免被顶出可视区域。 */
    [data-composer-card] [data-trigger-menu],
    [data-composer-card] [class*="iRJKyq_menu"],
    [data-trigger-menu],
    [class*="iRJKyq_menu"] {
      top: auto !important;
      bottom: calc(100% + 4px) !important;
      pointer-events: auto !important;
      z-index: 1000 !important;
    }
    [data-composer-card]:has(button[aria-haspopup="listbox"][aria-expanded="true"])[data-menu-placement="bottom"] [data-trigger-menu],
    [data-composer-card]:has(button[aria-haspopup="listbox"][aria-expanded="true"])[data-menu-placement="bottom"] [class*="iRJKyq_menu"],
    [data-trigger-menu][data-placement="bottom"],
    [class*="iRJKyq_menu"][data-placement="bottom"] {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: calc(100% + 4px) !important;
      bottom: auto !important;
    }
    /* 所有输入框菜单均赋予最高层级（z-index: 1000），彻底杜绝被页面内胶囊栏（120）或卡片遮挡 */
    [data-composer-card] [data-trigger-menu],
    [data-composer-card] [class*="iRJKyq_menu"],
    [data-composer-card] [class*="_1q_ULW_card"],
    [data-trigger-menu],
    [class*="iRJKyq_menu"],
    [class*="_1q_ULW_card"] {
      pointer-events: auto !important;
      z-index: 1000 !important;
    }
    /* 隐藏原生添加文件（回形针）图标按钮，统一收纳至「+」指令菜单中 */
    [data-composer-card] button[aria-label="添加附件"],
    [data-composer-card] button[aria-label="Add attachment"],
    [data-composer-card] button[aria-label*="attach"],
    [data-composer-card] button[aria-label*="附件"] {
      display: none !important;
    }
  `
  doc.head.appendChild(style)
}

/** 加号按钮：aria-haspopup=listbox。斜杠联想没有这个按钮展开态。 */
const PLUS_BUTTON = 'button[aria-haspopup="listbox"]'

/**
 * 加号菜单与斜杠联想共用同一菜单层。只有加号处于展开，才允许改到输入框下方。
 * 菜单节点尚未挂上时，用卡片上的加号按钮判断。
 * @param {HTMLElement|null} card
 * @param {HTMLElement|null} menu
 * @returns {boolean}
 */
export function isPlusMenuContext(card, menu) {
  const root = menu?.closest?.('[data-composer-card]') || card
  const button = root?.querySelector?.(PLUS_BUTTON)
  if (!button) return false
  if (button.getAttribute?.('aria-expanded') === 'true') return true
  // 按下加号的同一帧，宿主还没把展开态写上，菜单也还没挂出来。
  // 已挂出的菜单必须等展开态，避免斜杠联想被误判成加号。
  return !menu
}

/**
 * Determine whether the plus menu should open below the input box.
 * Rule:
 * 1. Slash / skill suggestions stay above the input box.
 * 2. The plus menu follows the input box: below when the box sits in the
 *    upper half of the page, above when it sits in the lower half.
 * 3. If the side that follows the box has less than 160px, use the other side.
 * @param {HTMLElement|null} card - The [data-composer-card] element
 * @param {HTMLElement|null} menu - The candidate menu element
 * @param {Window} [windowObj]
 * @returns {boolean} True if the plus menu should be placed below the composer card
 */
export function shouldPlaceMenuBelow(card, menu, windowObj = (typeof window !== 'undefined' ? window : null)) {
  if (!card || !windowObj) return false
  if (!isPlusMenuContext(card, menu)) return false

  const cardRect = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null
  if (!cardRect) return false

  const viewportHeight = windowObj.innerHeight || windowObj.document?.documentElement?.clientHeight || 800
  const spaceBelow = viewportHeight - cardRect.bottom
  const spaceAbove = cardRect.top
  const composerAtTop = cardRect.top + cardRect.height / 2 < viewportHeight / 2

  if (composerAtTop) return spaceBelow >= 160
  return spaceAbove < 160 && spaceBelow >= 160
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
    menu.style.position = 'absolute'
    menu.style.left = '0'
    menu.style.right = '0'
    menu.style.bottom = 'auto'
    menu.style.top = 'calc(100% + 4px)'
    menu.style.pointerEvents = 'auto'
    menu.style.zIndex = '1000'

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
      menu.style.position = ''
      menu.style.left = ''
      menu.style.right = ''
      menu.style.bottom = ''
      menu.style.top = ''
      menu.style.removeProperty('max-height')
    }
    menu.style.pointerEvents = 'auto'
    menu.style.zIndex = '1000'
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

  // 菜单还没挂出来时，按输入框当前位置预先标好方向，避免第一帧弹错边。
  // 输入框挪到底部后必须清掉旧标记，否则加号会沿用顶部时的向下展开。
  const card = doc.querySelector?.('[data-composer-card]')
  if (card) {
    const anchor = card.querySelector?.('[class*="overlayAnchor"]')
    if (shouldPlaceMenuBelow(card, null, doc.defaultView)) {
      card.dataset.menuPlacement = 'bottom'
      if (anchor) anchor.dataset.overlayPlacement = 'bottom'
    } else if (card.dataset.menuPlacement === 'bottom') {
      delete card.dataset.menuPlacement
      if (anchor?.dataset.overlayPlacement === 'bottom') {
        delete anchor.dataset.overlayPlacement
        anchor.style.position = ''
        anchor.style.inset = ''
        anchor.style.height = ''
        anchor.style.pointerEvents = ''
      }
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
      if (card) {
        const anchor = card.querySelector?.('[class*="overlayAnchor"]')
        if (shouldPlaceMenuBelow(card, null, win)) {
          card.dataset.menuPlacement = 'bottom'
          if (anchor) {
            anchor.dataset.overlayPlacement = 'bottom'
            anchor.style.position = 'absolute'
            anchor.style.inset = '0'
            anchor.style.height = '100%'
            anchor.style.pointerEvents = 'none'
          }
        } else if (card.dataset.menuPlacement === 'bottom') {
          delete card.dataset.menuPlacement
          if (anchor?.dataset.overlayPlacement === 'bottom') {
            delete anchor.dataset.overlayPlacement
            anchor.style.position = ''
            anchor.style.inset = ''
            anchor.style.height = ''
            anchor.style.pointerEvents = ''
          }
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
    'add-file': {
      name: '上传媒体或文件',
      icon: 'add-file',
      description: '从本地选择文件或图片',
      keywords: ['文件', '添加', '上传', '媒体', 'wenjian', 'tianjia', 'file', 'upload', 'add-file', 'addfile', 'add'],
    },
    'add-from-library': {
      name: '从资产库选择',
      icon: 'add-from-library',
      description: '从统一资产库选择素材',
      keywords: ['资产', '素材', '资产库', '素材库', 'zichan', 'sucai', 'library', 'add-from-library'],
    },
    'add-from-product': {
      name: '从商品库选择',
      icon: 'add-from-product',
      description: '从商品库选择要介绍的商品',
      keywords: ['商品', '产品', '商品库', '产品库', 'shangpin', 'chanpin', 'product', 'add-from-product'],
    },
    'add-from-inspiration': {
      name: '从灵感库选择',
      icon: 'add-from-inspiration',
      description: '从灵感库选择参考作品',
      keywords: ['灵感', '灵感库', 'linggan', 'inspiration', 'add-from-inspiration'],
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
    'add-file': {
      name: 'Upload media or files',
      icon: 'add-file',
      description: 'Add files',
      keywords: ['file', 'upload', 'add'],
    },
    'add-from-library': {
      name: 'Choose from asset library',
      icon: 'add-from-library',
      description: 'Choose from the asset library',
      keywords: ['library', 'asset', 'add'],
    },
    'add-from-product': {
      name: 'Choose from product library',
      icon: 'add-from-product',
      description: 'Choose a product to feature',
      keywords: ['product', 'catalog', 'add'],
    },
    'add-from-inspiration': {
      name: 'Choose from inspiration library',
      icon: 'add-from-inspiration',
      description: 'Choose a reference work',
      keywords: ['inspiration', 'library', 'add'],
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
 * Reverse lookup dictionary: English display name -> canonical raw command name.
 */
export const EN_NAME_TO_RAW = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMAND_I18N.en).map(([raw, conf]) => [conf.name, raw])
  )
)

/**
 * Resolve canonical raw command name from any alias or localized display name.
 * @param {string} name
 * @returns {string}
 */
export function resolveRawCommandName(name) {
  if (!name || typeof name !== 'string') return name || ''
  return ZH_NAME_TO_RAW[name] || EN_NAME_TO_RAW[name] || name
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
 * Trigger the native file input element rendered in composer card.
 * Throttled to avoid duplicate triggers across wrapper layers.
 * @param {Document} [doc]
 * @returns {boolean}
 */
let lastFileInputTriggerTime = 0
export function triggerNativeFileInput(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false
  const now = Date.now()
  if (now - lastFileInputTriggerTime < 300) return true
  lastFileInputTriggerTime = now
  const fileInput = doc.querySelector?.('[data-composer-card] input[type="file"]')
  if (fileInput) {
    fileInput.click()
    return true
  }
  const attachBtn = doc.querySelector?.(
    '[data-composer-card] button[aria-label="添加附件"], [data-composer-card] button[aria-label="Add attachment"]'
  )
  if (attachBtn) {
    attachBtn.click()
    return true
  }
  return false
}

/**
 * Whitelist of commands allowed in the composer "+" / slash menu.
 * Only the four plus-menu commands are retained;
 * all other native host commands are concealed to keep the menu clean and focused.
 */
export const ALLOWED_COMMAND_NAMES = Object.freeze(new Set([
  'add-file',
  'add-from-library',
  'add-from-product',
  'add-from-inspiration',
]))

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

  // 0. Ensure 'add-file' exists even if Host has not restarted yet
  const hasAddFile = allRows.some((row) => {
    const raw = row.rawName || resolveRawCommandName(row.name) || row.name
    return raw === 'add-file'
  })
  const baseRows = hasAddFile
    ? allRows
    : [{ name: 'add-file', description: '上传媒体或文件 / Upload media or files' }, ...allRows]

  // 1. Filter by allowed command whitelist
  const allowedRows = baseRows.filter((row) => {
    const rawName = row.rawName || resolveRawCommandName(row.name) || row.name
    return ALLOWED_COMMAND_NAMES.has(rawName)
  })

  // 2. Localize name, description and assign matching icon
  const localized = allowedRows.map((row) => {
    const rawName = row.rawName || resolveRawCommandName(row.name) || row.name
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
 * Coerce one command contribution into the current `description: () => string`
 * contract. The 0.1.5 host CALLS `contribution.description()` while it
 * synthesizes menu candidates, so a contribution still written against the
 * older string-valued shape throws inside the host, which drops the entire
 * `command` source and leaves the composer `+` menu empty. A compliant
 * contribution is returned untouched.
 * @param {any} contribution
 * @returns {any} the same contribution, or a copy whose description is callable
 */
export function normalizeCommandContribution(contribution) {
  if (!contribution || typeof contribution !== 'object') return contribution
  const { description } = contribution
  if (typeof description === 'function') return contribution
  const text = description === undefined || description === null ? '' : String(description)
  return { ...contribution, description: () => text }
}

/**
 * Best-effort repair of contributions registered before this wrapper was
 * installed: plugin load order decides who registers first, and a late
 * wrapper cannot retroactively normalize an early registration. Reads the
 * runtime registry defensively — when the host keeps it somewhere else this
 * reports `false` and caller behaviour is unchanged.
 * @param {any} commandUi
 * @returns {boolean} whether at least one entry needed and received repair
 */
export function repairRegisteredCommandContributions(commandUi) {
  const registry = commandUi?.live?.contributions
  if (!registry || typeof registry.entries !== 'function' || typeof registry.set !== 'function') return false
  let repaired = false
  for (const [name, contribution] of [...registry.entries()]) {
    if (!contribution || typeof contribution.description === 'function') continue
    registry.set(name, normalizeCommandContribution(contribution))
    repaired = true
  }
  return repaired
}

/**
 * Detect the host-side throw caused by a string-valued contribution
 * description, without matching unrelated candidate failures.
 * @param {any} error
 * @returns {boolean}
 */
function isDescriptionContractError(error) {
  const message = error && typeof error.message === 'string' ? error.message : ''
  return /description is not a function/u.test(message)
}

/**
 * Read one service method together with how the service owns it.
 *
 * A context hands every service access back as a fresh proxy over the service,
 * and reading a method off that proxy yields a callable that substitutes its
 * own receiver: a copy rebound to the proxy therefore runs the host method with
 * `this.ctx` pointing at the *accessing* scope instead of the service's own
 * context. The host dispatch path reads the dotted `remote.commands` through
 * `this.ctx`, so that lookup resolves against the wrong scope and throws
 * `cannot get property "remote.commands" without inject`. Reading the prototype
 * method (or the own value, for a plain-object service) yields the same
 * function the host reaches through its own receiver, so delegation can forward
 * the caller's receiver unchanged.
 *
 * @param {any} commandUi
 * @param {string} name
 * @returns {{ value: Function, own: boolean, descriptor?: PropertyDescriptor } | null}
 */
export function readServiceMethod(commandUi, name) {
  if (!commandUi) return null
  const descriptor = Object.getOwnPropertyDescriptor(commandUi, name)
  if (descriptor && typeof descriptor.value === 'function') {
    return { value: descriptor.value, own: true, descriptor }
  }
  let proto = Object.getPrototypeOf(commandUi)
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, name)
    if (desc && typeof desc.value === 'function') {
      return { value: desc.value, own: false, descriptor }
    }
    proto = Object.getPrototypeOf(proto)
  }
  // Nothing on the service itself (an own accessor, or a proxy hiding the
  // descriptor): the access-proxy callable is the only handle left, and it is
  // still called with the caller's receiver. `descriptor` carries whatever the
  // service owned, so disposal restores it verbatim.
  const viaProxy = commandUi[name]
  return typeof viaProxy === 'function' ? { value: viaProxy, own: true, descriptor } : null
}

/**
 * Method-wrap `commandUi` methods (register, candidates, dispatch, matchSpace, matchEnter) in-place safely.
 *
 * Every wrapper forwards the receiver the runtime handed it, so the host method
 * keeps running against the service's own context; nothing is re-bound to the
 * scope that happened to read the service.
 *
 * @param {any} commandUi
 * @param {any} locale
 * @returns {() => void} Disposer to restore original methods
 */
export function wrapCommandUi(commandUi, locale) {
  if (!commandUi || typeof commandUi.candidates !== 'function') {
    return () => {}
  }

  const originalCandidates = readServiceMethod(commandUi, 'candidates')
  const originalDispatch = readServiceMethod(commandUi, 'dispatch')
  const originalMatchSpace = readServiceMethod(commandUi, 'matchSpace')
  const originalMatchEnter = readServiceMethod(commandUi, 'matchEnter')
  const originalRegister = readServiceMethod(commandUi, 'register')
  if (!originalCandidates) return () => {}

  // 0. Wrap register so a contribution on the older string-valued contract
  //    still satisfies `description: () => string` (idempotent, disposer kept)
  const wrappedRegister = originalRegister ? function (contribution) {
    const receiver = this ?? commandUi
    return originalRegister.value.call(receiver, normalizeCommandContribution(contribution))
  } : null

  const localizeCandidates = async function (receiver, session, req) {
    const baseReq = req ? { ...req, query: '' } : { query: '' }
    const allRows = await originalCandidates.value.call(receiver, session, baseReq)
    return enhanceCommandCandidates(allRows, req, locale)
  }

  // 1. Wrap candidates to yield adaptive names, descriptions, and icons
  const wrappedCandidates = async function (session, req) {
    const receiver = this ?? commandUi
    try {
      return await localizeCandidates(receiver, session, req)
    } catch (error) {
      // A contribution registered before this wrapper would still kill the
      // whole source: repair the registry once, then retry with localization.
      if (isDescriptionContractError(error) && repairRegisteredCommandContributions(commandUi)) {
        try {
          return await localizeCandidates(receiver, session, req)
        } catch {}
      }
      return originalCandidates.value.call(receiver, session, req)
    }
  }

  // 2. Wrap dispatch to transparently unwrap localized candidate name to rawName
  const wrappedDispatch = originalDispatch ? function (pick) {
    const receiver = this ?? commandUi
    if (!pick || !pick.candidate) return originalDispatch.value.call(receiver, pick)
    const rawName = pick.candidate.rawName || resolveRawCommandName(pick.candidate.name)
    const normalizedCandidate = {
      ...pick.candidate,
      name: rawName,
    }
    if (rawName === 'add-file') {
      triggerNativeFileInput()
    }
    return originalDispatch.value.call(receiver, {
      ...pick,
      candidate: normalizedCandidate,
    })
  } : null

  // 3. Wrap matchSpace to map localized token to rawName
  const wrappedMatchSpace = originalMatchSpace ? function (session, token) {
    const receiver = this ?? commandUi
    if (!token || typeof token !== 'string' || !token.startsWith('/')) {
      return originalMatchSpace.value.call(receiver, session, token)
    }
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      return originalMatchSpace.value.call(receiver, session, `/${rawName}`)
    }
    return originalMatchSpace.value.call(receiver, session, token)
  } : null

  // 4. Wrap matchEnter to map localized line to rawName
  const wrappedMatchEnter = originalMatchEnter ? async function (session, line, signal, envelope) {
    const receiver = this ?? commandUi
    const trimmed = (line || '').trim()
    if (!trimmed.startsWith('/')) {
      return originalMatchEnter.value.call(receiver, session, line, signal, envelope)
    }
    const ws = trimmed.search(/\s/)
    const token = ws === -1 ? trimmed : trimmed.slice(0, ws)
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      const mappedLine = ws === -1 ? `/${rawName}` : `/${rawName} ${trimmed.slice(ws + 1)}`
      return originalMatchEnter.value.call(receiver, session, mappedLine, signal, envelope)
    }
    return originalMatchEnter.value.call(receiver, session, line, signal, envelope)
  } : null

  commandUi.candidates = wrappedCandidates
  if (wrappedRegister) commandUi.register = wrappedRegister
  if (wrappedDispatch) commandUi.dispatch = wrappedDispatch
  if (wrappedMatchSpace) commandUi.matchSpace = wrappedMatchSpace
  if (wrappedMatchEnter) commandUi.matchEnter = wrappedMatchEnter

  // Restore through the own descriptor: reading a method back through the
  // context proxy yields a fresh callable, so identity comparison on the proxy
  // would never match and the disposer would silently do nothing.
  const restore = (name, original, wrapped) => {
    const current = Object.getOwnPropertyDescriptor(commandUi, name)
    if (!current || current.value !== wrapped) return
    if (original.descriptor) Object.defineProperty(commandUi, name, original.descriptor)
    else delete commandUi[name]
  }

  return () => {
    restore('candidates', originalCandidates, wrappedCandidates)
    if (originalRegister && wrappedRegister) restore('register', originalRegister, wrappedRegister)
    if (originalDispatch && wrappedDispatch) restore('dispatch', originalDispatch, wrappedDispatch)
    if (originalMatchSpace && wrappedMatchSpace) restore('matchSpace', originalMatchSpace, wrappedMatchSpace)
    if (originalMatchEnter && wrappedMatchEnter) restore('matchEnter', originalMatchEnter, wrappedMatchEnter)
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

  // 3. Install skill multi-modal i18n enhancement (#1837)
  installSkillsI18n(ctx)
}

// ==========================================
// 4. Skills i18n & Multi-modal Bilingual Search (#1837)
// ==========================================

export const SKILL_I18N = {
  zh: {
    'ip-character-consistency-studio': {
      name: '角色一致性形象包',
      description: '根据角色设定和参考图，制作可持续复用的 AI IP 角色形象包',
      keywords: ['角色', '一致性', '形象', 'ip', '三视图', '立绘', '设定集', '漫画', '绘本', 'jiaose', 'js', 'yizhixing', 'xingxiang'],
    },
    'character-sheet-designer': {
      name: '角色设定集设计师',
      description: '生成高精度角色设定板，多角度三视图与表情姿态系统',
      keywords: ['角色', '设定', '三视图', '立绘', '表情', 'jiaose', 'sheji', 'sheting'],
    },
    'candid-character-photography': {
      name: '角色抓拍摄影',
      description: '设计具有偷拍感、窥视机位与抓拍质感的角色摄影提示词',
      keywords: ['摄影', '抓拍', '写真', '角色', 'sheying', 'zhuapai'],
    },
    'candid-swimsuit-photography': {
      name: '泳装摄影抓拍',
      description: '生成具有私人相册感与旅行亲密视角的泳装抓拍提示词',
      keywords: ['泳装', '摄影', '抓拍', 'yongzhuang', 'sheying'],
    },
    'surveillance-camera-photography': {
      name: '监控视角摄影',
      description: '固定机位、鱼眼广角与生活化记录质感的监控视角生图提示词',
      keywords: ['监控', '摄像头', 'cctv', 'jiankong'],
    },
    'nuyoah-portrait-character-designer': {
      name: '人物肖像气质设计',
      description: '将人物气质转为人脸结构、妆容与生图提示词',
      keywords: ['肖像', '人像', '妆容', '人脸', 'xiaoxiang', 'renwu'],
    },
    'generate-feature-cover': {
      name: '功能卡片封面生成',
      description: '生成主页功能卡片封面图与应用入口缩略图',
      keywords: ['封面', '卡片', '缩略图', 'fengmian'],
    },
    'baoyu-cover-image': {
      name: '宝玉文章封面图',
      description: '生成多维度高质感文章封面图（支持宽屏与方图）',
      keywords: ['封面', '文章', '宝玉', '配图', 'fengmian'],
    },
    'youtube-creator': {
      name: 'YouTube 视频创作者',
      description: 'YouTube 选题规划、脚本撰写与高点击率封面生成',
      keywords: ['youtube', '视频', '创作者', '脚本', 'shipin'],
    },
    'subagent-reports': {
      name: '子代理报告协作',
      description: '将复杂工作并发派发到独立子代理并落盘结果报告',
      keywords: ['子代理', '并发', '报告', '协作', 'zidaili', 'baogao'],
    },
    'spec-driven-development': {
      name: '规格驱动开发规范',
      description: '写代码前先写结构化规格作为真相源与质量门禁',
      keywords: ['规格', '设计', 'tdd', '门禁', 'guige', 'kaifa'],
    },
    'worktree-ops': {
      name: 'Git 工作树隔离操作',
      description: '标准工作树生命周期管理与多智能体隔离并发开发',
      keywords: ['工作树', 'worktree', 'git', '隔离', 'gongzuoshu'],
    },
    'agent-backup': {
      name: '智能体改前安全备份',
      description: '在文件变动前创建、检查与恢复代码快照',
      keywords: ['备份', '快照', '恢复', '回滚', 'beifen'],
    },
    'agent-self-evolution': {
      name: '自主根因免疫自进化',
      description: '从故障提取根因、建立防复发硬门禁并推动自我进化',
      keywords: ['进化', '根因', '自进化', '免疫', 'jinhua', 'genyin'],
    },
    'agents-md': {
      name: '智能体规范维护瘦身',
      description: '诊断、编写与精简 AGENTS.md 常驻硬约束',
      keywords: ['规范', '瘦身', '约束', 'guifan', 'shoushen'],
    },
    'superpowers-zh': {
      name: 'AI 编程方法论专家',
      description: '规格驱动、分步规划、测试先行与代码审查专家',
      keywords: ['编程', '方法论', '测试', '开发', 'biancheng'],
    },
    'prompt-engineer': {
      name: '提示词架构工程师',
      description: '系统提示词架构设计、思维链与提示词评测优化',
      keywords: ['提示词', 'prompt', '指令', 'tishici'],
    },
    'frontend-developer': {
      name: '前端开发专家',
      description: '现代 Web 技术栈、UI 组件实现与性能调优',
      keywords: ['前端', 'react', 'vue', 'ui', 'qianduan'],
    },
    'backend-architect': {
      name: '后端架构专家',
      description: '服务端高并发系统设计、数据库与 API 接口开发',
      keywords: ['后端', '架构', '数据库', 'api', 'houduan'],
    },
    'ui-designer': {
      name: 'UI 视觉设计专家',
      description: '视觉设计系统、组件库与高美感界面交互设计',
      keywords: ['设计', 'ui', '视觉', '界面', 'sheji'],
    },
    'code-review-expert': {
      name: '代码审查专家',
      description: '严谨建设性的代码质量、安全与可维护性审查',
      keywords: ['代码', '审查', '评审', 'review', 'daima', 'shencha'],
    },
    'growth-hacker': {
      name: '增长黑客策略专家',
      description: '数据驱动的裂变闭环、获客漏斗优化与业务增长',
      keywords: ['增长', '黑客', '运营', '裂变', 'zengzhang'],
    },
    'bitmap-vectorize': {
      name: '位图矢量化转换',
      description: '将截图、照片转换为精确的 SVG 矢量代码',
      keywords: ['位图', '矢量', 'svg', '转矢量', 'weitu', 'shiliang'],
    },
    'ego-browser': {
      name: 'Ego 真实浏览器代理',
      description: '自动化操控真实浏览器完成网页操作与端到端取证',
      keywords: ['浏览器', '网页', '自动化', '爬虫', 'liulanqi'],
    },
  },
  en: {},
}

/**
 * Resolve localized display name for a skill.
 * @param {string} rawName
 * @param {string} [fallbackDesc]
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveSkillDisplayName(rawName, fallbackDesc, locale) {
  const lang = getActiveLang(locale)
  if (lang !== 'zh') return rawName
  const config = SKILL_I18N.zh[rawName]
  if (config?.name) return config.name
  return rawName
}

/**
 * Resolve localized description for a skill.
 * In Chinese locale, prefixes the canonical English rawName to retain clarity.
 * @param {string} rawName
 * @param {string} [fallbackDesc]
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveSkillDescription(rawName, fallbackDesc, locale) {
  const lang = getActiveLang(locale)
  if (lang !== 'zh') return fallbackDesc || ''
  const config = SKILL_I18N.zh[rawName]
  const desc = config?.description || fallbackDesc || ''
  if (!desc) return rawName
  if (desc.includes(rawName)) return desc
  return `${rawName} · ${desc}`
}

/**
 * Calculate match relevance score for a skill candidate.
 * Higher score means better match. Returns undefined if not matched.
 * @param {{ name: string, rawName?: string, description?: string }} candidate
 * @param {string} rawQuery
 * @param {'zh' | 'en'} lang
 * @returns {number | undefined}
 */
export function scoreSkillCandidate(candidate, rawQuery, lang) {
  const query = (rawQuery || '').trim().toLowerCase()
  if (!query) return 1

  const name = (candidate.name || '').toLowerCase()
  const rawName = (candidate.rawName || candidate.name || '').toLowerCase()
  const desc = (candidate.description || '').toLowerCase()
  const config = SKILL_I18N[lang]?.[rawName]
  const keywords = (config?.keywords || []).map((k) => k.toLowerCase())

  // 1. Exact matches
  if (name === query || rawName === query) return 1000

  // 2. Chinese display name prefix match
  if (name.startsWith(query)) return 600 - (name.length - query.length)

  // 3. English rawName prefix match
  if (rawName.startsWith(query)) return 500 - (rawName.length - query.length)

  // 4. Chinese display name substring match
  const nameIdx = name.indexOf(query)
  if (nameIdx >= 0) return 400 - nameIdx

  // 5. English rawName substring match
  const rawIdx = rawName.indexOf(query)
  if (rawIdx >= 0) return 300 - rawIdx

  // 6. Keywords match (pinyin, tags, synonyms)
  for (const kw of keywords) {
    if (kw === query) return 250
    if (kw.startsWith(query)) return 220
    if (kw.includes(query)) return 200
  }

  // 7. Description prefix match
  if (desc.startsWith(query)) return 180

  // 8. Description substring / intent keyword match
  const descIdx = desc.indexOf(query)
  if (descIdx >= 0) return 150 - Math.min(50, descIdx)

  return undefined
}

/**
 * Enhance skill candidates by localizing names, descriptions, and filtering with smart multi-modal scores.
 * @param {Array<{ name: string, rawName?: string, description?: string, hint?: string, icon?: string }>} allSkills
 * @param {{ query?: string }} req
 * @param {any} locale
 * @returns {Array<{ name: string, rawName: string, description?: string, hint?: string, icon?: string }>}
 */
export function enhanceSkillCandidates(allSkills, req, locale) {
  if (!Array.isArray(allSkills)) return []
  const lang = getActiveLang(locale)

  // 1. Map to localized display items with rawName preserved
  const localized = allSkills.map((skill) => {
    const rawName = skill.rawName || skill.name
    const displayName = resolveSkillDisplayName(rawName, skill.description, locale)
    const displayDesc = resolveSkillDescription(rawName, skill.description, locale)
    return {
      ...skill,
      name: displayName,
      rawName,
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
    const score = scoreSkillCandidate(candidate, rawQuery, lang)
    if (score !== undefined) {
      scored.push({ candidate, score, index })
    }
  })

  // 3. Stable sort: higher score first
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.candidate)
}

/**
 * Wrap a single skill InputTriggerSource to adaptively support bilingual queries and onPick unwrap.
 * @param {any} source
 * @param {any} locale
 * @returns {any} wrapped source
 */
export function wrapSkillInputTriggerSource(source, locale) {
  if (!source || typeof source.candidates !== 'function') return source
  const originalCandidates = source.candidates
  const originalOnPick = source.onPick

  const wrappedCandidates = async function (session, req) {
    // Request full list with empty query so enhanceSkillCandidates can perform multi-modal matching
    const baseReq = req ? { ...req, query: '' } : { query: '' }
    let allSkills = []
    try {
      allSkills = await originalCandidates.call(this, session, baseReq)
    } catch {
      allSkills = await originalCandidates.call(this, session, req)
    }
    return enhanceSkillCandidates(allSkills, req, locale)
  }

  const wrappedOnPick = function (pick) {
    if (!pick || !pick.candidate) {
      return typeof originalOnPick === 'function' ? originalOnPick.call(this, pick) : { text: '' }
    }
    // Transparently resolve to canonical English rawName so host dsh-tool-skill recognizes it!
    const rawName = pick.candidate.rawName || pick.candidate.name
    return { text: `/${rawName} ` }
  }

  source.candidates = wrappedCandidates
  if (typeof originalOnPick === 'function') {
    source.onPick = wrappedOnPick
  }

  return source
}

/**
 * Wrap inputTriggers to intercept both existing and late-registered skill sources.
 * @param {any} inputTriggers
 * @param {any} locale
 * @returns {() => void} Disposer
 */
export function wrapInputTriggersSkills(inputTriggers, locale) {
  if (!inputTriggers) return () => {}

  const wrappedSources = new WeakSet()

  const wrapExisting = () => {
    const sources = inputTriggers.live?.sources || []
    for (const src of sources) {
      if (src && src.trigger === '/' && src.name === 'skill' && !wrappedSources.has(src)) {
        wrapSkillInputTriggerSource(src, locale)
        wrappedSources.add(src)
      }
    }
  }

  // 1. Wrap currently registered skill sources
  wrapExisting()

  // 2. Intercept future registrations via registerSource
  const originalRegisterSource = inputTriggers.registerSource
  if (typeof originalRegisterSource === 'function') {
    inputTriggers.registerSource = function (src) {
      if (src && src.trigger === '/' && src.name === 'skill') {
        wrapSkillInputTriggerSource(src, locale)
        wrappedSources.add(src)
      }
      return originalRegisterSource.call(this, src)
    }
  }

  return () => {
    if (originalRegisterSource) {
      inputTriggers.registerSource = originalRegisterSource
    }
  }
}

/**
 * Install the adaptive skill localization into client runtime.
 * @param {{ inject?: Function }} ctx
 */
export function installSkillsI18n(ctx) {
  if (!ctx || typeof ctx.inject !== 'function') return
  ctx.inject(['inputTriggers', 'locale'], (inner) => {
    inner.effect?.(() => {
      const inputTriggers = inner.inputTriggers || inner.get?.('inputTriggers')
      const locale = inner.locale || inner.get?.('locale')
      return wrapInputTriggersSkills(inputTriggers, locale)
    }, 'omnimux: skill i18n & query enhancement')
  })
}
