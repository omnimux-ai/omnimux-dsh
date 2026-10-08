# omnimux (execution hub)

Product scope follows [product positioning](../../docs/contracts/product-positioning.md) and root rules; the existing domain mission does not authorize matrix-publishing expansion or prove shipped capability.


The hub is the only place OmniMux talks to providers. Root [AGENTS.md](../../AGENTS.md) still applies; this file adds hub-only rules. The normative I/O lives in the [hub contract](../../docs/contracts/hub.md).

## Owns / does not own

| Hub owns | Hub never owns |
| --- | --- |
| Product chrome, sign-in, credentials and `OMNIMUX_*` secrets | Any domain plugin's store (`series/`, 货盘, `library.json`, …) |
| Provider HTTP, polling, downloads, model routes (`src/media`, `src/text`, `src/catalog`) | Domain workflow logic or domain UI |
| Neutral seams (`ctx.provide`) and `omnimux_*` official-only tools | A second chat tool; chat stays on the `llm-pi-ai` `omnimux` route |
| The composer model list (`cordis.patch.yml`) and canvas model catalog | Vendor-specific fields on a seam |

## Hard bounds

- Call it the execution hub, never a "gateway"; no second router, hub-chrome plugin, or OmniMux HTTP client anywhere else.
- Never import a domain plugin's private modules, including from tests; consume only public APIs or seams (`pnpm check:boundaries`).
- A seam returns a result object or throws. Missing provider → `needs-provider`; official-only tool while unconfigured or signed out → `needs-omnimux`. Never return 500, an empty success, or `mode: "live"` for a stub.
- Keep vendor fields and protocol paths inside the protocol/vendor-map layers; never copy cloud channel integers into the hub. Unknown provider or protocol fails at resolve, not mid-HTTP.
- Deployment-varying choices (brand strings, `media.providers`, `text.models`, `gate`) are validated `Config` fields, not constants inside `apply()`.
- Route every scenario call across all registered channels; never gate a capability on the chat model or a global mode ([channels](../../docs/contracts/hub.md#channels-and-consumption-scenarios-no-exclusive-modes)).
- Propagate upstream auth/capability errors with their real cause; no empty `catch {}`.
- Hub events go through the single event WebSocket ([workbench sync](../../docs/contracts/agent-workbench-sync.md)); domain plugins emit via `ctx.get('hubEvents')`, never a private socket.
- Model rows change only per [model-list ownership](../../docs/contracts/model-list-ownership.md) and close across consuming plugins.
- Model listing lifecycle: When adding or enabling a model for canvas/consumers, execute the 5-step loop atomically (contract definition, authorized live probe in docs/evidence/, promote research from draft to verified so op.listed=true, manifest requiredInAuto, channel groups + canvas whitelist, and strict gate verification). Never stop at "draft" when user requests model listing or canvas availability.

## Verify

| Change | Command |
| --- | --- |
| Any hub source | `pnpm --filter omnimux test` + `pnpm check:boundaries` |
| Routes, providers, local paths | `pnpm verify:product-baseline` |
| Model rows, operations, aliases | `pnpm verify:model-contracts` |
| Agent tools | `pnpm test:agent-tools` |
