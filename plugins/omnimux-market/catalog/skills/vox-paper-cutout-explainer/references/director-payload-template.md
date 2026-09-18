# Director Payload Template — Per Scene

Copy this skeleton for each of the 4 scenes. The `style_direction` paragraph is **locked verbatim across all four scenes** — do not paraphrase, do not shorten, do not rearrange. Only `motion_prompt` and the "Full visual description" change per scene.

```
label: scene-N-<short-name>
scene_number: <0-3>
output_type: video
aspect_ratio: 9:16
duration: 6
speech_status: silence
backend: seedance

brand: (none — conceptual motion graphics piece, no product)
product_1_title: <Topic> Explainer (documentary-style motion graphics)
product_1_description: A 4-scene motion-graphics sequence in a documentary explainer visual style, depicting <topic>. This is scene N of 4: <scene concept>.

style_direction: Paper-cutout motion graphics in a documentary explainer style, 9:16 vertical. Layered paper collage aesthetic — every element looks like real cut paper with visible hand-scissored jagged edges, slight tears, and kraft/newsprint paper textures. Soft drop shadows under each layer for real paper depth (layers visibly float above each other). Muted, slightly desaturated palette: cream/off-white background paper, soft black ink, dusty navy, and ONE signature accent color — coral-red (#E64A3E) used sparingly for emphasis. Halftone dot patterns and subtle ink-printed grain on flat shapes. Hand-drawn arrows, asterisks, underlines, and circled annotations in black marker. Tiny serif typography labels look like cut-out newspaper clippings. Frame feels like a layered paper diorama photographed top-down on a wooden desk, NOT a slick digital illustration. Avoid: 3D rendering, gradients, glowing neon, photorealism, smooth vector flatness, AI-generated polish.

PRODUCT REFERENCE: (none)

motion_prompt: <Static locked-off top-down camera OR very slow 4–5% truck/zoom — pick one>. <Element A> pops in in stuttered 12fps style with its label tag "<EXACT TAG TEXT>", then <Element B> with tag "<EXACT TAG TEXT>", then <Element C> with tag "<EXACT TAG TEXT>". At ~4.5–5s the single coral-red accent moment lands: <a hand-cut "<KEY PHRASE>" cut-newsprint banner stamps in at <position> with a slight stutter / a coral hand-drawn trend line stamps across / a coral detection ring locks on / a coral underline stamps under <label>>. Subtle paper-flutter on floating elements between reveals. All text labels remain locked as fixed paper elements throughout — no morphing, no duplication, no text animation, no typography drift.

Full visual description:
Top-down view of a kraft-paper desk. <One layout sentence describing what occupies top / middle / bottom of the 9:16 frame>.

<Element-by-element description: shape, paper color (dusty-navy or cream), edge quality (hand-cut jagged), any hand-drawn black-ink annotations, the cut-newsprint serif paper tag beneath it with the EXACT text in quotes, soft drop shadow.>

<Floating annotations: hand-drawn black-ink asterisks, arrows, underlines, circled callouts. Specify which single annotation gets the coral-red color and at what moment it appears.>

Background: cream paper with very faint halftone dot pattern. A few small scattered hand-drawn black marker asterisks and two or three tiny floating paper-cut squares for texture.

Color palette: cream background, dusty navy primary shapes, soft black ink lines/text, coral-red (#E64A3E) restricted to <list the one element that gets the accent in this scene>. Heavy paper layering with visible drop shadows between every cut piece is the defining feature. No gradients, no neon, no 3D, no smooth vector flatness.
```

## Assembly call shape

```
assemble_video(
  scenes: [scene_0_video, scene_1_video, scene_2_video, scene_3_video],
  per_scene:
    audio_url: null
    mute_captions: true
  music_url: <music_generate output asset_id>
  music_volume: 0.5
  output_size: { width: 1080, height: 1920 }
  hook_overlay: NONE
  text_overlays: NONE
)
```

## Music prompt shape

```
music_generate(
  prompt: "Documentary explainer instrumental, measured cold-open feel.
           Warm pulsing synth bass, plucky muted piano, soft analog arpeggio,
           breathy pad, finger-snap percussion. ~102 BPM. Curious, measured,
           slightly hopeful. No vocals.",
  instrumental: true,
  duration: <total_ad_length_seconds + 2>
)
```

## Per-scene checklist before dispatching

- [ ] `backend: seedance`
- [ ] `aspect_ratio: 9:16`, `duration: 6`
- [ ] `speech_status: silence`
- [ ] Every label text in the motion prompt is in quotes
- [ ] Motion prompt explicitly says "all text labels remain locked as fixed paper elements throughout"
- [ ] Exactly one coral-red accent moment named in the prompt, at ~4.5–5s
- [ ] Framing is top-down, locked-off (or slow 4–5% truck/zoom)
- [ ] No persona, no product, no brand hero shot, no UGC element
- [ ] `style_direction` paragraph is the exact locked text from above
