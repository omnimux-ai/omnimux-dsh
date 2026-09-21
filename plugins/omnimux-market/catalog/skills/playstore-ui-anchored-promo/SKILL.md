# Play Store UI-Anchored Promo

A creative mold for Play Store / App Store listing visuals. The aesthetic is restrained, premium, and screenshot-led: a single phone speaks, one headline frames it, brand color holds the field, the secondary color punctuates. Swap the app, the screenshots, the brand colors, the language — keep the composition.

## When to use this pattern

**Good fit**
- Android / iOS apps with clean modern UI worth showing literally
- Brands with a strong primary + accent color pair (works best when primary is dark — navy, deep teal, charcoal, plum — so the phone glows against it)
- Product categories where the UI itself is the proof (finance, fitness, productivity, dashboards, scheduling, ordering)
- Listings where the user wants 4–6 screenshot cards plus one feature graphic, in any language

**Bad fit**
- Lifestyle / consumer apps that need real-people contextual photography
- Games (different convention: key art over UI)
- Apps with sparse, ugly, or NDA-protected screens — the pattern depends on showing the UI

## Hook & opening — the structural move

The "hook" of a Play Store card is the **headline above the phone**. Structural rule: **noun + concrete benefit, max 2 lines, max ~5 words per line, breakable at the slash**.

Invented examples (English):
- "Sign in / in seconds"
- "Everything / in one place"
- "Confirm tasks / with one tap"
- "Track progress / in real time"
- "Wrap up / in seconds"

Translation move (e.g. Spanish equivalents): "Confirma tareas / con un toque", "Sigue el progreso / en tiempo real".

**Swap the subject, keep the move.** New app, new vertical, new language — same rhythm: short verb-phrase line one, short qualifying line two. Never write a sentence. Never use a period. Never enumerate features.

## Narrative arc (across the card set)

Treat the 4–6 cards as a **funnel through the user's first session**, not a feature list. Each card = one moment a real user lives through, in order:

1. **Entry** — login / onboarding / first-open screen. Headline = "fast start" energy.
2. **Home / overview** — the main dashboard. Headline = "everything in one place" energy.
3. **Core action #1** — the primary verb of the app (confirm, pay, log, send). Headline = "one tap" / "in seconds" energy.
4. **Live state** — tracking / real-time / status. Headline = "as it happens" energy.
5. **Close-out** — finishing / saving / sharing. Headline = "done" energy.
6. *(optional)* Differentiator screen — a screen no competitor has.

Pick the screenshots **in this order**, not in the order the user uploaded them. If a beat has no matching screenshot, drop the beat; do not invent screens.

## Visual style spec

**Vertical 9:16 cards**

- **Background**: solid brand-primary fill, with a soft circular radial glow (slightly lighter than primary, ~15% lift) centered behind the phone. No gradients across the whole frame, no patterns, no photographic textures.
- **Phone mockup**: a single Android Pixel-style device (or iPhone if app is iOS), centered horizontally, lower-mid vertically, with a slight 3D tilt (~5° Y-rotation), realistic soft shadow beneath. Bezels thin, dark. No hand holding the phone.
- **Screenshot inside the phone**: the uploaded screenshot, pixel-accurate, full-bleed inside the device frame. This is the part that must not be retouched, retyped, or "improved."
- **Headline**: white, bold geometric sans-serif (Inter / SF Pro / Manrope vibe), centered, top ~12% of frame, exactly 2 lines, line-break where indicated.
- **Divider**: thin (~3 px equivalent) horizontal line in brand-secondary, ~60 px wide, centered directly under the headline. Quiet, not decorative.
- **Corner accents**: brand-secondary, minimal — 3–5 small dots and one thin diagonal line tucked near a corner or beside the phone. Never bordering the whole frame. Never more than one accent cluster.
- **Negative space**: at least 25% of the frame must be empty primary color. Resist the urge to fill.

**Horizontal feature graphic (1024×500)**

- 50/50 split. Left half: brand wordmark + one tagline line (e.g. "Real-time task management"). Right half: **two phones overlapping**, the back phone partially occluded by the front, both extending slightly past the bottom edge for a sense of weight.
- Front phone = the main / dashboard screen. Back phone = a "moment of action" screen (confirm, pay, send).
- Same background system as vertical cards (solid primary + radial glow).
- Native generation aspect ratio is **16:9 at 2K**; the exact 1024×500 size is achieved by cropping equal margins from top and bottom and LANCZOS-resizing. See `references/post_process.md`.

**On-screen text policy (the part that bites you)**

- Outside the phone: **only** the headline (+ tagline on the feature graphic). **No** bullet lists, **no** feature names, **no** URLs, **no** Google Play / App Store badges, **no** star ratings, **no** "Available now."
- Inside the phone: every string the source UI shows, preserved verbatim. Do not let the model paraphrase, translate, or "tidy" any in-UI text.

