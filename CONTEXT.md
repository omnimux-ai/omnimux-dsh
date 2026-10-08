# Domain

This repo lands OmniMux on official dsh. `omnimux` is the execution hub, not a gateway. Platform and domain plugins send requests into hub seams and manage their respective stores. I/O: `docs/contracts/hub.md`.

## Product language

**Character generation（角色生成）**: Establishing a character from a description or an authorized photo, then producing reusable character images.

**Character video replication（角色视频复刻）**: Producing a video with the chosen character and a reference video's intended motion or expression. It does not promise exact reproduction or automated social publishing.

Current product scope and public wording: [product positioning](docs/contracts/product-positioning.md). The component map below names existing responsibilities, not shipped capabilities or permission to expand that scope.

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

## Official voice preview language

**Voice identity（音色身份）**: The provider's stable voice identifier used to select a synthesis voice. A display name or sample filename is not its identity.

**Official voice preview（官方音色试听）**: A provider-hosted sample that demonstrates a voice; it is not a user-generated output, a reusable media asset, or permission to redistribute the sample.
_Avoid_: Generated speech, cloned voice, local recording

**Verified sample file（已验证样音文件）**: A sample URL whose anonymous response, audio MIME and audio file header were observed at a recorded time. This status does not establish playback in every browser, voice-version identity or redistribution rights.

**Unverified preview（未验证试听）**: A voice with no verified sample URL in the shared mapping. It remains a selectable voice and does not imply the provider has no sample.

**Preview-only（仅试听）**: A sample's permitted product use is audition and viewing its details, not adding media to a conversation or saving it into the asset library.
