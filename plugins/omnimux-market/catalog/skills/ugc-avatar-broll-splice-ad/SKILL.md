# UGC Avatar + B-roll Splice Ad

A creative mold for short vertical (9:16) UGC ads where an **AI avatar owns the voiceover end-to-end** and the **user supplies their own screen recordings** that get layered into the middle. The avatar appears on camera for the hook and the CTA; in between, the product demo is told through the user's B-roll while the avatar VO keeps narrating underneath. This is the go-to pattern for software / SaaS / app products that can't be filmed — the product only ever appears inside the user's recordings, never in the avatar's frame.

Swap the subject freely — keep the moves below. Treat the brand as a variable: fetch the live site to ground the brand name, palette, audience, and feature names before drafting, then substitute them in.

## 1. When to use this pattern

- **Best for:** software / app / dashboard products demoed via screen recording; founder-led or expert-led brands; TikTok / Reels / Shorts; audiences who respond to peer-to-peer "here's the thing I use" energy rather than polished broadcast ads.
- **Not for:** physical products you can shoot directly (use a normal product-in-frame ad), brand-film / cinematic spots, anything where the user has no footage to splice.
- **Two delivery modes — always confirm which the user wants:**
  - **Mode A (separate clips + edit map):** deliver each avatar segment as its own captioned clip, cut exactly at the B-roll seams, plus a table telling the user where to drop each recording. Use when the user edits in their own tool.
  - **Mode B (single continuous video):** deliver one finished video — avatar hook, then the user's recordings layered over the demo beats with VO underneath, then avatar CTA — captions and music baked in. Use when the user wants a ready-to-post file.

## 2. Hook & opening (avatar on camera)

The hook is a **peer-credibility callout** — the avatar speaks as one of the audience, naming the audience's exact frustration in the first beat, no product yet. It's a phone-selfie talking head, not an announcer.

Shape (freshly invented, neutral hypothetical — a recipe-planning app for busy households):
> "If you're still scrambling to figure out dinner every single night, stop — this completely fixed it for me."

**Swap the subject, keep the move:** name the specific audience + their guessing/struggle, then a hard pivot word ("stop", "listen", "here's the deal") into "this changed everything for me / my [workflow]". Keep it ≈8s, ≈20 words. Never open on the product.

## 3. Narrative arc

Beat-by-beat, total **25–30s**. Word-count every beat to a **2.5 words/sec** target (8s≈20w, 7s≈18w, 9s≈22w, 5s≈13w):

1. **Hook (≈8s, avatar on camera)** — audience callout + pivot. Confident, slightly conspiratorial peer tone.
2. **Problem-to-demo (≈7–9s, B-roll over VO)** — name the pain, then the avatar describes the fix while the user's screen recording shows the actual product moment (the named feature, the AI output reveal). VO continues; avatar is hidden under B-roll here.
3. **Proof / payoff (≈7–9s, B-roll over VO)** — the result the tool produces; second screen recording or second window of the same one, ideally landing on the output/result reveal.
4. **CTA (≈5s, avatar back on camera)** — soft, direct sign-off (see §6).

Name the arc to yourself: **"peer-callout → here's-what-I-use → here's-what-it-gave-me → go-try-it."** The avatar's voice is the through-line; the B-roll is the evidence.

## 4. Visual style spec

