# Product Reel Skill

A monthly-refresh, text-led, 18-second product ad. No voiceover. No UGC creator. Pure brand typography on a solid brand-colour ground, designed for Instagram Reels and Stories.

---

## 1. When to use this pattern

**Best for:**
- Single-product highlights (e.g. electronics, appliances, gear, accessories)
- Monthly "deal of the month" or clearance pushes
- Any product with a PDP (product detail page) URL
- Reels, Stories, TikTok (9:16, 1080×1920)

**Not suited for:**
- Multi-product range ads (use a carousel or separate reel per product)
- Brand awareness plays with no specific product/price (no price = no scene 3)
- Horizontal/square formats

---

## 2. Hook & Opening (Scene 1 — 2 seconds)

**Structural move: Product + Label interrupt.**
The product hero image fills the frame on a primary-to-white gradient. A compact hook overlay names the product immediately. An accent-colour category pill sits in the lower region to signal the category and quality promise before the viewer consciously reads it.

**Example overlay (invent fresh per product):**
- Overlay: `[Product Name] · [key spec]`
- Accent pill label: `[CATEGORY LABEL]`

**Swap rule:** Replace product name, key spec, and category label. Keep the gradient background, the compact two-line typography, and the accent pill. The product image must composite cleanly on the gradient — always source from the PDP hero shot.

---

## 3. Narrative Arc

| Beat | Scene | Duration | Purpose |
|------|-------|----------|---------|
| 1 · Hook | Scene 1 | 2 s | Name the product, signal the category |
| 2 · Specs trust | Scene 2 | 4 s | Staggered spec bullets build credibility fast |
| 3 · Price hero | Scene 3 | 4 s | Was/Now price contrast — strongest conversion beat |
| 4 · Trust bar | Scene 4 | 4 s | Overcome objection: address buyer hesitation |
| 5 · CTA / end card | Scene 5 | 4 s | Brand close + shop prompt |
| **Total** | | **18 s** | |

**Arc name:** `product-credibility-price-trust-close`. Never reorder. The price reveal in scene 3 is the emotional peak; everything before builds to it, everything after lands the close.

---

## 4. Scene-by-Scene Visual & Text Spec

### Scene 1 — Product Hero (2 s)
- **Background:** primary-to-white gradient (`[primary]` → `#FFFFFF`), generated fresh each run
- **Product image:** web-fetched hero shot from PDP, composited on gradient
- **Text overlays:**
  - Line 1: `[Product Name] · [spec highlight]` — white, DM Sans Bold, ~52–60px, upper-center
  - Line 2 (accent pill): `[CATEGORY LABEL]` — accent colour, DM Sans Bold, ~36px, lower-center
- **Animation:** static or gentle fade-in; no distracting motion — the product image carries the visual weight

### Scene 2 — Specifications (4 s)
- **Background:** primary solid `[primary]` — no product image
- **Text overlays (staggered upSwipe-in, ~0.3 s apart):**
  - Header: `SPECIFICATIONS` — accent colour, Anton or DM Sans Bold, ~48px, top
  - Bullet 1: primary spec line (e.g. core component + capacity)
  - Bullet 2: secondary spec (e.g. configuration / mode)
  - Bullet 3: condition / grade (e.g. `[condition label]`)
  - Bullet 4: warranty (e.g. `12-Month Warranty Included`)
  - Bullets: white, DM Sans Regular/Medium, ~36–40px
- **Caption outline:** brand outline colour on white text (brand caption style)

### Scene 3 — Price Hero (4 s)
- **Background:** primary solid `[primary]` with subtle center glow (slightly lighter primary radial)
- **Text overlays:**
  - Strike-through "was" price: `WAS [original_price]` — white, dimmed opacity (~60%), DM Sans, ~40px, above center
  - **Hero price:** `[sale_price]` — accent colour, Anton Bold, **148px**, zoom-in animation from ~80% scale
  - Sub-line: `Free delivery` — white, DM Sans, ~32px, below hero price
- **This is the emotional peak.** The large accent-colour price must dominate. No other visual clutter.

### Scene 4 — Trust Bar (4 s)
- **Background:** primary solid `[primary]`
- **Text overlays (staggered upSwipe-in):**
  - Header: `WHY SHOP WITH US` — accent colour, Anton or DM Sans Bold, ~48px
  - Item 1: trust item (e.g. `30-Day Returns`)
  - Item 2: trust item (e.g. `Free Standard Shipping`)
  - Item 3: trust item (e.g. `Quality Checked & Tested`)
  - Items: white, DM Sans, ~36–40px
- **Hard rule:** These three trust items are brand constants. Do not invent new copy at runtime. They address the primary objection for the buyer.

