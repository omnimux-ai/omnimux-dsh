# TTS Phonetics Reference

Use these phonetic respellings when generating voiceover audio for pharmaceutical parody ads. Feed the phonetic version directly into the TTS input — do not rely on the engine to infer stress on multi-syllable or uncommon words.

## General Rules

1. **Numbers:** Always spell out in full. `2,041` → `two thousand and forty-one`. `$4.2M` → `four point two million dollars`.
2. **Acronyms meant to be spelled out:** Add hyphens between letters. `CSD` → `C-S-D`.
3. **Acronyms meant to be pronounced as words:** Write phonetically. `FDA` → `F-D-A` (spelled), `NASA` → `NASA` (word).
4. **Emphasis:** Use ALL CAPS on the stressed syllable. `homogeneity` → `ho-moh-jeh-NAY-ih-tee`.
5. **Pauses:** Insert `…` (ellipsis) for a beat of silence. Use sparingly — one per major clause.

## Starter Phonetics Library

| Word | Phonetic Input |
|---|---|
| homogeneity | ho-moh-jeh-NAY-ih-tee |
| flaccid | FLASS-id |
| efficacy | EF-ih-kuh-see |
| placebo | plah-SEE-boh |
| contraindicated | kon-trah-IN-dih-kay-ted |
| pharmaceutical | far-muh-SOO-tih-kul |
| diversification | dih-ver-sih-fih-KAY-shun |
| synergy | SIN-er-jee |
| paradigm | PAIR-uh-dime |
| consult | KON-sult (noun) / kun-SULT (verb) |
| annual | AN-yoo-ul |
| fiduciary | fih-DOO-shee-air-ee |

## Disclaimer Speed

For the rapid-fire disclaimer beat, write the full disclaimer text as a single paragraph with no ellipses or pauses. The `playback_rate` parameter at assembly time (target: 1.75×) handles the speed — do not artificially truncate the disclaimer or the legal parody effect is lost.
