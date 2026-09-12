/**
 * Test-only stand-in for `dsh-ui-kit` used by the bundled render gate in
 * `inspiration-section-render.test.js`.
 *
 * The production kit is bundled from `@deepseek-ai/dsh-client-ui-primitives`,
 * whose lib imports `.module.css` files; esbuild cannot follow those into a
 * single JS bundle. The gate under test is plugin-owned — `InspirationSection`
 * decides whether to render the platform dropdown at all — so substituting the
 * kit's leaf components keeps the assertion about the plugin's own code.
 *
 * `DropdownSelect` mirrors the kit's public DOM contract where it matters:
 * the trigger is a `<button>` carrying the caller's `aria-label`,
 * `aria-haspopup="listbox"` and the option list is a `role="listbox"` sibling.
 * Shim and kit therefore expose the same query surface.
 */

import React from 'react'

const h = React.createElement

export const Button = ({ children, leadingIcon, ...rest }) => h('button', { type: 'button', ...rest }, leadingIcon ?? null, children)

export const Divider = () => h('hr', null)

export const FilterBar = ({ filters, search, tools, ...rest }) => h('div', rest, filters, search, tools)

export const Tabs = ({ items, activeId, onChange }) => h(
  'div',
  null,
  (items || []).map((item) => h(
    'button',
    { key: item.id, type: 'button', 'data-tab': item.id, 'aria-pressed': activeId === item.id, onClick: () => onChange && onChange(item.id) },
    item.label,
  )),
)

export const SearchField = (props) => h('input', {
  type: 'search',
  'aria-label': props['aria-label'],
  value: props.value ?? '',
  readOnly: true,
})

export const DropdownSelect = ({ value, options, className, 'aria-label': ariaLabel }) => {
  const [open, setOpen] = React.useState(false)
  const items = options || []
  const selected = items.find((option) => option.value === value)
  return h(
    'span',
    { className },
    h(
      'button',
      {
        type: 'button',
        'aria-label': ariaLabel,
        'aria-haspopup': 'listbox',
        'aria-expanded': open,
        onClick: () => setOpen((previous) => !previous),
      },
      h('span', null, selected ? selected.label : 'Select'),
    ),
    open
      ? h('ul', { role: 'listbox' }, items.map((option) => h('li', { key: String(option.value), role: 'option' }, option.label)))
      : null,
  )
}

export const ConfirmModal = ({ children, ...rest }) => h('div', rest, children)

export const Badge = ({ children, variant, ...rest }) => h('span', { 'data-variant': variant, ...rest }, children)

export const IconButton = ({ children, ...rest }) => h('button', { type: 'button', ...rest }, children)

export const MediaCard = ({ children, coverNode, ...rest }) => h('div', rest, coverNode, children)

export const InputField = (props) => h('input', {
  type: props.type ?? 'text',
  'aria-label': props.label ?? props['aria-label'],
  placeholder: props.placeholder,
  value: props.value ?? '',
  readOnly: typeof props.onChange !== 'function',
  disabled: Boolean(props.disabled),
  onChange: props.onChange,
  // The kit forwards blur like any other input event, and the import dialogs
  // classify a pasted link on it; without this the shim would hide that path.
  onBlur: props.onBlur,
})

/**
 * The kit's dialog renders the caller's `footer` slot, so the shim has to as
 * well: whether the import dialog can close itself on a 202 is asserted through
 * the buttons that live only in that slot.
 */
export const ModalDialog = ({ open, children, footer }) => (open ? h('div', null, children, footer) : null)

export const CopyButton = () => h('button', { type: 'button' }, null)

export const PageHeader = ({ children, ...rest }) => h('div', rest, children)

export const createSidebarEntry = () => ({})

export const createStageStore = () => ({})
