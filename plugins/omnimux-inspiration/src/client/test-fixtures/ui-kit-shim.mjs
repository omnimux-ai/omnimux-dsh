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
  // The real field reports every keystroke through `onValueChange` and applies
  // its own debounce; the shim calls back synchronously, which is what lets a
  // gate drive a search without waiting on a timer.
  onChange: (event) => props.onValueChange?.(event.target.value),
})

export const DropdownSelect = ({ value, options, className, onChange, 'aria-label': ariaLabel }) => {
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
      ? h('ul', { role: 'listbox' }, items.map((option) => h(
        'li',
        {
          key: String(option.value),
          role: 'option',
          'aria-selected': option.value === value,
          // The kit's items call `onChange` with their value and close the menu;
          // without this a gate could read the menu but never use it.
          onClick: () => {
            onChange?.(option.value)
            setOpen(false)
          },
        },
        option.label,
      )))
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
 *
 * `title` and `closeLabel` are rendered too, because the kit's `Modal` primitive
 * puts both in the header: without them a gate could not tell a titled dialog
 * from an untitled one, which is exactly the difference between「作品详情」and a
 * library-item preview.
 */
export const ModalDialog = ({ open, children, footer, title, closeLabel, onClose }) => (open
  ? h(
    'div',
    { role: 'dialog', 'aria-label': typeof title === 'string' ? title : undefined },
    typeof title === 'string' ? h('h2', null, title) : title,
    closeLabel
      ? h('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose })
      : null,
    children,
    footer,
  )
  : null)

export const CopyButton = () => h('button', { type: 'button' }, null)

/**
 * Mirrors the kit's DOM contract where a gate has to read it: the real
 * `PageHeader` renders the title as an `<h1>`, the subtitle as a `<p>` and a
 * close control. The shim used to drop `title`/`subtitle` into element
 * attributes, which left "the page heading is on screen" unassertable on a
 * rendered tree.
 */
export const PageHeader = ({ title, subtitle, onClose, closeTitle, children, ...rest }) => h(
  'div',
  rest,
  typeof title === 'string' ? h('h1', null, title) : title,
  subtitle ? h('p', null, subtitle) : null,
  children,
  onClose
    ? h('button', { type: 'button', 'aria-label': closeTitle, onClick: onClose })
    : null,
)

export const EmptyState = ({ icon, title, description, action, children }) => h(
  'div',
  { className: 'dshUk-EmptyState-emptyState' },
  icon ? h('div', { className: 'dshUk-EmptyState-iconWrap' }, icon) : null,
  title ? h('h2', { className: 'dshUk-EmptyState-title' }, title) : null,
  description ? h('p', { className: 'dshUk-EmptyState-description' }, description) : null,
  action ? h('div', { className: 'dshUk-EmptyState-actions' }, action) : null,
  children,
)

export const createSidebarEntry = () => ({})

export const createStageStore = () => ({})
