# A+ Brand Content Modules

A+ Content (formerly Enhanced Brand Content) is an extended section of the product page available to brand-registered sellers. It's designed to tell a richer brand story with large images and formatted copy.

This skill produces 7 A+ modules in a specific narrative order. Each module has a defined purpose, ratio, and size.

## The 7 modules

| # | Module | Purpose | `aspect_ratio` |
|---|--------|---------|----------------|
| 1 | Hero Banner (Brand Banner) | Brand identity + product category intro | `21:9` |
| 2 | Pain Points / Scenarios | Customer problem the product solves | `3:2` |
| 3 | Selling Points / Feature Matrix | Core features and benefits grid | `3:2` |
| 4 | Key Ingredients / Technology | What's inside — materials, ingredients, tech | `3:2` |
| 5 | Efficacy / Comparison | Proof of results or before/after/vs competitor | `3:2` |
| 6 | How to Use | Step-by-step usage instructions | `3:2` |
| 7 | Brand Endorsement / Qualifications | Certifications, heritage, awards, social proof | `21:9` |

All A+ modules generated at `resolution="2K"`. Amazon's required A+ ratios are `21:9` for banner modules (top and bottom) and `3:2` for middle content modules.

## Module-by-module guidance

### Module 1 — Hero Banner (21:9)

**Goal:** Immediate brand recognition and category framing. The first thing a customer sees in the A+ section.

**Contents:**
- Brand name/logo (small, tasteful placement)
- Product category or tagline (1 short line)
- Flagship product hero shot (clean, well-lit)
- Background that reflects brand personality (lifestyle scene, gradient, or textured surface)

**Text rule:** Keep text minimal — one headline + optional sub-line. Too much text in a 21:9 banner becomes unreadable on mobile.

### Module 2 — Pain Points / Scenarios (3:2)

**Goal:** Make the customer nod in recognition — "yes, that's my problem". Empathy before solution.

**Contents:**
- 2–4 common frustrations the customer experiences
- Each paired with a small illustration or icon
- Short headline: "Tired of...?"
- Sets up the product as the answer

**Structure:** Can be a grid (2x2) of problems, or a split-screen "without/with" comparison.

### Module 3 — Selling Points / Feature Matrix (3:2)

**Goal:** Rapid-fire communication of the product's core features and benefits.

**Contents:**
- 3–6 features laid out in a grid
- Each feature has: icon + short name (2–4 words) + 1-line benefit
- Connect features to benefits — not just "BPA-free" but "BPA-free → Safe for daily use"

**Structure:** 2x2, 2x3, or 3x2 grid depending on feature count.

### Module 4 — Key Ingredients / Technology (3:2)

**Goal:** Show what's special under the hood — materials, ingredients, technology, craftsmanship.

**Contents:**
- 2–4 hero ingredients/components highlighted
- Each with a visual (ingredient photo, tech diagram, material close-up)
- Short explanation of why it matters
- For food/beverages: ingredient origin, sourcing story
- For skincare: active ingredient names with benefit
- For electronics: chip/tech name with function
- For apparel: fabric composition with properties

### Module 5 — Efficacy / Comparison (3:2)

**Goal:** Show proof. Data, before/after, or competitor comparison.

**Contents:**
- **Before/after:** Split composition showing transformation
- **Data chart:** Simple bar or percentage visualization
- **Us vs. Them table:** Feature comparison with checkmarks/X marks (must be factual, not disparaging)
- **Testimonial quote:** Short customer quote with name + star rating visualization

**Rule:** Claims must be verifiable. Don't say "10x better" without a measurable comparison.

### Module 6 — How to Use (3:2)

**Goal:** Remove usage confusion and objection.

**Contents:**
- 3–5 numbered steps
- Each step: number + short action label + small illustration or product photo
- Linear left-to-right or top-to-bottom flow
- Clear arrows between steps if flow isn't obvious

**Structure:** Horizontal row of steps works best in 3:2 ratio.

### Module 7 — Brand Endorsement (21:9)

**Goal:** Close with trust. Final emotional/rational push before purchase.

**Contents options:**
- Certification badges (organic, vegan, FDA-registered, etc. — must be real and owned)
- Brand heritage story ("Since 1952" or founder photo)
- Awards and press mentions
- Sustainability commitments
- Mission statement in one line

**Text rule:** Same as Module 1 — minimal text, banner format.

## A+ design principles

### Embedded text must be large
Amazon compresses A+ images aggressively. Always use **>30pt font size** for body text and **>40pt** for headlines. Text that looks fine pre-upload becomes blurry post-compression.

### Mobile cropping safety
- Keep all critical content **out of the outer 5%** of the frame
- Center the key message horizontally
- Mobile displays crop edges; desktop shows full width

### Narrative coherence
The 7 modules should read like a story:
1. Hero → brand personality (emotion)
2. Pain points → empathy (why they need something)
3. Features → solution (what the product does)
4. Ingredients → credibility (how it works)
5. Efficacy → proof (it actually works)
6. How to use → simplicity (easy for me)
7. Brand → trust (I can buy with confidence)

### Unified visual identity
- Same color palette across all 7 modules
- Same typography hierarchy
- Same icon style
- Same product appearance (enforced by using main image as reference)
- Same lighting temperature across all photographed elements

### What NOT to do in A+ content
- Don't duplicate information already in the bullet points (above the A+ section)
- Don't include external URLs, social handles, or contact info
- Don't use competitor brand names
- Don't use language like "best", "#1", "guarantee" without documented proof
- Don't include reviews/ratings pulled from other sources

## Template location

All 7 A+ modules share a single template file: `references/aplus_modules_template.md`

The template is organized by module number — read the section for the module you're generating.
