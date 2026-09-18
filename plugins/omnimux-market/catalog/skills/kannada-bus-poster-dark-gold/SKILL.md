# Kannada Bus Poster — Dark Gold Night-Travel Pattern

## 1. When to use this pattern

**Best fit:**
- South Indian travel companies (bus, sleeper coach, tour operators) needing A4/A3 print-ready or digital posters in Kannada (or other Indic scripts).
- Overnight / premium / AC sleeper services where the "luxury night journey" visual metaphor resonates.
- Brands that want a dark, cinematic poster aesthetic with gold branding (common in Karnataka/Andhra bus industry).
- Workflow where the customer supplies a real bus photo and a list of facilities / route stops.

**Poor fit:**
- Daytime budget bus services where the dark-premium feel is incongruent.
- Posters requiring full Latin-only text (the font-handling logic is tuned for Indic + limited Latin).
- Video or motion deliverables (this pattern is static PIL composition only).

---

## 2. Visual Style Spec

| Element | Specification |
|---|---|
| Canvas | A4 portrait @ 150 dpi → **1240 × 1754 px** |
| Background | Dark navy gradient (`#0a0a2e` → `#1a1a4e`) with scattered white starfield dots and 2–3 diagonal light-beam overlays (low-opacity white polygons) |
| Primary brand color | **Gold** `#ffd700` with outer-glow blur effect for headings |
| Accent colors | White `#ffffff` for body text; Green `#00cc44` for facility checkmarks; Red `#cc2200` for CTA button |
| Borders | Thin gold hairline outer border; ornamental diamond corners (drawn in PIL with polygon fills) |
| Bus photo | Full-width strip (roughly rows 800–1500). Night-road feel: add under-bus glow ellipse (gold, blurred), headlight glow cone (white/yellow, low opacity). Scale source image to fill width, crop vertically centered. |
| On-screen text | Heavy Kannada headings (NotoSansKannada-ExtraBold). Regular Kannada body (NotoSansKannada-Regular or Bold). Latin fallback (DejaVuSans-Bold) for phone numbers, addresses, badge labels. **No emoji.** |
| Shot length analogy | Each visual "zone" has a distinct color temperature — header (gold glow), content (cool white on dark), bus (warm amber glow), booking (red/gold urgency). |

---

## 3. Layout Budget (1754 px tall)

```
0   – 330  : Header zone
              - Gold outer border + diamond corners
              - Brand name (ExtraBold, ~52px, gold glowing)
              - Route line (Bold, ~30px, white)
              - Tagline band (semi-transparent gold strip, Kannada italic-style)
              - Service time strip (dark navy strip, white text)
              - Quality badge strip (green/gold pills)

330 – 800  : Two-column content zone
              LEFT  (~580px wide): Facilities list with green checkmark prefix
              RIGHT (~580px wide): Route stops with start badge (green) / end badge (red) / mid dots

800 – 1500 : Bus photo zone
              - Full-width bus image with night-road atmosphere
              - Under-bus glow ellipse (gold, blurred)
              - Headlight glow (white cone, low opacity)
              - Lane dash marks on road

1508 – 1698: Booking section
              - Phone numbers in large DejaVuSans-Bold (white)
              - Office address line (small, white)
              - Red CTA button with bold Latin text ("BOOK NOW" or Kannada equiv.)

1698 – 1754: Footer strip
              - Dark navy, white small text: social media handles, website, registration
```

---

## 4. Hook & Opening (Header Zone)

**Structural move:** *Brand name as the glowing anchor.* The very first element the eye lands on is the brand name in gold with a blur-glow halo — conveying premium quality before a single word is read.

**Invented generic example:**
> A placeholder brand string such as "ರಾತ್ರಿ ಪ್ರಯಾಣ ಟ್ರಾವೆಲ್ಸ್" ("Night Journey Travels") rendered at 52px NotoSansKannada-ExtraBold in `#ffd700`, then composited three times at increasing blur radii (2, 5, 10) with alpha 80 to create the glow.

**Swap the subject, keep the move:** Replace the brand name string; keep the triple-layer glow render. Every brand gets the same golden halo treatment regardless of name length — adjust font size to fit within `header_width - 80px` padding.

---

## 5. Narrative Arc (Beat by Beat)

| Beat | Zone | Visual | Copy function |
|---|---|---|---|
| **Brand authority** | Header top | Gold glow name | "Who are we?" — establishes premium operator |
| **Journey promise** | Route line | White bold "FROM → TO" | "Where does it go?" — core value |
| **Emotion / tagline** | Tagline band | Gold strip, Kannada phrase | "Why choose us?" — aspiration |
| **Logistics** | Time strip | Dark strip, white text | "When does it leave?" — decision trigger |
| **Trust signals** | Quality strip | Green/gold pills | "Is it reliable?" — reassurance |
| **Detail proof** | Two-column | Facilities + stops | "What exactly do I get?" — eliminates doubt |
| **Desire** | Bus photo | Night road, glow | "Imagine yourself on this journey" — emotional peak |
| **Action** | Booking strip | Phone + red button | "Call now" — friction-free close |
| **Community** | Footer | Social + registration | "We're a real business" — final trust |

---

## 6. Voice & Persona