## Voice & persona

- **Tone**: calm-authoritative. Product-confident without exclamation marks.
- **Persona**: the app speaking about itself in a flat declarative register. Never a customer testimonial voice, never imperatives shouted at the user.
- **Pacing**: terse. If a headline reads naturally with "the" or "a", delete the article.
- **Language**: match the app's UI language exactly. If the screenshots are in Portuguese, every headline is Portuguese, spelled correctly, with proper accents (á, ã, ç, ê). If German, with umlauts. If Japanese, in native script. Verify spelling in the rendered output before delivering.

## CTA mechanic

There is no spoken CTA on the cards — the **store install button is the CTA**, and the headline pre-sells it. The feature graphic's tagline is the closest thing to a CTA; keep it to a single noun phrase, no verbs in the imperative ("Real-time task management", not "Manage your tasks now").

## Hard rules / do-not-regress

These were learned the hard way. Treat each as non-negotiable.

1. **Inspect every uploaded asset before prompting.** Pull each screenshot down with `get_asset` and identify which screen it is (login, home, detail, confirm, etc.). Map screenshots → narrative beats. Only then write prompts. This is what makes the prompts faithful.
2. **In every image prompt, enumerate the on-screen UI strings the model must preserve verbatim** — exact button labels, exact list items, exact address strings, exact currency, exact observation fields. This anchors typography and prevents the model from inventing or translating UI text. See `references/prompt_recipe.md` for the template.
3. **Close every prompt with a CRITICAL constraint block**: "DO NOT redraw, retype, or alter ANY text on the phone screen — must look pixel-identical to the source UI." Capitalized. At the end. Always.
4. **Use the typography-preserving image model.** In this environment that is `gpt-image-2.5-sunburst`. Do **not** use nano-banana / nano-banana-2 for these composites — small UI typography inside the phone mockup garbles. If only nano-banana is available, surface this to the user before generating.
5. **Generation params for vertical cards**: `aspect_ratio="9:16"`, `resolution="2K"`. Pass the matching screenshot as `image_urls=[input:image-N]`. One generate call per card; run in parallel.
6. **Feature graphic** is generated at `aspect_ratio="16:9"`, `resolution="2K"`, then **post-processed to exactly 1024×500** by cropping equal top/bottom margins and LANCZOS-resizing. 1024×500 is not a native aspect. See `references/post_process.md`.
7. **Heredoc Python is blocked in this shell.** To run any PIL post-processing, `write` a `.py` file first, then `python3 path/to/file.py`. Do not attempt heredoc syntax.
8. **Logo color adaptation.** If the user provides an official logo lockup and the background is dark, explicitly instruct the model how the logo should adapt: "render wordmark and figurative elements in PURE WHITE, KEEP the [brand-secondary accent element] in brand-secondary color." Without this, the model leaves the logo as delivered and it disappears into the dark fill.
9. **Verify each output with `get_asset` after generation.** Confirm (a) the in-UI text matches the source screenshot character-for-character, (b) the headline is spelled correctly in the target language, (c) accents/diacritics rendered, (d) no rogue text crept in (no fake "Download on the App Store" badges, no invented star ratings).
10. **Deliver as registered asset_ids, never raw URLs.** For the feature graphic specifically, the resized PNG must be `register_asset`-ed so the user receives a clean `asset_id`. For vertical cards, the generation output asset_ids are fine to return directly.
11. **Minimal-text discipline.** Even if the user lists 12 features, the cards carry one headline each. Do not negotiate this down to "just a small subtitle." The screenshot is the subtitle.
12. **Never invent screens.** If the user uploads three screenshots, deliver three cards (or fewer). Do not synthesize a fake "settings" screen to round out a set of five.

## Deliverable shape

Return a single markdown reply containing:

1. A short one-line confirmation of what was made (e.g. "5 vertical promo cards + 1 feature graphic for [App Name]").
2. A bulleted list of vertical card `asset_id`s, each prefixed with its narrative beat label and the headline used.
3. The feature graphic `asset_id` on its own line (if requested).
4. **One** short closing line offering to iterate on copy, accent style, or mockup device. Omit this line if the user already pre-approved the direction.

Do not paste raw image URLs into the reply. Do not include the prompts used. Do not include generation params.

## References

- `references/prompt_recipe.md` — the prompt template for vertical cards and the feature graphic, with the on-screen-text enumeration pattern.
- `references/post_process.md` — the PIL crop+resize routine for converting a 16:9 generation into an exact 1024×500 feature graphic, written as a standalone `.py` file (heredoc-safe).
- `references/headline_library.md` — beat-indexed headline patterns in EN / PT / ES that obey the 2-line, no-period, no-article rule.