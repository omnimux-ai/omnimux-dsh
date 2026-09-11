# Typography hierarchy craft rules

Typography hierarchy ensures structured reading order, scannability, and rhythmic cadence across screens.

## The golden entry point

Every screen or canvas must feature exactly one primary visual anchor:
- The eye must identify the hero entry point within 50ms.
- Never place two headings of identical visual weight side by side.
- Use the **Eyebrow + Title + Subtitle** triad for structured introductions:
  - **Eyebrow**: 11–12px, uppercase (`letter-spacing: 0.08em`), muted accent color.
  - **Title**: 28–40px, bold/semibold, tight leading (1.1 for Latin, 1.35 for CJK).
  - **Subtitle**: 14–16px, 400 weight, secondary muted foreground, line-height 1.5–1.6.

## Vertical rhythm and grouping

- **Proximity rhythm**: Space within a semantic group (e.g. title to its description) should be 8–12px. Space between distinct groups must be 32–48px (3×–4× ratio).
- **Measure (Line Length)**: Cap reading text width at 60–75 characters (`max-width: 65ch`). Full-width body text spanning wide desktop screens causes visual fatigue during line tracking.
- **Scannable formatting**: Long paragraphs (>4 lines) should be broken up with subheadings, bulleted key points, or highlighted stat callouts.
