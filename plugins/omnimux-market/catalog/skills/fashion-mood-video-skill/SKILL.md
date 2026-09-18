# Fashion Mood Video Skill

A vertical 9:16 Pinterest editorial format. One outfit per scene. Emotional progression across
scenes. Frame-approval gate before any animation. Brand end card via text overlays only.

---

## 1. When to use this pattern

**Best fit:**
- Women's fashion: dresses, rompers, separates, beach cover-ups, occasion wear
- Multi-product showcases where each item has a distinct mood or use-case
- Brands wanting a "lifestyle editorial" feel rather than white-background e-commerce
- Target platforms: Pinterest, Instagram Reels, TikTok — vertical 9:16

**Not a fit:**
- Single-product demos (no scene arc needed)
- Menswear or non-apparel where movement/drape isn't the story
- Ads requiring voiceover or music-driven pacing (this format is silent/caption-only)

---

## 2. Hook & opening

**Structural move: Mood-title scene entry.**
Each scene opens with a text label that names the emotional state *before* the outfit registers.
The viewer reads the mood, then the outfit confirms it visually. This is an editorial naming move,
not a product-feature move.

**Example (invented, for a hypothetical lifestyle apparel brand):**
> Scene 1 label: "🌙 Slow morning energy"
> Scene 2 label: "☕ Cozy café day"
> Scene 3 label: "🌿 Out exploring"

**Swap rule:** Replace the emotional text and emoji with ones that fit the new brand's scene
progression. Keep the structure: emoji + short emotional phrase (≤6 words). The outfit is always
the visual payoff, never mentioned in the label.

---

## 3. Narrative arc

Design 4–7 scenes. Each scene is ~3–5 seconds of animation. Suggested emotional progressions:

| Beat | Mood archetype | Example label | Visual energy |
|------|---------------|---------------|---------------|
| 1 | Introspective / melancholy | "🌙 Slow morning energy" | Slow, drifting entrance |
| 2 | Coastal / carefree | "☀️ Sun & sea day" | Light twirl, movement away from camera |
| 3 | Adventurous / aspirational | "🧭 Out exploring" | Confident diagonal stride |
| 4 | Social / flirty | "✨ Night out energy" | Casual cross-frame stroll |
| 5 | Glam / self-possessed | "👑 Owning the room" | Walk in, hip shift, hold |
| 6 | Quietly powerful | "🔥 Calm and unbothered" | Centered still sway, barely moves |
| Final | Brand end card | (brand name + tagline + URL) | Static white background, text overlays |

Arc shape: open soft → build energy → peak confidence → quiet power → brand close.

You may collapse to 4 scenes or expand to 7. The arc shape should still feel like a journey,
not a flat product list.

---

## 4. Visual style spec

| Dimension | Spec |
|-----------|------|
| Aspect ratio | 9:16 vertical |
| Aesthetic | Pinterest fashion editorial — clean, elevated, not commercial |
| Background policy | **Never white** for outfit scenes. Match backdrop to scene mood (see reference table below). White is reserved for the end card only. |
| Camera grammar | Mix of: locked-off wide, slight push-in, handheld-feel for energy scenes |
| Shot composition | Full-body preferred. Headless crops at collarbone for product-focus scenes. Back-facing framing kept throughout for back-detail scenes. |
| On-screen text | Minimal. Scene label fades in per scene. End card: brand name + tagline + URL. No other text. |
| Color palette | Backdrop should complement (not match) the outfit. Avoid busy patterns. Prioritize atmospheric environments over studio. |
| Shot length | 3–5s per scene. End card: 3–4s. |

**Background → mood mapping (reference):**

| Mood | Background |
|------|-----------|
| Melancholy / introspective | Overcast park, empty café, foggy street |
| Beach / coastal | Sandy shore, turquoise water, golden hour beach |
| Travel / adventure | Airport terminal, cobblestone street, European square |
| Girls' night / social | Warm restaurant interior, string lights, rooftop bar |
| Glam / selfie | Luxury hotel lobby, marble steps, city skyline at dusk |
| Quiet / still power | Neutral indoor, soft window light, minimal room |

---

## 5. Voice & persona

**No voiceover. No music in the generated video asset.** (User may add music externally.)

**On-screen persona:** The woman in each scene *is* the persona — she embodies the mood label.
She is not a model performing; she is a real person living that moment.

