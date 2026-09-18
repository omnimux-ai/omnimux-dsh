# Caption Overrides — Split-Screen Dialog Ad

Default is locked: **`clean-bold` preset · `DM Sans` font · `appear_mode: word` · centered lower-third (above the divider's lower half so it doesn't fight the man's face).** Volume of presence: high — captions are part of the format.

Only override for the cases below.

| Brand register | Preset | Font | Appear mode | Notes |
|---|---|---|---|---|
| Default (tech, self-improvement, dating, productivity) | `clean-bold` | DM Sans | word | Locked default. White fill, subtle black outline. |
| Playful chaos (Gen-Z slang, meme-y, comedy) | `kinetic-pop` | Anton or Bebas Neue | word | Allow color accents on emphasis words. |
| Luxury / minimal (fashion, beauty, fragrance) | `subtle-serif` | Cormorant or Playfair | line | Lower opacity, smaller size, no outline. |
| Hyper-energy (hype, fitness, finance) | `bold-shout` | Bangers or Bungee | word | Uppercase, drop shadow ok. |
| ASMR / intimate (therapy, sleep, manifestation) | `soft-fade` | Inter Light | line | Slow fade-in, low contrast, no animation jitter. |

## Caption position

For this format specifically, captions sit in the **lower third of the bottom half** (i.e. below the divider, over the man's chest area). This keeps them off both speakers' mouths and reads as a single subtitle track for the whole conversation, not separate captions per half.

## What never changes

- Captions never appear *inside* the source video frame — they're a `assemble_video` overlay layer.
- Captions never cover the divider line.
- Captions never appear on the woman's half (top) — top half stays clean for her performance.
- The CTA card scene uses `mute_captions: true` — text overlays handle that scene instead.
