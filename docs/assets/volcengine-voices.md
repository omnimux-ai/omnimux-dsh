# Volcengine voice snapshot and catalog projection

Issue #735 uses the 509-record snapshot in `volcengine-voices.json`. The source
was copied byte-for-byte from the user-supplied OmniMux repository asset, without
provider requests or changes to that repository.

- Snapshot SHA-256: `8361f701c96c25f0cc39933a99cc11e6c13253bbc33b968518d72ebda28acdc3`
- Generated index: `plugins/omnimux/src/catalog/voices/volcengine-voice-index.json`
- Normalization: `plugins/omnimux/src/catalog/voices/normalize.js`

Run from this repository root:

```sh
node scripts/tools/normalize-volcengine-voices.mjs
node scripts/tools/normalize-volcengine-voices.mjs --check
pnpm verify:model-contracts --strict
```

The index is a JSON array, one record per line. `voice_type` is unique. Required
source fields, duplicate IDs and unsupported resource IDs fail normalization.
The source snapshot is not rewritten. Tests verify all 509 IDs and generated-file
freshness; do not edit the generated index manually.

## Normalization rules

- Preserve official names, display names, IDs and resource IDs.
- Trim and deduplicate comma-separated values. `category` retains recognized
  scene labels, removing redundant language/protocol labels when scenes exist;
  when no scene is available, retain the source category rather than invent one.
- `language` retains every language, normalizes `西语` to `西班牙语` and moves
  `中文-河南口音`-style suffixes into `accent`. Multi-valued strings use `,` without
  spaces; consumers split them for filters. Accents come from language, category
  and name hints. Plain Chinese defaults to `普通话`; uninferable accents are `未知`.
- `gender` uses only a `male`/`female` underscore-delimited ID token (including
  `ICL_uranus_*` prefixes). It is `unknown` otherwise; names do not imply gender.
- Visible `tags` are 抖音同款, 剪映同款, 豆包同款 and 猫箱同款. Yes/no flags and
  protocol notes are not product tags.
- `hot_order` is ascending. Ranks 1–10 follow the Issue's core order by ID:
  广告解说 2.0, 顾姐 2.0, 解说小明, 知性女声 2.0, 清爽男大 2.0, Charlie 2.0,
  悬疑解说, 爽快思思, 渊博小叔 2.0, 亲切女声 2.0. The snapshot names 爽快思思 as
  `爽快思思/Skye`; the official display label is preserved.
- Other records rank by additive tag weight: 抖音=4, 剪映=2, 豆包=1. Ties retain
  source order. Core records or any of these three tags set `is_hot=true`.
  猫箱同款 alone does not mark a record hot.

## Single-source consumption

`audio-models.yaml` declares `voice.optionsFrom: volcengine-voice-index` and the
existing default voice. The catalog loader resolves only this registered source
into `{ value: voice_type, label: display_name, meta: <normalized record> }`.
Unknown sources, duplicate IDs, conflicting inline options and invalid defaults
fail closed. Snapshot bytes join the loader cache key; parameter changes also
change the published catalog fingerprint.

SubmitGuard uses the same resolved `options` as the Catalog DTO. All 509 IDs,
including the two model aliases, are allowed; unknown voices such as `alloy`
remain rejected. The generated metadata is never part of the provider payload.
`catalog-defaults.json` retains `text_to_speech: seed-audio-1.0`; the voice default
stays in the model declaration, not a second defaults table.

Workflow consumers use `schema.voice.options[].meta`, typed by
`plugins/omnimux-workflow/src/shared/voiceCatalog.ts`. Legacy value/label-only
voice options remain valid. Do not import hub-private modules or bundle another
copy of the index into workflow. There are no preview URLs or paid preview calls.

For synchronous `audio + text_to_speech`, `materialGatewayExecutor.ts` removes
`references`, `audio`, `audioTrack` and legacy image/interleaved reference carriers
before submission. Inferred operations use the same rule. Music and video media
contracts are unchanged; missing text and invalid operation checks still apply.

## Offline verification

```sh
# Needed in a fresh worktree before tests that load built routes/manifest.
pnpm --filter omnimux-workflow build
pnpm --filter omnimux test
pnpm --filter omnimux-workflow test
pnpm --filter omnimux-workflow typecheck
```

Mock request capture proves payload mapping and whitelist admission, not live
provider availability or voice quality. Do not commit workflow `dist/` or `lib/`
build artifacts.
