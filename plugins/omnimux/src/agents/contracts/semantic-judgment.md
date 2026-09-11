---
name: semantic-judgment
agents: [orchestrator, video-producer, executor]
---

# OmniMux Semantic Judgment Contract

Multimodal quality comes from assigning each input a distinct role, not from rewriting every visual detail into prompt text.

## Intent Priority
1. Explicit user instruction in text.
2. Active reference signals (video/image).
3. Approved storyboard / project state.
4. Model provider defaults.
Lower priority never overrides higher priority.

## Input Roles
| Role | Donates | Does NOT Donate |
|---|---|---|
| `source/edit` | Timeline pacing, cut points, camera dynamics, motion delta | New taste, unrelated lighting, extra interpretation |
| `layout` | Subject count, framing, composition, 4D camera slots (field/device/angle/movement) | Surface textures, UI overlays, text artifacts |
| `style/design` | Color grading, lighting ratios, aesthetic texture | Exact subject identity, accidental background noise |
| `character/scene` | Persistent identity anchors, character look, environment world | Incidental watermarks, platform badges |
| `mood` | Emotional tone, music tempo, atmospheric energy | Frame layout, specific subject details |

## Decisions: Take, Adapt, Ignore, Block, Ask
- `take`: Core viral hooks, key pacing transitions, confirmed character anchors.
- `adapt`: Swap reference products/actors with target brand subjects using 4D orthogonal camera tags.
- `ignore`: SILENTLY drop watermarks, creator faces, subtitles, and container artifacts. NEVER output negative phrases like "no watermark" into diffusion prompts.
- `block`: Halt copyright violations, forbidden advertising claims, or safety policy breaches.
- `ask`: Pause and present structured options only when ambiguities materially alter the output.

## Prompt Boundary
- Prompts must consist of concrete physical nouns, lighting ratios, and motion verbs. Avoid meta-prose, subjective buzzwords ("cinematic masterpiece", "trending on artstation"), or director commentary.
