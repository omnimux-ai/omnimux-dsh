/**
 * The two frozen poster themes.
 *
 * The colours are a code-fixed design, not settings: the poster is a shareable
 * artifact and must look the same on every device. Only the theme choice is
 * user-controlled. Values use the same neutral language as the reference
 * artifact (white paper / obsidian black) rather than the X chrome.
 *
 * @module
 */

import type { PosterTheme } from './types.ts'

/** Canvas colours for one theme. */
export interface PosterThemeTokens {
  readonly id: PosterTheme
  readonly labelZh: string
  readonly labelEn: string
  readonly background: string
  readonly foreground: string
  readonly heading: string
  readonly secondary: string
  readonly divider: string
  /** Letter bubble shown when the avatar could not be loaded. */
  readonly avatarFallback: string
  readonly avatarFallbackText: string
  readonly watermark: string
}

export const POSTER_THEMES: Readonly<Record<PosterTheme, PosterThemeTokens>> = {
  light: {
    id: 'light',
    labelZh: '白底',
    labelEn: 'White',
    background: '#ffffff',
    foreground: '#0f1419',
    heading: '#0f1419',
    secondary: '#6b7280',
    divider: 'rgba(15, 20, 25, 0.10)',
    avatarFallback: '#0f1419',
    avatarFallbackText: '#ffffff',
    watermark: '#6b7280',
  },
  dark: {
    id: 'dark',
    labelZh: '黑底',
    labelEn: 'Black',
    background: '#0b0b0c',
    foreground: '#e7e9ea',
    heading: '#ffffff',
    secondary: '#8b98a5',
    divider: 'rgba(255, 255, 255, 0.14)',
    avatarFallback: '#e7e9ea',
    avatarFallbackText: '#0b0b0c',
    watermark: '#8b98a5',
  },
}

export const POSTER_THEME_ORDER: readonly PosterTheme[] = ['light', 'dark']

export const DEFAULT_POSTER_THEME: PosterTheme = 'light'

/** Narrows a stored value to a real theme, falling back to the default. */
export function parsePosterTheme(value: unknown): PosterTheme {
  return value === 'light' || value === 'dark' ? value : DEFAULT_POSTER_THEME
}
