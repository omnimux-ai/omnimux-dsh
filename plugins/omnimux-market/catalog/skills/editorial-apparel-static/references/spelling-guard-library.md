# Spelling Guard Library

Pre-built per-letter spell-outs for the words this creative pattern uses most often. Paste the ones you need into the `SPELLING GUARDS` section of the prompt. Add new entries when you discover a fresh hallucination.

## Lock the brand wordmark first

Before guarding any generic copy, **lock the brand's exact spelling and casing** as the first spelling guard. Image models will silently re-spell or re-case a wordmark (dropping a letter, switching case, "correcting" a coined name). For whatever brand the brief supplies, spell its wordmark out letter-by-letter exactly as the brand writes it, and add "Do not re-spell or re-case this wordmark." Treat the brand's own spelling as ground truth — never let the model normalise it. The same applies to any trademarked fabric, line, or collection name the brief provides: copy the brief's spelling verbatim into a guard.

## Headline / copy words

| Word | Spell-out | Note |
|---|---|---|
| Effortless | `E-F-F-O-R-T-L-E-S-S` | Double F, double S. A frequent failure mode. |
| Refined | `R-E-F-I-N-E-D` | |
| Effortlessly | `E-F-F-O-R-T-L-E-S-S-L-Y` | |
| Iconic | `I-C-O-N-I-C` | |
| Considered | `C-O-N-S-I-D-E-R-E-D` | Double E in the middle. |
| Essential | `E-S-S-E-N-T-I-A-L` | Double S. |
| Quietly | `Q-U-I-E-T-L-Y` | |
| Modern | `M-O-D-E-R-N` | |
| Timeless | `T-I-M-E-L-E-S-S` | Double S. |

## Sub-mark / collection words

| Word | Spell-out |
|---|---|
| International | `I-N-T-E-R-N-A-T-I-O-N-A-L` |
| Collection | `C-O-L-L-E-C-T-I-O-N` (double L) |
| Edition | `E-D-I-T-I-O-N` |
| Series | `S-E-R-I-E-S` |
| Limited | `L-I-M-I-T-E-D` |
| Capsule | `C-A-P-S-U-L-E` |
| Heritage | `H-E-R-I-T-A-G-E` |

## Fabric / spec words

| Word | Spell-out |
|---|---|
| Microfibre | `M-I-C-R-O-F-I-B-R-E` |
| Microfiber | `M-I-C-R-O-F-I-B-E-R` (US spelling — pick one) |
| Elastane | `E-L-A-S-T-A-N-E` |
| Cotton | `C-O-T-T-O-N` (double T) |
| Cashmere | `C-A-S-H-M-E-R-E` |
| Merino | `M-E-R-I-N-O` |
| Polyester | `P-O-L-Y-E-S-T-E-R` |

## CTA verbs

| Word | Spell-out |
|---|---|
| Discover | `D-I-S-C-O-V-E-R` |
| Explore | `E-X-P-L-O-R-E` |
| Shop | `S-H-O-P` |
| Available | `A-V-A-I-L-A-B-L-E` |

---

## Heuristic for when to add a guard

Add a per-letter spell-out for a word if **any** of these are true:
- Length > 7 letters.
- Contains a double letter (LL, SS, FF, TT, EE, OO).
- Brand-specific term, fabric trademark, or coined word (always guard these — lock the brief's exact spelling).
- Appears in a position larger than ~24pt in the final canvas (large type = visible typos).
- Contains a hyphen or special character (`®`, `™`, `·`).

When in doubt, add the guard. A bloated prompt always beats a reshipped ad.