- **Register** — UGC by default: casual phone selfie, handheld micro-motion, everything in focus, **no bokeh / no cinematic depth-of-field**. Direct the avatar scenes as "casual phone selfie, handheld, natural light."
- **Aspect / canvas** — 9:16, 1080×1920.
- **Setting & persona accent** — match the brand world (pick a setting that fits the product's audience). Tie a **subtle brand-color accent into wardrobe** — a wristband, scrunchie, or sleeve stripe in the brand accent — never a logo slap.
- **B-roll framing** — the user's recordings are tall phone captures; **pad/scale to 1080×1920 with the brand's darkest UI color as the pad color** so side bars blend invisibly into a dark app UI. B-roll must fill/own the frame during demo beats.
- **On-screen text** — see captions in §6: kinetic word-highlight captions, not lower-thirds.
- **Shot rhythm** — 4 beats over ~30s, roughly 7–8s average per beat; the cut energy lives in the caption word-pop, not in hard cuts.

## 5. Voice & persona

- **Persona archetype** — a credible *peer who already uses the product*; an authentic-toned member of the target audience talking straight to camera in a setting that fits the product world. Not an actor, not a spokesperson.
- **Tone** — direct, confident, no-fluff, warm-but-busy. Conspiratorial on the hook, matter-of-fact through the demo, encouraging on the CTA.
- **Pacing** — ~2.5 words/sec, conversational, light delivery cues (a beat after the pivot word).
- **One voice per ad** — lock a single voice across every VO beat in one ad, including the hidden-under-B-roll beats, so the narration is seamless.
- **Rotate the face across ads** — vary age band / ethnicity / hair between sessions so repeat ads for the same brand don't reuse the same avatar (e.g. one persona for ad 1, a visibly different persona for ad 2). The persona look rotates; the *archetype, tone, and brand accent* stay locked.

## 6. CTA mechanic

A **soft, direct verbal sign-off** delivered by the avatar back on camera — no hard-sell, no shouted discount. Name the brand once and point to where to go. Shape:
> "Go check out [brand] — it's the edge you've been missing."

≈5s, ≈13 words. The CTA always returns to the avatar on camera (never over B-roll) so the brand name lands on a human face.

**Captions** are the secondary CTA mechanic — kinetic word-highlight:
- Preset `clean-bold`, font `Anton` (direct / bold feel).
- Active-word highlight color = the brand accent.
- **Caption coverage is a per-ad parameter** — captions on the avatar sections always; captions over the B-roll are **optional**, confirm per ad. (One ad may want captions on avatar-only; another may want captions throughout.)

**Music** — a subtle instrumental bed only: low energy, "designed to sit under voiceover", mixed at **~12–15% volume** so it never competes with the VO.

## 7. The B-roll splice technique (what makes this pattern work)

This is the durable craft of the pattern. The avatar VO is rendered as a **continuous talking-head performance for every beat**, including the beats that will be hidden under B-roll — render them on-camera too so their **VO audio and word-timing are consistent**, then use only their audio + caption timing under the B-roll. Then:

- **Match each B-roll segment to its paired VO beat's exact duration.**
  - Recording too short → slow it with `setpts` (e.g. `setpts=1.159*PTS` stretches 6.9s to 8s); imperceptible on UI screen recordings.
  - Recording too long → trim the most VO-relevant window (`-ss START -t DUR`), favoring the AI-output / result reveal.
- **Pad to canvas** with the brand's darkest UI color so tall captures blend (`pad=1080:1920:...:color=0xRRGGBB`).
- **Strip B-roll audio** (`-an`) — the recordings are muted; the avatar VO carries underneath.
- **Leave natural seams** at the B-roll boundaries so real footage drops in cleanly.

**Mode A assembly** — one captioned clip per avatar segment, cut at the seams, delivered with an edit-map table (segment → B-roll source → in/out → duration).

**Mode B assembly** — one ordered timeline: avatar hook (video + audio + captions), then each B-roll segment (padded video + avatar VO audio + caption timing, duration set explicitly), then the avatar CTA — with music bed and 1080×1920 output.

**QA before delivery** — pull frames at the hook / each B-roll / CTA timestamps and confirm: avatar identity consistent, captions present/absent exactly where intended, B-roll fills frame, brand-accent active-word rendering.

See `references/worked-example.md` for the palette/tone reference template and concrete ffmpeg recipes.

## 8. Hard rules / do-not-regress

1. **Avatar VO is continuous and never interrupted** — it runs underneath the B-roll; the B-roll never carries its own audio. Always strip recording audio.
2. **Avatar on camera for hook + CTA only** — the demo beats are B-roll. The brand name in the CTA lands on a human face, never over B-roll.
3. **One voice per ad, rotate the face between ads.** Never reuse the same persona look for repeat ads of one brand.
4. **Music sits under the VO at ~12–15%** — subtle instrumental bed, never overpowering.
5. **Natural seams at B-roll boundaries** so the user can splice real footage cleanly.
6. **Caption coverage is a per-ad choice** (avatar-only vs throughout) — confirm it; don't assume.
7. **Pad B-roll with the brand's dark canvas color**, not black-by-default and not white — bars must disappear into the app UI.
8. **The product never appears in the avatar's frame** — it lives only in the user's recordings; the persona/product gate is satisfied by prose, no product image needed for avatar scenes.
9. **Always confirm Mode A vs Mode B up front** — the whole assembly plan forks on it.
10. **Subject is swappable; style, arc, voice, hook, CTA, seam discipline, and caption/music rules are locked.**