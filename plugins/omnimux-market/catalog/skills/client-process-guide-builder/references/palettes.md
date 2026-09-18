# Brand Palettes

Default tokens. Parameterise per brand — but **change at most the accent / accent2 pair**. Keep dark base + lavender tint architecture. Swapping the whole palette breaks the document's visual coherence.

---

## HTML CSS custom properties (drop into `:root`)

```css
:root {
  --bg:        #0a0a0f;   /* page background — near-black with violet undertone */
  --surface:   #111118;   /* cards / sections */
  --surface2:  #18181f;   /* hover / nested cards */
  --border:    #1e1e2e;   /* dividers, card borders */
  --accent:    #6c63ff;   /* electric violet — primary accent */
  --accent2:   #a89cff;   /* lavender — secondary accent, hyperlinks */
  --gold:      #ffb547;   /* highlight only — use ≤ 2× per document */
  --text:      #e2e0f0;   /* body text */
  --muted:     #8886a8;   /* secondary text, captions */
  --white:     #ffffff;
  --radius:    12px;
  --radius-lg: 20px;
  --font:      'Inter', 'Helvetica Neue', Arial, sans-serif;
  --mono:      'SF Mono', 'Fira Code', monospace;
}
```

**Note:** the `--font` declaration names Inter first but does NOT load it. Inter is a "best-effort" hint for users who happen to have it installed; everyone else falls back to Helvetica Neue / Arial. **Do not** add `<link>` tags for Google Fonts — it violates the zero-external-dependencies rule.

---

## reportlab PDF palette (HexColor)

```python
from reportlab.lib import colors

BRAND_DARK   = colors.HexColor("#0D0D1A")   # near-black navy — cover background, bottom bar
BRAND_MID    = colors.HexColor("#1A1A3E")   # deep indigo — intro box, closing card
BRAND_ACCENT = colors.HexColor("#6C63FF")   # electric violet — accent strips, stage badges, headings
BRAND_LIGHT  = colors.HexColor("#F4F3FF")   # lavender tint — callout backgrounds, table alt rows
BRAND_GOLD   = colors.HexColor("#FFB547")   # amber — highlight reserved (use rarely)
WHITE        = colors.white
GRAY_TEXT    = colors.HexColor("#4A4A6A")   # body text on light backgrounds
LIGHT_RULE   = colors.HexColor("#D8D6F5")   # table grid lines, soft rules
```

---

## Brand swap recipe

If the client's brand is not violet, perform exactly these substitutions:

| Token | HTML | PDF | What to set |
|---|---|---|---|
| Primary accent | `--accent` | `BRAND_ACCENT` | Their primary brand colour |
| Secondary accent | `--accent2` | (derive) | A 30% lighter tint of the primary |
| Light surface | (n/a) | `BRAND_LIGHT` | A very pale (95% lightness) tint of the primary |

**Do not touch:**
- `--bg`, `--surface`, `--surface2`, `--border` (dark scaffolding stays dark)
- `BRAND_DARK` (cover stays near-black)
- `--gold` / `BRAND_GOLD` (gold is universal highlight — leave alone)
- `--text`, `--muted`, `GRAY_TEXT` (typography colours stay neutral)

---

## Quick palette presets for common brand colours

| Brand colour family | `--accent` | `--accent2` | `BRAND_LIGHT` |
|---|---|---|---|
| Electric violet (default) | `#6c63ff` | `#a89cff` | `#F4F3FF` |
| Emerald green | `#10b981` | `#6ee7b7` | `#F0FDF6` |
| Crimson red | `#dc2626` | `#fca5a5` | `#FEF2F2` |
| Royal blue | `#2563eb` | `#93c5fd` | `#EFF6FF` |
| Amber/orange | `#f59e0b` | `#fcd34d` | `#FFFBEB` |
| Magenta/pink | `#db2777` | `#f9a8d4` | `#FDF2F8` |
