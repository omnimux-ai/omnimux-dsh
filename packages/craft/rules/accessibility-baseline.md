# Accessibility baseline craft rules

Deterministic accessibility rules that guarantee basic usability, screen reader support, and keyboard navigable interfaces.

## Minimum target sizing

- Touch and pointer click targets must have an effective area of at least **44×44px** (desktop compact buttons can drop to **32×32px** with adequate padding).
- Consecutive buttons or icon controls must maintain at least **8px** separation to prevent unintended activation.

## Keyboard navigation & focus discipline

- Every interactive element (`<button>`, `<a>`, `<input>`, `<select>`) must have an explicit `:focus-visible` state.
- **Never remove outline without an explicit replacement**: Setting `outline: none;` without providing an alternative focus ring is strictly forbidden.
- Focus rings must use high-contrast styling: `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`.

## Semantic markup & labels

- Icon-only buttons must provide an `aria-label` describing the action (e.g. `aria-label="Close dialog"`).
- Form inputs must be explicitly associated with a `<label>` via `htmlFor` / `id` or wrapped inside a `<label>`.
- Images must have meaningful `alt` text or `aria-hidden="true"` if purely decorative.
