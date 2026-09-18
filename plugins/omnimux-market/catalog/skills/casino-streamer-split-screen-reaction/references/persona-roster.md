# Persona Roster — Split-Screen Reaction Ad

## Fixed setting (all personas)

- **Chair:** chair (color varies per persona)
- **Background:** dark charcoal walls
- **Lighting:** blue-purple LED strips as key light (motivated by room LEDs)
- **Props:** curved ultrawide monitor visible behind creator
- **Style:** cinematic webcam — NOT golden hour, NOT natural light, NOT outdoor

## Core three-variation roster (defaults)

| Slot | Ethnicity / Gender | Age | Outfit | Distinctive detail | Chair |
|------|--------------------|-----|--------|--------------------|-------|
| A | South Asian female | late 20s | dark navy jersey | long black hair, gold nose stud | white chair |
| B | Black male | mid-20s | heather grey hoodie | short fade, gold chain | black chair, hexagonal LED panels on wall |
| C | Latina female | late 20s | cream white jersey | voluminous curly hair, gold hoop earrings | charcoal chair |

## Extended variation library (for future runs)

| Slot | Ethnicity / Gender | Age | Outfit | Distinctive detail | Chair |
|------|--------------------|-----|--------|--------------------|-------|
| D | East Asian male | early 30s | black zip-up jacket | glasses, minimal accessories | grey ergonomic chair |
| E | White female | mid-20s | purple oversized hoodie | blonde streaks, headset around neck | red chair |
| F | Middle Eastern male | late 20s | dark green jersey | short beard, silver ring | black chair with RGB armrests |
| G | Black female | late 20s | white crop jersey | box braids, gold necklace | white chair |

## Persona prompt anchors (use verbatim in `ads-persona-prompt-skill`)

These fragments lock the visual DNA regardless of which persona is chosen:

```
Setting anchors (always include):
- "chair, dark charcoal background, blue-purple LED strip lighting"
- "curved ultrawide monitor visible behind subject"
- "cinematic webcam style, motivated LED key light"
- "NOT golden hour, NOT outdoor, NOT warm tones"

Expression arc (always include):
- "expression arc: focused and leaning forward → curious, eyebrows raised → shocked, mouth opens → explosion of joy, standing or gesturing → celebration"
- "fast zoom punch toward face at 7 seconds, 1-second frame shake immediately after"
```
