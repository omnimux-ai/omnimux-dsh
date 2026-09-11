# Anti-AI-slop rules

Concrete, deterministic rules that distinguish "designed by a professional product designer" from "default LLM output." Several rules below are auto-enforced by the deterministic `lintArtifact` linter — violating an enforced rule is treated as a P0 regression that blocks acceptance.

## The seven cardinal sins (P0 — Fatal)

These are the patterns the linter blocks at P0 (must-fix immediately):

1. **Default Tailwind indigo as accent** — strictly forbidden hexes: `#6366f1`, `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`. The active design tokens provide `--accent` / `--dsw-alias-primary`; use them. Hardcoded Indigo is the textbook AI tell.
2. **Two-stop "trust" gradient on the hero** — purple→blue, blue→cyan (`#3b82f6`→`#06b6d4`), indigo→pink. A flat surface (`var(--bg)` / `var(--surface)`) + intentional typography beats this every time.
3. **Emoji as UI / feature icons** — `✨`, `🚀`, `🎯`, `⚡`, `🔥`, `💡`, `🌟`, `🏆` inside `<h*>`, `<button>`, `<li>`, or elements with class containing `icon`. Use 1.6–1.8px-stroke monoline SVG with `currentColor`.
4. **Sans-serif on display text when the seed binds a serif** — `h1/h2` must use `var(--font-display)`, not a hardcoded fallback like `Inter`, `Roboto`, or `system-ui`.
5. **Rounded card with a colored left-border accent** — the canonical "AI dashboard tile" shape (`border-radius > 0` combined with `border-left: Npx solid color`). Drop either the border-radius (0px) or the left border. Use hairline borders all-round (`1px solid var(--border)`).
6. **Invented metrics** — "10× faster", "99.9% uptime", "3× more productive", "zero-downtime". Either pull from a verified source or use a labelled stub / placeholder (`—`).
7. **Filler copy & mock data** — `lorem ipsum`, `feature one / two / three`, `placeholder text`, `sample content`. An empty section is a composition problem to solve with structure, not by inventing meaningless words.

## Soft tells (P1 — Should fix)

- **Standard "Hero → Features → Pricing → FAQ → CTA" sequence with no variation**: Introduce at least one unconventional section (e.g. interactive comparison, full-bleed quote, inline interactive demo).
- **External placeholder image CDNs**: (`images.unsplash.com`, `placehold.co`, `picsum.photos`). Fragile and obvious. Use clean inline SVG or localized placeholder frames.
- **More than 12 raw hex values outside `:root`**: Signals that tokens were not honored. Move all theme colors to CSS variables.
- **`var(--accent)` used 6+ times in rendered body**: Cap at 2 visible uses per screen (e.g. one badge/eyebrow + one primary CTA). Demote others to foreground or muted.
- **ALL CAPS without letter-spacing**: Any `text-transform: uppercase` must pair with `letter-spacing: >= 0.06em`.

## Polish tells (P2 — Nice to fix)

- **Decorative blob / wave SVG backgrounds**: Meaningless geometry that dates the interface.
- **Perfect symmetric layout with no visual tension**: Alternating density (one compact section, one breathing section) reads as intentional rhythm.

## How to add soul without breaking the rules

Aim for **~80% proven patterns + ~20% distinctive choice**. The 20% should live in:
- One bold visual move — an unexpected type scale, a single decisive contrast, an asymmetric grid break.
- Voice and microcopy — "Start tracking" beats generic "Get started"; specific verbs beat abstract nouns.
- One delightful micro-interaction — a subtle hover transition, a count-up animation, an intuitive keyboard shortcut hint.
