# Retail Multi-Variant Carousel Sale

## 1. When to use this pattern

**Best fit:**
- Physical retail or appliance products with 2–4 colour/config variants, each at a distinct price point
- Facebook/Instagram carousel placements (1:1 square format)
- Campaigns that need both feature education AND a direct sale push in a single asset set
- Products where the interior, capacity, or hidden features are strong selling points (fridges, washing machines, storage, furniture)
- Retail sale events (markdown sale, clearance, limited-time promo)

**Does not suit:**
- Single-SKU products with no variants (use a simpler feature carousel)
- Story or Reel placements (wrong aspect ratio and swipe mechanic)
- Services or digital products (no physical feature imagery to exploit)
- Luxury positioning where "SALE" and starburst badges would undermine brand tone

---

## 2. Carousel structure — the two-carousel model

This pattern always produces **two distinct carousel sets**:

### Set A — Feature Carousel (one per variant)
5 cards that educate and qualify the buyer on one specific colour/variant.

| Card | Role | Visual anchor | Copy anchor |
|------|------|---------------|-------------|
| 1 | Lifestyle hero | Lifestyle/in-room shot of *this* variant | Short punchy headline + product name + warranty badge |
| 2 | Feature deep-dive 1 | Feature-specific image (tech/mechanism) | Feature headline + one-line benefit subtext |
| 3 | Feature deep-dive 2 | Feature-specific image (airflow / storage) | Feature headline + one-line benefit subtext |
| 4 | Feature deep-dive 3 | Feature-specific image (energy / crisper) | Feature headline + one-line benefit subtext |
| 5 | CTA close | Clean hero product shot | Checklist of 4–5 features + warranty pill + "Shop Now →" button |

**Key rule:** cards 2–4 use feature images *specific to that variant's asset set* where possible. Do not paste the same feature image across all variants if better variant-specific images exist.

### Set B — Sales Carousel (one unified carousel)
5 cards that drive the purchase decision across all variants.

| Card | Role | Content |
|------|------|---------|
| 1–N | Price card (one per variant) | Hero product shot LEFT half · Price block RIGHT half |
| N+1 | Interior proof | Loaded interior lifestyle shot + capacity/organisation headline |
| N+2 | Feature proof | Split shot (interior + hero detail) + feature bullets |

**Price card anatomy (hard rule — do not omit any element):**
- "ON SALE" red badge — top-right corner
- Brand name + colour name + short model descriptor
- "WAS $XXX" in grey with strikethrough
- Red starburst: "SAVE $XX"
- "NOW" label + the price number as the single dominant element on the card
- Warranty assurance line (e.g. "5-Year Warranty Included")
- Delivery/availability disclaimer in small print
- Full-width dark red footer banner: "LIMITED TIME SALE — [N] Colours Available"

---

## 3. Visual style spec

| Attribute | Feature carousel | Sales carousel |
|-----------|-----------------|----------------|
| Format | 1:1 square, 1080×1080 px | 1:1 square, 1080×1080 px |
| Model | gpt-image-2 (best text rendering) | gpt-image-2 |
| Brand colour | A deep, saturated brand base (e.g. a dark navy) | Match feature carousel base |
| Accent | Teal/cyan | Red (a strong sale red) |
| Font | Heavy extra-bold sans headlines | Heavy extra-bold sans for price |
| Logo placement | Brand wordmark top-left | Integrated into price block |
| Background | Product on matching or neutral bg | Clean white or very light grey |
| On-screen text | Bold headline + short subtext + badge | Price hierarchy dominates; minimal prose |
| White/light products | Use subtle grey background to separate product from card bg | Same rule applies |

**Resolution:** always request 2K / high-resolution output from the image model.

**Shot length / composition:**
- Feature cards: image fills ~60% of card; text in lower 30–40% with semi-transparent or solid colour band
- Price cards: strict left/right split — product image LEFT 50%, price block RIGHT 50%
- CTA card: product centred, checklist below, CTA button bottom-right quadrant

---

## 4. Hook & opening (Card 1 of feature carousel)

**Structural move:** *Lifestyle authority opener.* Lead with the product living in a real home environment — not a white-background studio shot. Pair with a 2–3 word benefit headline that names the buyer's life, not the product's specs.

**Invented generic example:**
> "Made for Mornings." — a hypothetical coffee-maker variant's feature carousel, Card 1

**Swap rule:** Keep the short declarative format ("Built for ___." / "Made for ___.") and the lifestyle image anchor. Swap the product, the room context, and the specific benefit claim to match the new product. Do not lead with the model number or price on Card 1.

