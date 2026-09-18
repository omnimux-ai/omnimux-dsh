# Native-Language Safe Word Guidance

When writing dialogue scripts for TTS/lipsync in a diaspora audience's native language, watch for words that are **shared with, or easily confused with, a closely-related sibling language**. Many diaspora target languages have a near-neighbour language, and ambiguous words can cause language-detection engines (Seedance, ElevenLabs, etc.) to switch into the wrong language mode — wrecking pronunciation and lipsync.

## How to build a per-language safe-word list

1. Identify the sibling/neighbour language(s) most likely to be mis-detected for your target language.
2. List the high-frequency words that exist in both languages or are exclusive to the neighbour but tempting to use colloquially.
3. For each, pick an **unambiguous native equivalent** that only the target language uses, and substitute it in the script before generating audio.
4. Test a short sample line through TTS; if the engine drifts to the wrong language, expand the avoid-list and regenerate.

| Concept | What to do |
|---|---|
| Word that exists in both target + sibling language | Replace with a synonym unique to the target language |
| Word that is actually the sibling language's spelling | Replace with the target language's native spelling |
| Overly-formal register that flattens the peer tone | Swap to the colloquial native form |

## Numbers — always write as words
- Do not use digits in dialogue scripts.
- Spell every number out in the target language (e.g. a price like `598` becomes the fully written-out number words).
- This prevents the TTS from guessing the wrong number reading or wrong language for the numeral.

## Acronyms — spell out with hyphens
- For any acronym or initialism the persona reads letter-by-letter, write it hyphenated in the script (e.g. `ABC` → `A-B-C`) so TTS pronounces each letter distinctly.
- For a currency or unit code spoken as letters, keep the letters but write any amount in full: `[amount] [currency-words]`.
