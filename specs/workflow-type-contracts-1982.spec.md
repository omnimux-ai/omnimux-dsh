# Workflow type contract prerequisite — #1982

## Acceptance
- Canvas static type check passes with existing strict and unchecked-index settings unchanged.
- Single/multiple/absent channel constraints preserve current resolution; selected-node context still distinguishes zero/one/many nodes.
- Shared material data declares its existing string-array standby-edge field; no runtime slot logic changes.
- Group top-bar left position remains the existing numeric pixel inset; only its declared type is corrected.
- Run relevant existing offline tests and static check. No new UI behavior, browser, model admission, dependency installation or publication.