### Scene 5 — End Card / CTA (4 s)
- **Background:** dark primary with the brand logo centred — use registered ref `ref:brand-logo`
  - Logo URL (brand constant): supply the brand's logo asset URL
  - Register as `ref:brand-logo` before image generation
- **Text overlays:**
  - CTA pill: `SHOP NOW` — accent colour, DM Sans Bold, bounce-in animation, ~52px
  - URL: the brand's store URL — white, DM Sans, ~32px, below CTA

---

## 5. Visual Style Spec

| Parameter | Value |
|-----------|-------|
| Format | 9:16, 1080×1920 |
| Duration | 18 seconds |
| Style | Brand/product (not UGC) |
| Primary bg | Brand primary colour |
| Accent colour | Brand accent colour |
| Text colour | White `#FFFFFF` |
| Caption outline | Brand outline colour |
| Primary font | DM Sans (all scenes) |
| Display font | Anton (price hero, section headers) |
| Camera grammar | Static / locked-off generated frames; no handheld simulation |
| Shot length | Scene 1: 2 s · Scenes 2–5: 4 s each |
| Voiceover | **None** — text-led only |
| Music volume | 0.35 (higher than UGC; no VO competing) |
| On-screen text | Kinetic (staggered upSwipe-in for lists; zoom-in for price; bounce-in for CTA) |

---

## 6. Music

- Style: upbeat, confident, tech-forward instrumental — no vocals
- Duration: 20 s (covers the 18 s video with a small tail)
- Volume: 0.35
- Generate fresh each run via `music_generate`; do not reuse tracks across months (avoids viewer fatigue)

---

## 7. Voice & Persona

There is **no voiceover**. The "voice" of this ad is typographic:
- Accent colour = authority, value signal, CTA
- White = information, clarity
- Anton = impact moments (price, section headers)
- DM Sans = readable body copy

Tone archetype: **calm-authoritative retail**. Not hyped, not whisper. The pricing does the talking.

---

## 8. CTA Mechanic

**On-screen card close** — spoken CTA is absent by design.

- CTA wording: `SHOP NOW` (never change this wording)
- URL: the brand's store URL (always include, always white, always below the CTA pill)
- Animation: bounce-in on the SHOP NOW pill draws the eye after the logo settles
- No comment-bait. No "link in bio". No swipe-up copy. The URL is self-contained.

---

## 9. Variable Inputs (change every month)

| Input | Source | Where used |
|-------|--------|-----------|
| Product page URL | User brief | `web_fetch` to extract all below |
| Product name | PDP title | Scene 1 hook overlay + Scene 2 label |
| Key spec | PDP | Scene 1 hook overlay |
| Primary spec line | PDP specs table | Scene 2 bullet 1 |
| Secondary spec | PDP | Scene 2 bullet 2 |
| Condition / grade | PDP | Scene 2 bullet 3 |
| Warranty period | PDP | Scene 2 bullet 4 |
| Original (was) price | PDP | Scene 3 strike-through |
| Sale price | PDP | Scene 3 hero price |

---

## 10. Brand Constants (never change)

| Constant | Value |
|----------|-------|
| Brand name | the brand |
| Primary colour | brand primary hex |
| Accent colour | brand accent hex |
| Caption outline | brand outline hex |
| Logo end card URL | the brand's logo asset URL |
| Logo asset ref | `ref:brand-logo` |
| CTA wording | `SHOP NOW` |
| Store URL | the brand's store URL |
| Trust item 1 | brand trust item 1 |
| Trust item 2 | brand trust item 2 |
| Trust item 3 | brand trust item 3 |

---

## 11. Hard Rules / Do-Not-Regress

These are constraints baked into the format:

1. **No voiceover.** Never add a voiceover or spoken audio track. Text overlays carry all messaging.
2. **Music volume = 0.35.** Do not default to a lower volume (e.g. 0.15 used in VO ads).
3. **DM Sans is the preferred caption font.** Do not substitute Roboto, Inter, or system defaults.
4. **Scene 5 must use the registered logo asset** (`ref:brand-logo`), not a regenerated version or placeholder.
5. **The trust items in Scene 4 are fixed copy.** Do not rewrite, paraphrase, or invent alternatives at runtime.
6. **`SHOP NOW` is the only CTA wording.** Do not use "Buy Now", "Order Now", "Visit Us", etc.
7. **Price hero font size = 148px Anton.** Do not scale down "for aesthetics" — dominance is intentional.
8. **Scene order is fixed.** Do not swap scenes 3 and 4, do not skip the trust bar, do not add scenes.
9. **Generate all 5 scene backgrounds in parallel** with `music_generate` to minimise wall-clock time.
10. **Product image must come from the PDP hero shot** (`web:image_1` after `web_fetch`). Do not use stock imagery.