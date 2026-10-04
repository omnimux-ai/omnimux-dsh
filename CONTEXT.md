# Domain

This repo lands OmniMux on official dsh. `omnimux` is the execution hub, not a gateway. Platform and domain plugins send requests into hub seams and manage their respective stores. I/O: `docs/contracts/hub.md`.

## Architecture & Responsibilities

| Role | Responsibility |
|---|---|
| **Execution Hub (`omnimux`)** | Chrome/brand identity, auth/identity, model routing, execution seams (`videoGenerate`, `imageGenerate`, `textComplete`), official tools (`omnimux_*`). |
| **Workflow Canvas (`omnimux-workflow`)** | Visual DAG node orchestration, text/image/video generation node pipeline, workflow execution tools (`workflow_*`). |
| **Asset Library (`omnimux-assets`)** | Reusable characters, scenes, styles, props, and prompt packages (`assets_*`). |
| **Product Library (`omnimux-products`)** | E-commerce product catalog with selling points, target audience, and media assets (`products_*`). |
| **Video Clip Studio (`omnimux-clip`)** | Timeline video editing studio based on OpenReel engine integration (`clip_*`). |
| **Social Matrix & Accounts (`omnimux-accounts`)** | Social accounts authorization and status matrix. |
| **Inspiration Library (`omnimux-inspiration`)** | Community trends, prompt inspirations, and creative ideas. |
| **Publishing Center (`omnimux-publish`)** | Cross-platform multi-account post publishing and schedule ledger (`publish_*`). |
| **Market & Skills (`omnimux-market`)** | Plaza catalog, SkillHub skill integration, and connector manager. |
| **Analytics (`omnimux-analytics`)** | Cross-plugin tool execution metrics and social posting analytics. |

## Seams & Contracts

- Hub I/O: `docs/contracts/hub.md`.
- What is real vs stub: `docs/capabilities.md`.
- UI Design System: `design.md` and `docs/contracts/ui-design-guidelines.md`.

## Canvas input language

**Upstream material（上游素材）**: Content supplied by another canvas node for generation, including text and supported media or documents. A material's input type is independent of the receiving node's output type.
_Avoid_: Media-only attachment

**Input contract（输入契约）**: The model, operation and channel's supported input sources, types, formats, roles, constraints and combinations.

**Feed（供给）**: Content a connected upstream node can provide. Availability as feed does not imply selection for consumption.

**Binding（使用绑定）**: A selected upstream output and its intended role in the receiving generation. A binding can be inactive without removing its source or connection.

**Material slot（素材卡槽）**: The receiving generation's entry and representation for upstream bindings. Text-only upstream capability also qualifies for a material slot.

**Local text（本节点文本）**: Text entered directly in the receiving node. It is distinct from upstream material even when both contribute to one final request field.

## Browser side-panel media language（#2973）

**Produced media（产物媒体）**: Media an assistant turn placed on screen — `display_file`/`read_image` results and `omnimux_*_submit` written files. It lives in `tool/result` event payloads (meta / content image blocks / `<path>` envelope / JSON `dest`), not in durable message image blocks.

**Produced registry（产物登记处）**: The bridge's per-session whitelist of produced absolute paths, accumulated while relaying `session/event` frames and backfilled from `session.history`. It is the sole authorization source for `omnimux.producedMedia` byte fetches.

**ProducedMediaRef**: The panel's media reference union — `attachment` source (bytes via `session.attachment`) or `path` source (bytes via `omnimux.producedMedia`). `kind` follows the viewer's `ViewerKind` vocabulary.

## Browser collected media language

**Collected image（网页采集图片）**: A picture the user explicitly selects for reuse in the asset library. Its saved form contains a usable image file, not only a page or media link.

**Video cover（视频封面）**: A still image representing a video work. The work remains a video when its on-page preview is a picture.
_Avoid_: Collected image

**Asset save（加入资产库）**: A completed save of reusable material into the user's asset library. An extension-only record or inspiration entry is not an asset save.

**Inspiration save（加入灵感库）**: A save of a creative reference into the inspiration library; video works retain this destination.
