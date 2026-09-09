import { createSystem, defaultConfig } from '@chakra-ui/react'
// Keep only component infrastructure; no global reset, root font or document palette.
const { globalCss: _global, preflight: _reset, ...base } = defaultConfig
export const formSystem = createSystem({ ...base, theme: { ...base.theme, keyframes: {}, semanticTokens: {} } }, {
  cssVarsRoot: '.omnimux-forms-body', preflight: false, globalCss: {}, disableLayers: true,
  theme: { semanticTokens: { colors: {
    fg: { DEFAULT: { value: 'var(--dsw-alias-label-primary)' }, muted: { value: 'var(--dsw-alias-label-secondary)' }, subtle: { value: 'var(--dsw-alias-label-secondary)' } },
    bg: { DEFAULT: { value: 'var(--dsw-alias-bg-base)' }, subtle: { value: 'var(--dsw-alias-bg-layer-1)' }, muted: { value: 'var(--dsw-alias-bg-layer-2)' }, panel: { value: 'var(--dsw-alias-bg-elevated)' } },
    border: { DEFAULT: { value: 'var(--dsw-alias-border-l2)' }, emphasized: { value: 'var(--dsw-alias-border-l3)' } },
  } } },
})
export const control = {
  boxSizing: 'border-box', height: '32px', minHeight: '32px', borderRadius: '8px', fontSize: '14px',
  color: 'var(--dsw-alias-label-primary)', bg: 'var(--dsw-alias-bg-layer-1)',
  border: '1px solid var(--dsw-alias-border-l2)',
  _focusVisible: { outline: '2px solid var(--dsw-alias-brand-primary)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
}
export const secondary = { ...control, paddingInline: '12px', _hover: { bg: 'var(--dsw-alias-interactive-bg-hover)' } }
export const primary = { ...secondary, bg: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-label-primary-inverted)', _hover: { opacity: 0.88 } }
