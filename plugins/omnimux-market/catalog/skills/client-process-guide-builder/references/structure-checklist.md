# Structure Checklist — section-by-section content brief

Use this as the content plan when writing the Markdown source. Each section lists what must appear, target length, and the failure mode to avoid.

> The examples below use a neutral placeholder service to illustrate the pattern.
> Swap in the agency's actual pipeline, jargon, platforms, and specs.

---

## 1. Front matter (title block)

**Must include:**
- `# How We Create Your <Service>` (h1)
- `### <One-sentence subtitle stating the format>` (h3)
- A meta line like `> Prepared by your production team · <Month Year>`
- `> Confidential — for client use only`
- A horizontal rule

**Failure mode:** missing the confidentiality / meta line — the doc feels like a webpage, not collateral.

---

## 2. Overview

- 2 short paragraphs (no more), the first stating the high-level promise ("your project goes through N stages…"), the second a 3-bullet "every X we deliver is…" value-prop list.
- Length: ~120 words.

**Failure mode:** marketing fluff. Stay specific — name the stage count, name the platforms / channels.

---

## 3. What You Need to Provide

- `### Required` list — 5 items, every item a noun phrase
- `### Optional — but highly recommended` list — 6 items
- Recommended ranges inline where relevant (e.g. "a 1–2 paragraph brief")

**Failure mode:** an "Optional" list that's longer than Required. Keep Required ≥ Optional in priority weight.

---

## 4. Production stages (default 7)

Each stage block contains, in this order:

1. `## Stage N — <Name> <Emoji>` (pick icons that match the service's own steps — e.g. 📋 🧭 ✏️ 🧱 🔍 🧪 🚀; substitute when service differs)
2. **What we do:** one-paragraph framing.
3. One or two `### <subhead>` sections with bullets, tables, or short examples.
4. Optional `>` callout — at most one per stage.

Per-stage length target: 80–180 lines for the longest, 40–80 for the shortest. Total stages: ~60% of document length.

**Required quantitative anchors** (don't ship a stage without these where applicable):
- A table (steps, parameters, rules, etc.)
- A worked example ("Example brief:" / "Example checklist:")
- A "Why it matters" sentence

**Failure mode:** every stage reads identically. Vary the affordance: one stage has a parameters table, the next a criteria grid, the next an ASCII diagram, the next a rules table — rotate the format.

---

## 5. Production Summary Table

- Single 3-column table: `Stage | What Happens | Output`
- One row per stage, in order.
- Stage cell uses `N · Name` format ("4 · Build & Assembly").

**Failure mode:** rewording the stage bullets verbatim. Each cell should compress the entire stage into ≤ 8 words.

---

## 6. Quality Controls

- 2-column table: `Control | What it catches`
- Exactly 6 rows.
- Each Control name is a 2–3 word noun phrase in **bold**.
- Each "What it catches" cell names a specific failure that the control prevents.

**Failure mode:** abstract reassurance. "Quality reviews everything" is a failure. Name concrete defects the control intercepts (e.g. "broken links, missing fields, spec drift, off-brand colour") — that level of specificity is the bar.

---

## 7. Platform / Output Specifications

- 5-column table: `Channel | Layout | Size | Range | Format`
- Default rows: pick the channels the agency actually delivers to (e.g. web, email, social, print).
- Use exact numbers (`1080 × 1920 px`, not "~1080p").

**Failure mode:** including a column the agency doesn't actually control (e.g. "Algorithm Tips"). Stick to deliverable specs.

---

## 8. FAQ

- 6–8 questions.
- Each Q is **bold** and ends in `?`.
- Each A is one paragraph, 25–60 words.
- A sensible order: timing → scope → revisions → review process → variations → ownership.

**Must-have FAQs (don't skip):**
- "How long does production take?"
- "What if I don't like the result?"
- "Do I own the final deliverable?" (or equivalent rights question)

**Failure mode:** asking yourself the question instead of the client. "What is our internal pipeline?" is a self-question. "How long does production take?" is a client question.

---

## 9. Glossary

- 2-column table: `Term | Definition`
- 8–10 rows.
- Terms are internal jargon a client will encounter in the doc — decode whatever your own pipeline uses (e.g. "Brief", "Spec sheet", "Review gate", "Revision round", "Source asset", "Acceptance criteria", "Handoff").
- Each definition: one sentence, no nested terminology that itself needs defining.

**Failure mode:** defining terms with other undefined terms.

---

## 10. Footer

Two lines, italic, centred-feeling:
- Contact line: `*For questions about your project, contact your account manager.*`
- Copyright: `*© <Year> <Agency Name> — All rights reserved.*`

---

## Length & file-size targets

| Format | Target size | Approx lines/pages |
|---|---|---|
| Markdown | ~18 KB | ~320 lines |
| HTML | ~47 KB | self-contained single file |
| PDF | ~20 KB binary | 5–6 pages (cover + 4–5 inner) |

If the MD draft comes in under 12 KB, a stage is missing detail. If it goes over 28 KB, you've drifted into employee-SOP territory and the client will skim.
