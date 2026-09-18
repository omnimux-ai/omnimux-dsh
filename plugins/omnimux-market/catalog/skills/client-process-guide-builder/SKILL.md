# Client Process Guide Builder

A document-design pattern for turning an agency / studio / service-provider's internal production pipeline into a polished, client-facing transparency guide — delivered as three matching artifacts (Markdown, HTML, PDF) that share content but each play a different role.

## When to use this pattern

**Trigger on**:
- "Write a guide for our clients explaining how we…"
- "Make a customer-facing doc about our production process"
- "Explainer / process transparency / white-paper / onboarding deck for clients"
- User pastes an internal SOP and asks for a "polished" or "branded" version
- Any request where the *audience is the agency's customers* and the *content is the agency's process*

**Do NOT use this pattern for**:
- Producing actual ads or creative content (that's ads-fast-skill, ads-director-skill, etc.)
- Internal SOPs aimed at employees (those should be terse and link-heavy; this pattern is sales-collateral polish)
- One-page summaries — the format below pays off only when there's enough content for ~7 stages / sections

## The document design pattern (creative DNA)

### Document role
This is **sales collateral disguised as a transparency doc**. It exists to:
1. Reduce client back-and-forth by stating what the agency needs upfront
2. Build trust by exposing the production pipeline step-by-step
3. Pre-empt FAQs that would otherwise hit the account manager
4. Look premium enough that the client forwards it internally

### Canonical structure (lock in this order)
1. **Title + subtitle + meta + confidentiality line** — establishes provenance and tone
2. **Overview** — 3-bullet value prop ("every X we deliver is…")
3. **"What You Need to Provide"** — Required / Optional checklist (this is the highest-leverage section; it converts a confused brief into a usable one)
4. **N production stages** (default 7) — each with: "What we do" intro paragraph → bullet list → optional callout note. Each stage gets an emoji icon and a numbered badge.
5. **Production summary table** — single-page recap (stage / what happens / output)
6. **Quality controls table** — 6 items, "Control / What it catches" — this is the trust-builder
7. **Platform / output specifications table** — concrete specs (resolution, format, duration)
8. **FAQ** — 6–8 plain-language Q&As, each Q a question the account manager has actually heard
9. **Glossary** — 8–10 internal jargon terms decoded for the client

### Voice and tone
- **Confident, plain-language, slightly proud.** "We hit the target spec every time." Not "we attempt to". Not "we strive to".
- **First-person plural** ("we do…", "we enforce…") — the agency is a unified team to the client.
- **Concrete numbers everywhere.** Counts, rates, retry limits, tolerances. Vague guides feel like marketing; specific guides feel like engineering.
- **Earn every callout box.** Use 💡 tip / > blockquote sparingly — one per stage maximum.
- **No buzzwords.** No "synergy", "best-in-class", "world-class". The guide implies quality through specificity, never by claiming it.

### Visual design language (cross-format)
- **Dark theme** with a single electric-violet accent (default `#6c63ff`).
- **Numbered stage badges** (01, 02, …) — the spine of the document.
- **Lavender tints for backgrounds** of callout boxes; gold reserved for highlights only.
- **Zero decorative imagery.** No stock photos, no AI-generated illustrations. Typography + colour blocks do all the work.
- **System font stack** — no web fonts, no CDN. The doc must open on a flight, on a hotel wifi, on a client's locked-down laptop.

### The "Report QA" trust pattern (signature move)
Both MD and HTML include a **"Report QA / Accuracy Review"** block near the top — a list of 8–10 verdict items split between `PASS` (green) and `ENHANCED` (violet) badges. Each verdict has a one-line justification. This block does two things:
1. Demonstrates the doc was reviewed before distribution (builds trust)
2. Quietly highlights enhancements the agency made beyond a basic process dump (frames the agency as careful)

**Keep this section in.** If the user says "no QA section needed", push back once — it's a high-impact element. Only remove on a hard second no.

### CTA / close
- MD ends with a contact line + copyright (low-key).
- HTML ends with a centred CTA block (violet-bordered card, "Ready to get started?").
- PDF ends with a centred dark-MID closing card on the final inner page.
- **Never** a hard sell. The whole document is the sell; the closer just opens the door.

## Workflow

> The producer / orchestrator handles tool calls. The substance below is what this skill contributes: *what* to build, *in what order*, with *what defaults*.

### 1. Gather brief (one batched ask if missing)
Ask only what's not in the brief. Batch into a single question:
- Agency display name (default placeholder: `Your Agency`)
- Which service/pipeline to document (default: a generic 7-stage production pipeline)
- Brand accent colour (default: electric violet `#6c63ff`)
- Output formats — confirm all three (MD + HTML + PDF) unless the user explicitly opts out of one

### 2. Write the Markdown first (canonical source)
- Save as `how_we_create_your_<service>.md` in the **working directory** (NOT `/tmp/...`).
- Follow the canonical structure above. Length target ~18 KB / ~320 lines.
- See `references/structure-checklist.md` for the section-by-section content brief.

### 3. Write the HTML independently
- Save as `how_we_create_your_<service>.html` in the working directory.
- **Do not parse the MD** — compose HTML directly with the same source content. Parsing introduces fragility for zero benefit.
- Use the template in `templates/html_skeleton.html` (system fonts, dark theme, fixed nav, IntersectionObserver fade-in, native `<details>`/`<summary>` accordion FAQ, zero external dependencies).
- Length target ~47 KB. All CSS in a single `<style>` block in the head.

### 4. Write `build_pdf.py` (reportlab)
- Use `templates/build_pdf_skeleton.py` as the starting point.
- Architecture: `BaseDocTemplate` with two `PageTemplate`s — `Cover` (dark bg, accent strips, decorative low-opacity circles) and `Inner` (top 6mm accent strip, bottom 10mm dark bar with page number, left 3mm accent stripe). Switch via `NextPageTemplate` flowables.
- **Output path must be the working directory root with a relative filename** (e.g. `how_we_create_your_<service>.pdf`). Writing to `/tmp/outputs/...` in this environment causes path errors.
- Stage badges = two-column `Table` (violet pill `Stage N` + lavender body with title).

### 5. Build the PDF
- Check reportlab is available; install only if missing. Write a small `install_libs.py` rather than `pip install` chained on the command line.
- Run `python3 build_pdf.py`. Verify with `ls -l how_we_create_your_<service>.pdf`.

### 6. Register all three assets
- `final:client-guide-md` → `asset_type=other`, `file_path=how_we_create_your_<service>.md`
- `final:client-guide-html` → `asset_type=other`, `file_path=how_we_create_your_<service>.html`
- `final:client-guide-pdf` → `asset_type=pdf`, `file_path=how_we_create_your_<service>.pdf`

### 7. Reply to the user
Three markdown hyperlinks (one per format) + a one-line summary per file. No long preamble.

## Hard rules / do-not-regress

1. **Always write to working-directory-relative paths.** Never `/tmp/outputs/...`. The sandbox in this environment rejects nested temp paths for registered assets.
2. **Zero external dependencies in HTML.** No Google Fonts, no Tailwind CDN, no JS frameworks. System font stack + vanilla CSS + a single IntersectionObserver block.
3. **The HTML composes the content directly — do not parse MD into HTML.** This isn't a static-site generator; it's a sibling format.
4. **The PDF cover must be a full-bleed dark page** with accent strips top/bottom and at least one low-opacity decorative circle. A pale or default-styled cover undercuts the entire document.
5. **Stage count is a parameter, not a constant.** Default is 7. For other services, choose the number that fits — but keep the badge-numbered structure (01, 02, …).
6. **Keep the QA / Accuracy Review block.** Only drop it if the user explicitly insists twice.
7. **Concrete numbers in every stage.** If a stage has no quantifiable detail, dig harder or merge it. A bullet list of vague verbs ("we plan", "we review") is a failure state.
8. **One accent colour. One.** Violet by default. Gold is a *highlight*, used at most twice in the whole document. No rainbow palettes.
9. **No emojis in body copy.** Emojis are restricted to: (a) the icon on each stage header, (b) the icon on each major section heading. Body paragraphs and bullets stay text-only.
10. **Bash rules in this environment**: only `python python3 cd ffmpeg ffprobe mkdir ls cat head tail cp find grep` are allowed prefixes. No semicolons (use `&&`). No multi-statement `python3 -c "..."` (write a `.py` file and run it).

## References
- `references/structure-checklist.md` — section-by-section content brief with content cues and length targets.
- `references/palettes.md` — default colour tokens for HTML and PDF (parameterise per brand).
- `templates/html_skeleton.html` — the dark-minimalist HTML skeleton (head, nav, hero, stage card pattern, FAQ accordion, footer).
- `templates/build_pdf_skeleton.py` — the reportlab cover + inner page template scaffold, including stage_badge helper.