**Warranty/trust badge:** A 5-Year Warranty (or equivalent trust signal) pill/badge on Card 1 doubles as social proof without cluttering the hero. Keep it.

---

## 5. Narrative arc

**Feature carousel arc:** *Aspiration → Evidence → Ownership*
1. (Card 1) Aspiration: "This fits your life"
2. (Cards 2–4) Evidence: Three specific reasons why — each backed by a real feature image
3. (Card 5) Ownership: "Here's everything you get — go get it"

**Sales carousel arc:** *Choice → Value proof → Confidence*
1. (Cards 1–N) Choice: One card per variant — "which colour is yours?"
2. (Card N+1) Value proof: Space / interior — "look how much you get"
3. (Card N+2) Confidence: Smart features — "you'll use this differently from your old one"

---

## 6. Voice & persona

- **Tone:** Calm-authoritative retail. Not hype. Not whisper. Clear, direct, benefit-first.
- **Persona archetype:** Knowledgeable store assistant — knows the spec, speaks to the life benefit, lets the product imagery do the emotional work.
- **Headline rhythm:** Short declarative (3–5 words). Sentence case. Period at the end for finality.
  - ✅ "Fresh for longer." / "More room. Less waste." / "Spacious Inside. Organised Always."
  - ❌ "EXPERIENCE THE DIFFERENCE TODAY!!!" / "Introducing the all-new..."
- **Subtext rhythm:** One benefit sentence, max 12 words. Factual. No jargon.
- **CTA wording:** "Shop Now →" on feature carousel. Sale footer uses "LIMITED TIME SALE" — direct, no softening.

---

## 7. CTA mechanic

- **Feature carousel CTA (Card 5):** On-screen button — teal pill, "Shop Now →", bottom-right of card. Paired with feature checklist (4–5 bullet points of key specs). Warranty pill reinforces commitment to buy.
- **Sales carousel CTA:** Implicit — the price dominates and acts as the CTA. No explicit button needed on price cards. Footer banner "LIMITED TIME SALE — N Colours Available" creates urgency + variant awareness.
- **No comment-bait.** No "link in bio." These are paid carousel units with native destination URLs — drive to product page directly.

---

## 8. Pre-production checklist (run this before generating any card)

1. **Inventory all product images.** Inspect every supplied asset. Build a map: which images belong to which variant; which are shared across variants.
2. **Confirm pricing for every SKU upfront.** WAS price, NOW price, and SAVE amount. Do not guess or approximate. Confirm before generating any sales card. *(Generating sales cards before prices are confirmed risks wasted regeneration rounds when the numbers turn out wrong.)*
3. **Note variant-specific spec differences.** E.g. energy star rating may differ between variants. Each price card and feature card must reflect the *correct* spec for *that* variant.
4. **Identify shared feature images.** Shared images (inverter compressor diagram, airflow diagram, etc.) can be reused across all variants' feature carousels — but only if they accurately represent that variant.
5. **Check background contrast for light-coloured products.** White or silver products on white backgrounds vanish. Specify a subtle grey or off-white background for those variants.

---

## 9. Hard rules / do-not-regress

Each of these is non-negotiable:

1. **Prices must be confirmed before generation.** Do not generate sales cards with assumed or placeholder prices. Ask the user to confirm WAS/NOW/SAVE for each SKU before starting.
2. **White/light products need a distinguishing background.** Always use a subtle grey or off-white card background when the product colour is white, cream, or silver. A white fridge on a white card is invisible.
3. **Energy star ratings (and equivalent spec badges) must be variant-accurate.** Variants can carry different ratings (e.g. one model at 4 stars while others are 5). Never apply a single rating to all variants without checking each SKU's spec sheet.
4. **Sales cards must have the full retail sale visual language:** red "ON SALE" badge, grey strikethrough WAS price, red starburst SAVE badge, oversized NOW price, dark red footer banner. A plain price card without this treatment looks like an organic post, not a sale ad.
5. **Feature images should be variant-specific where variant-specific assets exist.** Do not clone Card 2–4 images across all colour carousels if the asset map shows distinct feature images per variant.
6. **The NOW price number must be the visually dominant element on price cards.** All other elements (brand name, warranty, disclaimer) are subordinate in size and visual weight. If the layout makes the product image compete with the price for dominance, the price wins.
7. **Delivery/availability disclaimers belong on every sale card** — small print, but present. Do not omit for aesthetic reasons.