- **Tone:** Calm-authoritative with pride. Not hype. Not discount-urgency. Luxury overnight bus — "We run on time, we care about comfort."
- **Persona archetype:** Established operator. The poster speaks like a company that has been trusted for years and doesn't need to shout.
- **Phrasing patterns:** Short Kannada noun phrases for facilities (no verbose sentences). Route stops listed as a clean vertical journey. Phone numbers large and proud (no "call us at…" preamble).
- **CTA mechanic:** Spoken + visual. Large phone numbers ARE the CTA. The red button reinforces with imperative text. No soft sign-off — ends on direct action.

---

## 7. Font Stack (Critical — do not deviate)

```
Kannada headings  : NotoSansKannada-ExtraBold.ttf   (~52px brand, ~30px route)
Kannada body      : NotoSansKannada-Bold.ttf         (~22–26px facilities, stops)
Kannada sub-body  : NotoSansKannada-Regular.ttf      (~18–20px secondary info)
Latin / numerals  : DejaVuSans-Bold.ttf              (phone numbers, address, badge text)
Latin fallback    : /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
```

**Download NotoSansKannada from GitHub at runtime:**
```
https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-ExtraBold.ttf
https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Bold.ttf
https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Regular.ttf
```
Save to `/tmp/fonts/` before drawing.

---

## 8. Image Handling (Hard-Won Rules)

1. **CDN 403 problem:** Input bus images hosted on a protected/origin CDN domain may return HTTP 403 when fetched directly with `urllib`. **Always use the `web_fetch` tool** to re-register the image URL first — this returns a publicly downloadable CDN URL that can be fetched with `urllib` + a `User-Agent` header.
2. **Download pattern:**
   ```python
   import urllib.request
   req = urllib.request.Request(downloadable_url, headers={'User-Agent': 'Mozilla/5.0'})
   with urllib.request.urlopen(req) as r:
       img_data = r.read()
   ```
3. **Bus image scaling:** Scale the source image so its width fills the poster width (1240px). Crop vertically to fit the allocated zone (~700px tall). Center-crop on Y axis.
4. **Atmosphere overlays** (apply after pasting bus image):
   - Under-bus glow: gold ellipse `(x_center, bus_bottom - 30)` sized `(800, 60)`, alpha 60, blurred with `ImageFilter.GaussianBlur(15)`.
   - Headlight cone: white triangle polygon from lower-left of bus front, opacity 20.
   - Road lane dashes: white rectangles, 3–4 dashes across the road area.

---

## 9. Emoji / Special Character Rule

**NotoSansKannada does NOT include emoji or many special Unicode symbols.** PIL will render them as boxes.

Replace all emoji with ASCII equivalents:
| Intended | Use instead |
|---|---|
| ✓ checkmark | `v` or `>>` prefix or plain bullet `-` |
| 📞 phone | omit; label placement makes it obvious |
| ★ star | `*` |
| ▶ arrow | `>>` |
| • bullet | `-` or `*` |

---

## 10. Output & Registration

- Save final poster as JPEG, quality 95: `/tmp/outputs/<brand_slug>_poster.jpg`
- Register with `register_asset` using `file_path` pointing to that JPEG.
- Suggested asset name: `final:<brand-slug>-poster`

---

## 11. Hard Rules / Do-Not-Regress

These constraints are tuned to the pattern and must be treated as immutable:

1. **Font Latin fallback is mandatory.** Never use NotoSansKannada for phone numbers, addresses, or any primarily-Latin text — it will render garbled. Use DejaVuSans-Bold exclusively for those fields.
2. **No emoji in PIL.** Any emoji in input data must be stripped or substituted before drawing. Failure to do so produces box-character artifacts.
3. **web_fetch before urllib.** Any image URL on a protected/origin CDN must be passed through the `web_fetch` tool first to obtain a downloadable URL. Skipping this can return 403.
4. **Canvas size is fixed at 1240 × 1754 px.** Do not compute from DPI dynamically — hardcode to avoid off-by-one rounding issues.
5. **Glow effect = triple composite.** The brand name glow requires rendering the text three times (blur radii 2, 5, 10) composited beneath the sharp top layer — a single blur pass looks muddy.
6. **Layout zones are fixed pixel ranges.** Do not reflow zones based on content length. If content overflows, reduce font size, not zone height.
7. **Bus photo occupies rows 800–1500 regardless of source aspect ratio.** Crop to fit, never letterbox.
8. **All user-supplied strings are swappable; the layout, color palette, glow technique, and font stack are locked.**

---

## 12. Required Inputs Checklist

When this skill is triggered for a new client, collect:

- [ ] Brand name in Kannada script
- [ ] Route: departure city → destination city (Kannada)
- [ ] Bus type / class (e.g., AC Sleeper, Semi-Sleeper)
- [ ] Service departure time and start date
- [ ] Tagline in Kannada (1 short phrase)
- [ ] Facilities list in Kannada (6–10 items)
- [ ] Route stops list in Kannada (start stop, 2–6 intermediate, end stop)
- [ ] Primary phone number(s)
- [ ] Office address (can be Latin script)
- [ ] Bus photo (uploaded as `input:image-*` asset)
- [ ] Color scheme override? (default: dark navy `#0a0a2e` / gold `#ffd700` / white)