**Text tone:** Scene labels are emotional and first-person ("When you're feeling…", "Owning the
room", "Calm and unbothered"). Never product-descriptive ("Blue wrap dress").

**Pacing fingerprint:** Slow emotional open → building energy in the middle acts → quiet
authority in the penultimate scene → clean brand close. Resist the urge to make every scene
high-energy.

---

## 6. Production sequence (approval gates)

> This is the creative discipline that defines this pattern — two hard gates protect quality and
> credits.

**Gate 1 — Scene plan approval (before any image generation):**
Present the full scene plan to the user: scene count, mood labels, background choices, movement
type per scene, credit estimate. Do not generate a single frame until the user says go.

**Gate 2 — Frame approval (before any animation):**
Generate all scene start frames using uploaded outfit images as I2I references. Show ALL frames
to the user. Do not animate anything until the user approves. If a frame is wrong (wrong outfit,
wrong background, AI-hallucinated text on clothing), fix it at no charge before moving forward.

---

## 7. Movement palette

Vary movement across scenes. Never assign the same movement type to two consecutive scenes.

| Movement type | Use for | Description |
|--------------|---------|-------------|
| Slow walk in from left, pause mid-frame | Melancholy / introspective | Enters from left edge, pauses slightly off-center, weight shifts |
| Casual stroll across frame L→R | Social / fun / girls' night | Easy walk through frame, natural pace |
| Confident diagonal stride | Travel / adventure / aspirational | Enters corner, walks diagonally across, exits or stops |
| Walk in, stop off-center, hip shift | Glam / selfie / main character | Struts in, lands off-center, slight weight shift, holds |
| Centered subtle sway, no walking | Headless / product-focus / still | Planted center-frame, barely-there sway, static energy |
| Back to camera, happy twirl, ends back-pose | Beach / cover-up / back detail | Begins back-facing, does a light twirl, settles back-facing |
| Barely-there sway, completely centered | Quiet power / defiant still | No walking, centered, minimal movement — presence over action |

---

## 8. End card spec

- **Background:** Clean white — the *only* white background in the video
- **Content:** Brand name (large) + tagline (medium) + website URL (small)
- **Method:** All text added via `text_overlays` in assemble_video. **Never bake brand text into
  a generated image.** AI image models hallucinate brand names and URLs; overlays are exact.
- **Duration:** 3–4 seconds
- **No model/person in end card** — product or logo image optional, but clean white + text is
  sufficient

---

## 9. Hard rules (do-not-regress)

Treat every rule below as non-negotiable.

1. **Always show frames before animating.** No exceptions, even if the user seems in a hurry.
   Frame fixes are free; animation re-runs cost credits.

2. **Always calculate credits and get explicit approval before rendering.** State the estimate
   in the scene plan. Do not begin animation until the user confirms.

3. **Never use white backgrounds for outfit scenes.** White is end-card only. Even "neutral"
   scenes get a contextual environment (soft indoor light, window, minimal room).

4. **Movement must be varied.** If you catch yourself assigning "walks toward camera" or
   "walks to center" to more than one scene, stop and redistribute from the movement palette.

5. **Face visible by default.** Unless the user specifies headless or back-facing, frame the
   model with face in shot.

6. **Headless crop rule.** When user requests headless: crop at collarbone, center in frame,
   do not cut at waist or thigh.

7. **Back-view rule.** When user requests back-facing (e.g., to show cutout or back detail):
   model begins and ends back-facing camera throughout the entire clip.

8. **End card text via overlays only.** Never generate an image with brand name or URL baked in.
   Always add via text_overlays in the assembly step.

9. **No credit charges for AI errors.** If a frame has hallucinated text, wrong outfit, or
   wrong background due to model error (not user change), regenerate at no charge.

10. **If product images fail to load from CDN:** Ask the user to re-upload directly. Never
    describe or guess the outfit from a URL that 404s.

11. **Provide direct video URL alongside embedded player link.** Some users cannot see embedded
    video players; always surface the raw URL.

---

## 10. Applying this pattern to a new product/brand

The outfit, brand, and product are always swappable. The locked elements are:

| Locked (the skill) | Swappable (the product) |
|-------------------|------------------------|
| Mood-label scene entry | Brand name, tagline, URL |
| Frame-before-animation gate | Specific outfits / products |
| Non-white mood-matched backgrounds | Number of scenes (4–7) |
| Varied movement palette | Specific emotional arc labels |
| End card via text overlays only | Target platform (if aspect ratio changes) |
| Credit approval gate | |

To apply to a new brand: collect outfit images, design a 4–7 scene emotional arc that fits the
brand voice, map each scene to a background environment and movement type from the palettes above,
run through the two approval gates, assemble with brand-specific end card text.