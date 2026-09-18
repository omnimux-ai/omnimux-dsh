# Persona Composition — LatAm Marketplace Presenter

Prompt fragments for `ads-persona-prompt-skill`. Mix-and-match by country.

## Universal base (do not skip)

Mid-20s Latina woman, peer-friend energy, relaxed and warm. **Explicitly include all of:**
- Sun-kissed tan or warm-olive skin tone (not fair, not heavily contrasted)
- Dark almond-shaped eyes, dark brown
- Dark espresso hair, natural wavy or loose-curl texture, mid-length to shoulder
- Natural freckles across cheekbones and nose, or warm undertones
- Soft natural makeup — tinted lip balm, no heavy contour, no false lashes
- Warm genuine smile, slight crinkle at the eyes

**Wardrobe (modest urban-casual):**
- Cream / oatmeal / soft-rust crew tee, fitted but not tight
- Open chunky knit cardigan: camel, oatmeal, terracotta, or rust
- Dark indigo high-waisted straight-leg jeans
- One small piece of gold jewelry (thin chain or hoop earrings)
- No logos, no statement pieces, no athleisure

**Setting (apartment living room):**
- Cream or oatmeal couch
- Terracotta-striped or rust-toned woven throw blanket
- Light wood floor (oak or pine, not dark)
- 2–3 plants in terracotta pots (monstera, pothos, snake plant)
- Sheer white curtains, soft natural daylight from camera-left
- Wooden coffee table with a single book and a ceramic mug
- No TV, no clutter, no obviously branded items

## Country-specific tweaks

### Chile
- Slightly cooler color in the room (the light reads cooler near the coast)
- Persona name suggestion: Sofía, Camila, Javiera, Antonia
- Speech: "pa'" (instead of "para"), "rapidito", "cachai" sparingly

### Mexico (CDMX / Guadalajara / Monterrey)
- Warmer tone, can add a small painted-tile detail or papel picado as set dressing
- Persona name suggestion: Ximena, Regina, Valeria, Fernanda
- Speech: "ahorita", "súper", "qué padre", "neta"

### Colombia
- Add a small clay or guadua-bamboo element to the set
- Persona name suggestion: Daniela, Manuela, Valentina, Sara
- Speech: "chévere", "parce", "qué nota", "de una"

### Argentina
- Slightly more European-influenced wardrobe acceptable (a thin scarf is fine)
- Persona name suggestion: Martina, Lucía, Catalina, Mía
- Speech: "che", "re" as intensifier ("re bueno"), "dale"

## Voice capture

After generating the persona, **immediately record** every voice ID returned (e.g. `voice_asset_id: persona:<name>:voice` and any platform-specific id like `kling_voice_id: <digits>`). Pass these to every subsequent VO scene's director call. A single mismatched voice in one scene will visibly break the illusion.
