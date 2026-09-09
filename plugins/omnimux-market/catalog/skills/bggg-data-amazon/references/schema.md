# Amazon collection contract

## Target TSV

Required column: `asin`.

Optional columns:

- `mode`: `basic`, `full`, or `max`; default `basic`
- `lang`: normalized row language; default `EN`
- `title`: product name stored in context

## Evidence directory

Keep:

- `ASIN_mode.attemptN.json`
- `ASIN_mode.attemptN.stdout.log`
- `ASIN_mode.attemptN.stderr.log`
- reconciled `ASIN_mode.json`
- `acquisition_manifest.json`
- `normalize_summary.json`

The acquisition manifest uses these target statuses:

- `complete`: one clean attempt returned written reviews
- `complete_no_reviews`: the endpoint returned valid JSON with no visible written reviews
- `partial_best_available`: at least one request failed, but usable reviews were preserved
- `failed`: requests failed and no usable reviews were collected

## Normalized JSONL

Rows contain `platform`, `lang`, `source_id`, nullable `native_id`, parsed `date`, `date_raw`, exact `text_raw`, engagement fields, source/ASIN/product context, `keyword_hit`, and `round`.
