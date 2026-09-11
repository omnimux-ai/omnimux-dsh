# Color craft rules

Universal color rules that apply across brands and surfaces. The design tokens supply the palette; this file governs distribution, contrast, and discipline.

## 60-30-10 palette distribution (The Four Layers)

A disciplined interface allocates pixels across four distinct functional layers:

| Layer | Surface Coverage | Tokens | Role |
|---|---|---|---|
| **Neutrals** | 70%–90% | `--bg`, `--surface`, `--fg`, `--muted`, `--border` | Foundations, cards, layout dividers, body text |
| **Accent** (Single) | 5%–10% | `--accent` / `--dsw-alias-primary` | Key interactive actions, active navigation indicator |
| **Semantic** | 0%–5% | `--success`, `--warn`, `--danger` | Status badges, error banners, destructive alerts |
| **Effect** | <1% | Glows, subtle shadows | Focus rings, active indicator dot |

## Accent rationing

The most frequent visual fatigue tell in AI generation is **accent overuse**.
- **Maximum 2 visible accent targets per viewport**: E.g., one eyebrow chip + one primary CTA button; or one selected sidebar item + one progress indicator.
- Links on the same screen should use underlined `--fg` rather than repeating the saturated accent color.
- Demote secondary buttons to ghost or hairline-border neutral styles (`--surface` + `--border`).

## Contrast & Legibility Floors (WCAG 2.2 AA)

- **Normal text (≤16px)** on background: minimum **4.5:1** contrast ratio.
- **Large text (≥18px or 14px bold)**: minimum **3:1** contrast ratio.
- **Interactive UI components & borders**: minimum **3:1** against adjacent surfaces.

## Dark mode discipline

- Avoid pure black (`#000000`) and pure white (`#ffffff`). Both cause retinal vibration and harsh glare.
  - Dark background baseline: `#0f0f12` or `#141418`.
  - Dark foreground text: `#ececed` or `#f2f2f4`.
- On dark backgrounds, use **translucent hairline borders** (`1px solid rgba(255, 255, 255, 0.08~0.12)`) instead of heavy opaque borders. Translucent borders naturally adapt across nested card levels.
