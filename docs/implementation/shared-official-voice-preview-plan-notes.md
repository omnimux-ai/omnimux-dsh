---
title: "官方音色共享试听：已批准架构与实施备注"
id: "log-shared-official-voice-preview-plan-notes-3058"
type: "log"
status: "living"
authority: "L3"
date: "2026-10-03"
updated: "2026-10-04"
---

# 官方音色共享试听：已批准架构与实施备注

日期：2026-10-03
角色：架构师 · 高见远（Gao）
状态：**USER_APPROVED / IMPLEMENTED_PENDING_ACCEPTANCE**。
历史设计读取基线为 `90cd8db5baafca9edeb7980fdc8ffaac16e1f2b7`；后续实施与 QA 报告记录的基准为 `0deb18ee3f6e6f0448db874d05872238a273c73e`，含未提交任务改动。本次仅同步文档，未重新查询 Git 或执行测试、构建、runtime、收费调用、物化或发布。批准与实施不等于双端签收。

## 2026-10-04 交付索引与历史边界

当前证据入口为 [本票交付页](<../evidence/shared-official-voice-preview/delivery-20261004.md>)。最新本机 OCR 三源 fresh 加 25 项同 SHA 完整复用，覆盖 28 个唯一源；产品真源为 [限定终验签收](<../product/shared-official-voice-preview-pm-sign-off-20261004.md>)，判定保持 `PM_SIGN_OFF: PASS_SCOPED`。下文 2026-10-03 的失败、待验和未开展描述均为当时记录，不改写为历史 PASS。#3059 只读研究已经完成，分类见交付页；运行时仍 124 verified，未集成研究新增候选。主规格前 56 行原字节及验收保持，不加入物理路径或局部几何新要求。

### 从主规格移回的主题实施登记（历史原文）

以下仅登记原附录实施范围，不作为新产品规格；后续局部几何以 [产品四件套附录](<../product/voice-picker-ui-polish-3058.md>) 为真源，真实验收以独立 QA 和产品签收为准。

## #3058 音色弹窗局部主题颜色恢复（PM92 APPROVED，附录 T 已实现澄清）
- 问题：round6 接入真实官方 light 主题后，音色弹窗仍保留 CustomModal 固定暗底，浅色文字落在暗面。
- 范围：仅 `plugins/omnimux-workflow/src/canvas/theme/components.css` 中 `.wf-voice-picker-modal` 局部限定块 + 本票一条 CSS 合同测试；不全局改 CustomModal / CustomSelect / 其它 modal，不动 DOM/文案/几何/状态。
- 唯一 token 字典（附录 T.3）：表面 `var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)))`；外框 `var(--dsw-alias-border, var(--dsw-alias-border-l2))`；label-primary/secondary/tertiary、border-l1/l2/l3、interactive-bg-hover/active、bg-mask-1、brand-primary 沿用；禁用 `--wb-*` 残留、裸 hex/rgba、新变量、JS 主题特判。
- portal 下拉限定：`body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown` 及其 option/hover/selected/check 同色链。
- 验收：CSS 合同断言（颜色 token 链 + 仅局部 scope + 无裸色）；真实 light/dark 截图与 computed 验收归 QA 车道后续，本票不做。

## Conclusion（2026-10-03 历史记录）

**用户已批准并实施：既有执行中枢 hub 持有官方试听附属映射与唯一候选规则，经现有 `modelCatalog` 下发 preview DTO；hub 离线导出同源 JSON 快照，资产 builder 消费公开数据契约。** 不新增音色 registry、共享包、独立预览服务或媒体代理，两消费者不 import hub 内部实现。现存文件与原规格附录的物理切片登记在 §9，Matt [主规格](<../../specs/shared-official-voice-preview.spec.md>)正文保留无路径模板与已批准验收。

hub 已拥有随包音色索引与 Catalog；画布沿既有 capabilities 消费，资产构建无需启动 hub。中性包会新增发行与 Dev 物化成本，首版未采用。正式 preset 的依赖闭包与 Dev 同步仍是不同证据边界；hub 归属是可逆的 MVP 选择，本次不新增 ADR。

首批 124 个 matchedUrl 来自前序文件审计，含 38 个代号与 86 个别名命中；其余 385 个保留身份与选择。`schema_version` 只标数据结构，`verified-file` 只标历史文件探测资格，**都不证明当前双端真实播放、官方声线版本身份或转载权利**。媒体直读官方 HTTPS，不以收费 TTS、R2 转存或近似音色补齐。

[产品四件套](<../product/shared-official-voice-preview-ui.md>)的首版仅试听/详情、未验证无播放键、核定失败提示与验收 seams 均已批准，不再要求用户重复批准技术方案。真实双端旅程尚未签收：Sol 规格轴原两项 HIGH 已有修复与独立源码复核，复核又发现键盘试听误选 HIGH 和详情缺候选回退 MEDIUM，仍待整改/验收；OCR 仍部分覆盖，浏览器 round4 为 NOT_PASS。runner 新整改状态为 RUNNER_FIXED_NOT_RUN，画布三代表的旧原生播放局部通过不能外推资产库或整改后的整版源码。实际命令、历史计数和缺证归属见[执行协调](<voice-preview-implementation-coordination.md>)。

**两张已批准一级票保持垂直薄片**：#3058 首批共用试听贯穿数据、目录/HTTP、两 UI 和包加载；#3059 在首票验收、演示确认并合入后核对余下官方链接，不反向阻塞首票。当前没有独立 importer CLI，初始映射的审计 hash/逐条 URL 一致性与 runtime fail-closed 已有证据。是否另增维护 CLI 仅列 #3059 可选维护工作，不虚报为 #3058 完成项。

## Evidence

### E1：来源证据与计数复核

历史设计读取了[前序调查](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/voice-preview-investigation-20261003/report.md#L15-L39>)和原始审计；[任务内审计副本](<../evidence/shared-official-voice-preview/initial-candidate-audit.json#L1-L23>)现为来源发现入口。原审计 `checkedAt=2026-10-03T15:10:20.311Z`，方法为既有画布候选函数、匿名 `GET Range bytes=0-1023`、2xx + audio MIME + MP3 头。本次未重新联网探测。

下表保留历史设计校核结果，不作为本次新运行结果：

| 项 | 实测结果 |
|---|---:|
| audit results / 唯一 voice_type | 509 / 509 |
| hub catalog / 唯一 voice_type | 509 / 509 |
| audit 不在 hub / hub 不在 audit | 0 / 0 |
| matchedUrl 满足对应 attempt 的 2xx、audio、mp3Header、playableFile | 124 |
| 不合格 matchedUrl | 0 |
| 解码 URL 文件名等于 voice_type.mp3 / 其他别名 | 38 / 86 |
| 无 matchedUrl | 385 |
| 资产索引 voiceover 行 / 有 media_url / 保留 voice_type meta | 509 / 0 / 0 |

原始审计 SHA-256：`ef8ab1047fe4fcafec6cc9d3d3a75293365cce9c119ff329b87e5ab5ba85abe4`。此文件保持不变。前序对林潇完整 GET、ffprobe、ffmpeg 解码成立，但报告明确未取得真实弹窗播放验收；不能把文件探测当 UI 验收。

### E2：历史设计读取的单源与官方接缝（现状见 §9）

- [CONTEXT](<../../CONTEXT.md#L3-L24>)：hub 是 execution hub，不是 gateway；画布与资产库各自负责领域存储；设计衔接既有[设计规范](<../../design.md>)。
- [hub 契约](<../../docs/contracts/hub.md#L29-L42>)：「Apps and other plugins consume the same seams. They must not import omnimux internals」。[公开 modelCatalog](<../../docs/contracts/hub.md#L146-L147>) 已提供 `list()` 和 `GET /omnimux/model-catalog`。
- [索引 snapshot loader](<../../plugins/omnimux/src/catalog/voices/options.js#L3-L23>) 通过 `new URL(..., import.meta.url)` 读包内索引，返回 `{value: voice_type, label: display_name, meta: voice}`。`materializeVoiceOptions` 验证唯一 ID 与 optionsFrom，不造另一份 registry。
- [hub voice search](<../../plugins/omnimux/src/media/voices.js#L3-L11>) 也读取同一 JSON；[voices mount](<../../plugins/omnimux/src/media/voices-mount.js#L21-L52>) 当前只有工具，不是 HTTP voice search 或 provide 服务。不得声称已存在专用 `voicePreview` seam。
- [画布 Catalog adapter](<../../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts#L21-L41>) 实际 `ctx.get('modelCatalog')`；[画布浏览器 adapter](<../../plugins/omnimux-workflow/src/canvas/bridge/apiClient.ts#L83-L89>) fetch 自有 capabilities。preview 放进既有 `schema.voice.options[].meta` 即可沿现有链路下发；仍须测试 projectCanvasCatalog 无损传递。
- [voiceCatalog 类型](<../../plugins/omnimux-workflow/src/shared/voiceCatalog.ts#L1-L18>) 明示「never a second voice registry」。resource_id 是版本/模型元数据，不是试听 identity。

### E3：历史设计断点与原有播放 Adapter（不作当前缺陷结论）

- [voicePickerModel 候选](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.ts#L196-L253>) 与 [Dialog 候选](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L35-L92>) 重复。顺序为外语/斜杠别名 → 代号 → 原名 → 去 2.0；不能简化成代号拼接。
- [画布播放](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L141-L193>) `new Audio` + 候选回退；`onerror` 与 play rejection 都可推进，需要去重防同一失败双推进，迟到失败也不能清空新请求。
- [collectVoices](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L1767-L1793>) 读取外部 assets-root 的原始音色 JSON，不设置 remoteMedia，写 `playable:false`；[索引压缩](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L2242-L2268>) 只选 source_media/source_cover/dims，丢音色 identity。
- [normalizer](<../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js#L154-L171>) 丢 voice_type/resource_id/preview；只有 hasMedia/playable，未区分试听与普通媒体。
- [资产试听 hook](<../../plugins/omnimux-assets/src/client/use-cloud-assets-feed.js#L62-L126>) 已有单播、停止、卸载清理，但只播 media route，没有候选回退，失败静默清空状态。
- [现有详情转换](<../../plugins/omnimux-assets/src/client/cloud-preview.js#L44-L60>) 把 audio 行指向 cloudMediaUrl。仅补 URL 会自动带出既有详情/下载/会话路径；[saveToLocal](<../../plugins/omnimux-assets/src/cloud-catalog.js#L366-L419>) 确实会下载 remoteMedia。

### E4：历史读取的生成目录 → Host HTTP 公开 seam

- [builder 输出合同](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L57-L83>) 是 manifest/index/分页树；[Host loader](<../../plugins/omnimux-assets/src/cloud-catalog.js#L125-L178>) 默认使用插件相对 cloud-catalog，不读取开发机资产库。
- [search](<../../plugins/omnimux-assets/src/cloud-catalog.js#L238-L269>) 遍历 index，只匹配 name/description/tags；保留 voice_type 后须纳入匹配，不然按代号检索仍失败。
- [media route](<../../plugins/omnimux-assets/src/http-routes.js#L308-L327>) 根据目录内 opaque ID 返回 302 到 remote URL，不是持久化、转码、Range byte proxy。Range 和音频 MIME 最终由官方 CDN 返回。
- [cloud-source](<../../plugins/omnimux-assets/src/client/cloud-source.js#L4-L29>) 页元数据默认先读 `https://omnimux.ai/cloud-assets-catalog`，不可达回落本地；[client search](<../../plugins/omnimux-assets/src/client/api.js#L225-L262>) 与 media 一直走 Host。线上分页和本地 index 可能不同版，单改本地 builder 不保证用户所见一致。
- [assets-root 入参](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L2141-L2166>) 是明确的构建参数，但全文构建仍要求该外部目录存在。manifest.sourceRoot 已写空。**运行时无本机依赖 ≠ 音色目录可在干净 CI 独立重建**。

### E5：历史设计读取的构建、包清单、Dev 与 CI

- [根包](<../../package.json#L9-L30>) 与 [workspace](<../../pnpm-workspace.yaml#L1-L4>) 是 pnpm 11.7、多插件 ESM；三目标包为 React/esbuild 客户端，画布另有 TypeScript。
- 历史 [hub files](<../../plugins/omnimux/package.json#L5-L29>)已包含 src，但当时未有 build-time voice exporter。现存包清单已列复数 exporter，见 §9.1；这不是待技术批准项，内部 voice 模块仍不作消费者 import 接口。
- [assets files/scripts](<../../plugins/omnimux-assets/package.json#L5-L24>) 包含 cloud-catalog 和 builder；`build`/`prepare` 仅 build-client，**不重建目录**。
- [workflow files](<../../plugins/omnimux-workflow/package.json#L5-L24>) 带 dist/index.js、lib/client.js、lib/canvas.js、src/shared；[canvas build](<../../plugins/omnimux-workflow/scripts/build-canvas.mjs#L25-L53>) browser IIFE 全量 bundle React 19；[host build](<../../plugins/omnimux-workflow/scripts/build-host.mjs#L12-L27>) ESM bundle Node host。不能在 browser import node:fs；不能对相对 JSON 文件用 new URL 假设 esbuild 会复制资产。
- [Dev build dispatch](<../../scripts/sync-to-app.sh#L449-L507>) hub/assets 只 build-client、workflow build host+client+canvas；不会触发新增的离线 voice exporter 或 cloud builder。
- [Dev 物化](<../../scripts/sync-stable.sh#L389-L423>) rsync 插件自身、排除 node_modules；只把 dsh-ui-kit 的 file 路径重写为同级。其余任意 `file:../../packages/...` 不被处理。安装后还比对[打包文件/指纹](<../../scripts/sync-stable.sh#L671-L778>)。
- [桌面 preset stage](</Users/x/Desktop/Project/omnimux-desktop-fork/dsh-plugin-desktop/scripts/stage-preset-profile.ts#L128-L181>) 构造闭包并检自包含；[file 递归](</Users/x/Desktop/Project/omnimux-desktop-fork/dsh-plugin-desktop/scripts/stage-preset-profile.ts#L235-L266>) 可复制 dependencies/optionalDependencies 中的本地普通包。这不证明单插件 npm 发布或 Dev 同步自动具备该闭包。
- [CI](<../../.github/workflows/quality-gate.yml#L54-L61>) 已改为真实 workspace `pnpm install --frozen-lockfile --ignore-scripts`，不再是 QA_DEPS；[后续步骤](<../../.github/workflows/quality-gate.yml#L171-L191>) 另建 host/canvas、跑所有插件测试和真实 Cordis 加载。`build-all` [优先 build-client](<../../scripts/build-all.mjs#L82-L104>)，不扫描 packages、不导出 voice、不重建 cloud-catalog。

### E6：历史设计轮只读验证结果与限度（本次未运行）

执行并通过 `node scripts/verify-plugin-boundaries.mjs`（3871 源文件）、`node scripts/verify-package-files.mjs`（21 插件）、`node scripts/verify-product-baseline.mjs`（现有 1 条历史 provenance 豁免）、`bash -n scripts/sync-to-app.sh scripts/sync-stable.sh`。这些命令不修改门禁；只证明当前树的静态约束，**不证明新方案的 tarball 可加载**。

另执行真实 loader probe：将 cwd 改成 `/`，用当前 hub/资产插件模块加载，hub 可查到林潇的 voice_type/resource_id、资产 catalog.ready=true、voiceover total=509，REAL_EXIT=0。这只证明当前包相对 loader 不依赖 cwd，模块仍来自 repo；不是断开仓库后的安装验收。

Dev profile 文件枚举超时/未定位到有效快照，故本轮没有取得该目录内容或实际安装加载证据。未执行 pack（prepare 可能写业务构建产物）、pnpm install、构建或 sync。

实时完整读取官方文档：[打包与安装](<https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.md>)、[服务与依赖](<https://deepseek-harness.github.io/deepseek-harness/develop/framework/service.md>)、[HTTP 服务器](<https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/web-server.md>)。官方规定普通库不必 dsh.bundle；npm/tarball 应预构建；git prepare 必须自包含；服务 inject/ctx.get 是运行中 Interface，不能当离线 builder 的依赖；webServer.register 是官方 Host route 席位。线上文档不等同安装 pin，实际实现仍按本仓调用核对。

## 1. 术语与不变量

- **Voice identity**：既有 `voice_type`，唯一关联键。asset ID 保持当前 hash；中文名、URL 文件名、resource_id 均不作 identity。
- **Official preview mapping**：由来源证据支持的 voice_type → primary 官方 URL 稀疏映射，仅是既有 registry 的附属数据，不定义音色/模型兼容/热度/排序。
- **Candidate**：按现有规则产生、去重的尝试 URL；不等于 verified mapping。成功播放不会自动升格发布记录。
- **Preview projection**：从 registry + mapping + candidate policy 计算的只读 DTO，分别沿 Catalog 和生成资产目录发放；不允许手填维护副本。
- **Module / Interface / Seam / Adapter**：hub Module 隐藏查表、验证口径、别名、去重；Interface 是固定 preview DTO；seam 位于既有 Catalog 与离线 JSON 导出；Canvas/Assets 的播放 Adapter 使用该 DTO。
- 509 个 voice 保留、现有生成 voice/resource_id 语义不变；映射不能缩成新「124 音色 registry」。运行时不得请求 TTS、创建生成历史、写素材或改 voice 参数。

## 2. Implementation Decisions：已批准的 seam 选择

### 2.1 两种方案的真实成本

| 维度 | 未采用：中性共享包 | 已批准：hub 官方数据 seam |
|---|---|---|
| 身份归属 | 必须仍由 hub registry 提供，包只做 mapping/resolver；若拷 509 catalog 就变平行 registry | hub registry 原位保留，mapping 为附属数据 |
| Node builder | 普通 package export 可 import，无 Cordis；有依赖安装要求 | hub 自己 CLI 离线导出，builder 只读 JSON；不启动 Host |
| Browser | 必须 browser-safe ESM，Node loader 单独 export；esbuild 内联 | 不 import hub，已有 Catalog DTO 下发候选 |
| npm 独立安装 | 需可发布版本或消费者 prebundle；仅 file:workspace 不是可分发声明 | 新 preview 不增加 npm 依赖，hub src 和 assets cloud-catalog 已在 files；新 exporter 需声明 |
| Dev 命名同步 | 当前不会物化任意共享包；需改同步设施或完全消除运行时依赖 | 三插件已有同步路径可携带 src/目录/内联 bundle，无新包同步设施 |
| desktop preset | 现有递归 file 闭包可处理新包，但应真实验证 | 原有包布局，仍需验证 offline seed |
| CI | install 可解，build-all 不构建 packages，需无编译 ESM或额外构建 | workspace 可离线执行 hub exporter，插件测试能覆盖；禁止 CI 构建时联网取样 |
| 维护局部性 | mapping 拥有者易与 hub catalog 分裂 | identity、mapping、candidate policy 集中；消费者只做播放/展示 |

拒绝 `assets` import `workflow/.../voicePickerModel`；也拒绝两插件从仓库相对路径直接 import hub private module，即使目前 regex 没拦住。静态门禁 regex 不是公共契约批准。若以后存在第三方非 hub 实际消费者，再评估中性包；目前不为假设增加发行/同步依赖。

### 2.2 已批准拓扑

```text
既有 509 voice registry ─┐
已验证稀疏 mapping ─────┼─ hub preview Module（唯一候选规则；无网络、无收费调用）
既有 candidate policy ──┘     │
                              ├─ modelCatalog.list() / GET model-catalog
                              │      → workflow Host capabilities → canvas bundle → Audio Adapter
                              │
                              └─ hub offline export CLI（公开 JSON Interface）
                                     → voice snapshot → assets builder / voice-only refresh
                                         → manifest + index + category/all pages
                                             → Host search + media redirect → assets Audio Adapter
                                             → 现有官方静态元数据发布（需另行授权）
```

`ctx.get()` 只发生在已运行的 Host；构建时没有 ctx、没有注入实例。导出 CLI 位于 hub 自己的包内，可以调用本包实现；root 编排器启动 CLI，资产 builder 读取其 JSON，不跨 import hub 代码。实际导出 CLI 接收 `--out FILE`、`--check FILE` 或 stdout；无内部路径写入 DTO，已被 hub files 清单显式覆盖。包内执行还需合法声明依赖闭包，不借旁边 monorepo 解析冒充独立运行。

## 3. 数据结构与公开 Interface

### 3.1 已批准数据接口（与实际导出对齐）

```ts
type VoicePreview = {
  purpose: 'official-voice-preview';
  state: 'verified-file' | 'unverified';
  primary_url: string | null;
  candidates: readonly string[]; // 有序去重；primary 如有永远第一个
  checked_at: string | null;
  evidence_ref: string | null;   // 内容地址/记录定位符，不是本机路径
};
// 既有 VoiceOptionMeta 增加一个可选 preview；其余字段原样保留。
// meta.voice_type / resource_id 在上层已存在，不在 preview 重复。
type VoicePreviewSnapshot = {
  schema_version: 1;
  purpose: 'official-voice-preview';
  catalog_fingerprint: string;
  preview_fingerprint: string;
  voices: readonly (ExistingVoiceRecord & { preview: VoicePreview })[];
};
```

无 badge/tagline/icon/subtitle/营销标签扩展。resource_id 不再为 preview 新造 union，也不随 URL 改写。候选数组确实含未验证 URL；验证资格必须看 state，不能看候选数量或 hasMedia。schema_version 仅表示数据形状；Catalog fingerprint 沿既有模型/选项内容计算，preview_fingerprint 为实际 mapping 原字节 SHA-256，不能声称后者独立封存候选算法源码，也不能用构建时间假冒内容版本。preview_fingerprint 同时进入现有 hub Catalog 顶层、画布 capabilities 顶层与资产 manifest；对应 DTO/透传类型只增加这一必要版本字段。asset 行无需重复携带全目录 fingerprint，但其页/search 来源必须可关联到所读 manifest；比较时不可只比 generatedAt。

实际持久 mapping 使用 `voices[voice_type] = filename` 与固定官方 `cdn_base`，根对象携带 `purpose`、`schema_version`、`audit.checked_at`、`audit.evidence_ref` 和 `audit.sha256`；投影才产生 `primary_url`。mapping 仅纳入合格 matchedUrl，所有 404 attempts 留在原审计。初始 124 只声明 file-probe，不伪加官方页面身份或转载授权。审计 hash、时间、逐条解析 URL 一致性已有来源测试与独立后端 QA 证据；这不证明不存在的 importer CLI 已完成。S2 新记录另保留真实官方来源与身份关联证据。

### 3.2 Catalog seam

保持 `modelCatalog.list()` 和 `GET /omnimux/model-catalog`；每条已有 voice option 的 meta 附 preview。不新增 provider、不挂 `audioGenerate`、不要求 TTS tool enabled。公开 CDN 试听非 OmniMux cloud official-only C-class tool，不需要虚构 needs-omnimux/key；仍沿宿主本身的连接与认证策略。

preview 内容进入 hub content cache key，独立 `preview_fingerprint` 来自同次加载 mapping 的 SHA-256，经 Catalog、exporter、capabilities 与资产 manifest 传递。[Catalog 整改报告](<../../.agent-reports/shared-official-voice-preview/catalog-fixes.md#L25-L34>)和[指纹透传报告](<../../.agent-reports/shared-official-voice-preview/workflow-fingerprint-fix.md>)记录实现与历史验证；一般 `fingerprint` 和 `:canvas:` curation 后缀不替代 preview 指纹。生成约束仍使用既有 identity whitelist，不以 preview 状态限制选择。

### 3.3 资产生成目录 / search / media seam

- `media_url` 只给 verified-file 行填 primary 官方 HTTPS，media_type=audio，meta.playable=true；无验证的行保留空 media_url / 文本卡，不把 guessed 候选填成可播放事实。
- 页、all 页、index 同步保留 meta 的 `source='volcengine'`、voice_type、resource_id、preview 与 playable。客户端 normalizer、详情转换继续保留 identity/preview，用 purpose 区分纯试听。搜索既匹配已有名称，也精确/子串匹配 voice_type；搜索结果与分页资格一致。
- `GET /omnimux/assets/cloud/search?...` 仍是现有 Host JSON Interface；`GET /omnimux/assets/cloud/media?id=...&which=media` 仍按 index ID 302 primary。未验证返回既有 media unavailable，不拼候选、不 fetch bytes、不落盘。
- 运行时 fallback 使用下发 candidates，不另造 URL resolver。同一 voice_type、同一 preview_fingerprint，画布 DTO 和资产元数据的 primary/candidates/state 必须完全一致。
- 不新增任意 URL 参数媒体路由；只允许目录内已导入/既有规则下的官方 HTTPS URL。新域名必须来自实际官方来源审查，不接受 caller URL。不绕开现有身份/Origin guard。

### 3.4 已批准的只试听动作 seam

首版 preview-only 已批准：卡片与详情只试听/查看，不保存、不加入会话；Host/API/tool 在任何媒体 fetch 或素材写入前按用途拒绝，错误为 `voice-preview-only`，HTTP 403。客户端同样不提供普通媒体引用，不新增音色引用协议。BGM、SFX、角色等普通资产不变。

[后端独立 QA 第二轮](<../../.agent-reports/shared-official-voice-preview/backend-qa-round2.md#L69-L85>)记录全 509 条真实 tool 拒绝与零网络/写盘/事件。浏览器 round4 未走到资产卡和详情，不能据该后端证据宣称完整 UI 旁路验收通过。未来若增加保存/引用，另定义用途与授权，不更改本次已批准边界。

## 4. build-time、npm、Dev、CI 的加载闭环

### 4.1 生成与重建

已实现**离线 voices-only refresh**，以既有 cloud-catalog 作基线，必须显式传入 `--voice-snapshot=<path>`；全量构建才可默认读取包内快照。使用既有 `volcengine/{voice_type}` identity 和 serializer 更新 index/相关分页，非音色行保持内容等价，不扫描外部 OPC、不下载 MP3。快照与 baseline 音色集合须相等，缺失/未注册行在输出前拒绝；实现和定向历史证据见[后端整改报告](<../../.agent-reports/shared-official-voice-preview/backend-ocr-fixes.md#L15-L39>)，最终验收状态见协调文档。

完整 catalog build 仍可要求显式 assets-root，但其中 collectVoices 改读上述 snapshot，不再从该个人库内的同名 JSON 决定音色。无法在本次最小范围内让整个数千素材目录脱离所有外部构建输入；**本方案保证的是 voice slice 的重建无 local developer dependence，以及产品 runtime 从包/官方 HTTPS 读取**，不虚报全资产流水线完全可重建。

snapshot 是有 provenance/fingerprint 的生成投影，不是 registry。应有 `--check` 验证由真源生成、禁止手填；目录刷新必须失败显式报错，不能 catch 后静默缺失音色。首次迁移保持原 124 evidence；增量 S2 不能重置 checked_at 或用当日构建时间覆盖历史观察。

### 4.2 实际装载矩阵

| 场景 | 新 preview bytes 从哪里来 | 是否需要 repo/本机资产库 | 必须补的证明 |
|---|---|---|---|
| 离线 builder | hub 包内 exporter → JSON；assets builder 读随包 snapshot/显式输入 | voice 不需要 OPC；完整重建其他素材仍有外部输入 | 临时干净目录、仅包内容、cwd 任意，成功生成 voice slice |
| hub Host | 包内 src mapping / registry，相对 import.meta.url | 不需要 | 抽离 tarball 后 list 输出 primary/state/fingerprint |
| canvas browser | capabilities JSON 内 preview，代码已进 lib/canvas.js | 不需要 packages 或 hub JS import | browser bundle 无 node/fs/unresolved hub imports，实际 DTO透传 |
| assets Host | 包内 cloud-catalog index/pages | 不需要 | search/media 返回同身份/primary，preview-only save拒绝 |
| npm/tarball | 已构建 client/canvas + src JSON + cloud-catalog/snapshot + exporter | 新 preview 不依赖 sibling | 真 pack 解包并加载，检查 files、exports、CLI与包依赖闭包 |
| Dev sync | 三个现有插件的 src/目录/bundles | 构建环境需要源码，安装后不需要 | 同步前已生成新目录；同步后 compare源/安装指纹与HTTP |
| CI | 仓内确定性 mapping/registry + offline导出/更新检查 | 不需要个人 assetsRoot 或 Dev home | 插件 scripts.test 实际包含这些检查，干净 install/build/load |

**新 preview 已实现，装载证据仍按 seam 分开。** [后端独立 QA 第二轮](<../../.agent-reports/shared-official-voice-preview/backend-qa-round2.md#L46-L67>)确认真实 hub tarball exporter 在包外解析守卫下物化声明的 yaml 后 stdout/重复导出/`--check` 均成功，四出口指纹一致。该轮仍有测试准备和在途 builder 失败，后续整改日志不改写原失败。完整 clean install、preset/Dev 与双端真实签收尚未建立，不将表格全部标为 PASS。

npm 特别注意：当前三个插件已有 `dsh-ui-kit: file:../../packages/dsh-ui-kit`，不能据 files 通过就宣称它们裸 `npm add <plugin.tgz>` 在干净目录无条件可装。新方案不增这个风险；后续验收应采用真实发布/安装闭包并记录既有 UI 依赖限制。中性包方案若被选，则必须解决它自己的发布版本/预内联/Dev物化，不得照搬该 file 写法后宣布可移植。

Dev sync 不自动导出/重建目录；未来交付工序在 sync 前核对 exporter 与已生成目录，是否需要构建准备脚本不作为本次文档任务的实现项，不改门禁掩盖缺物化。无重启物化仅表示 bytes 到位：Hub/Host 新源码在旧进程中的生命周期尚未更新，资产 index又有首次加载 cache，前端刷新不必然激活 Host 改动。使用隔离测试 Host/真实功能演示，或等待用户自然启动；Agent 不重启、不承诺即时热生效。

CI 当前真实 workspace 可运行离线 exporter，新增测试放现有可发现脚本范围：hub `.test.js`、assets现有 src/client suites、workflow `.test.mjs`。因此可在不修改 CI 门禁实现的前提下由现有 Plugin unit suites执行验证。只运行 build-all不会验证 voice freshness；需由这些业务测试校核同源生成产物（读取/内存生成或沙盒输出，不覆写仓内目录）。

### 4.3 线上目录与本地目录一致性

资产分页默认 remote-first，而 search/media 在 Host；发布线上元数据不在本轮授权。S1 演示用已有 `CLOUD_ASSETS_BASE_URL=local` 或合法运行时 source override固定本地目录，标明该演示不是线上资产目录已更新。正式交付前必须确认官方静态目录发布与本地目录来自同 fingerprint，否则可能只在搜索看见播放键、分页看不见，或反过来。

为 preview 使用者保留 primary/candidates 能支持同源直接官方读取，避免「远端页有新 ID，本地 media index无该 ID」造成伪失败；但**不得借此改变所有普通素材的 source policy**。第一版建议同时维持 remote/local同批发布与按 fingerprint检查；遇到已知不同版不宣称两端一致。是否需要 voice 专属错版处理，在 S1 集成测试/演示中确认，不为假设增加通用 catalog缓存系统。

## 5. UI Adapter 与状态契约

不共享跨 React18/React19 的 React 组件/refs/context，不新造跨插件全局播放总线。共享纯数据 Interface，两 UI 复用现有 Audio Adapter、卡片、Modal、图标和提示载体；[设计规范](<../../design.md#L18-L55>)保持不改，文案与元素服从已批准产品白名单。实现存在不等于白名单/设计真实终验通过。

VoicePickerDialog Props 保持 `open/options/value/onSelect(voiceType)/onClose`；options的既有 meta附 preview。禁止新增 badge等 Props。Assets normalizer增加必要的 voiceType/resourceId/preview，不增加装饰字段。choice值与预览控制完全分离。

状态：idle → loading(candidateIndex, requestToken) → playing → idle；error只属于当前 requestToken和当前candidate的一次结算。primary失败后逐个换候选；同candidate的 error事件与play rejection只能推进一次；旧回调不能复活/清空新音色，旧失败不能toast。Autoplay/NotAllowedError属于用户播放权限拒绝，不靠连续换URL解决；不能谎报官方没样音。结束、停止、关闭、切分类/来源/详情、unmount都清理媒体/监听器。

两端停止沿用归零/清理语义；画布「暂停试听」不承诺断点续播。成功播放不触发 onSelect、voice 参数、会话投递或入库。候选穷尽时一次核定提示「试听暂不可用，请稍后重试。」；英文为「Preview is temporarily unavailable. Try again later.」。[停止证据裁定](<../../.agent-reports/shared-official-voice-preview/pm-stop-evidence-decision.md>)要求联合原生行为证据，不能仅因缺单个 pause 事件判失败，也不能用调用日志替代持续状态窗。

未验证条目无播放键，保留 selection 和待查候选，不进行隐藏自动尝试，也不把临时播放结果写入 mapping。Sol 原两项 HIGH 的[修复报告](<../../.agent-reports/shared-official-voice-preview/sol-high-fixes.md>)记录独立 attempt 元素与定向红绿；[独立规格复核](<../../.agent-reports/shared-official-voice-preview/sol-spec-rereview.md>)从源码确认这两项已解决，但另报键盘试听误选 HIGH、详情缺回退 MEDIUM。原意见不覆盖，新复核未运行测试/UI，本节不宣称完整验收。

## 6. mapping 的来源与合格输入边界

初始 mapping 已由前序审计的 124 个合格 matchedUrl 纳入，保留 `checkedAt`、内容 hash 和 evidence_ref。[来源断言](<../../plugins/omnimux/src/catalog/voices/preview.test.js#L218-L235>)检查审计 hash、时间与每条解析 URL 原字节；[Catalog 整改证据](<../../.agent-reports/shared-official-voice-preview/catalog-fixes.md#L32-L47>)及[后端独立 QA](<../../.agent-reports/shared-official-voice-preview/backend-qa-round2.md#L59-L67>)记录历史通过。测试名含 importer evidence，不能据此声称存在 importer 程序。

runtime 只消费包内附属 mapping，拒绝未注册 voice_type、非注册官方 CDN、越界路径、坏 JSON、非法 purpose/schema 或缺失有效审计声明；exporter 消费同一 Catalog。runtime 不解析历史 audit.source 路径，也不重新探测媒体。来源声明、结构校验和文件验证不等于版权或官方声线版本认证。

#3059 在首票验收后取得新官方页面/文档/接口来源，分开记录身份/版本关联与文件格式证据。新增须为唯一、已注册 voice_type，来源明确，保留检查时间及原件；歧义不升格、不借相近声线，不以 404 判断官方无样音。生成同源快照后比较两端指纹与非音色数据。

独立维护 CLI 当前不存在。是否新增作为 #3059 可选 maintenance 评估，不是 #3058 产品缺实现，也不是本轮完成项。若采用 CLI，仍须执行上述合格输入边界；不扩大到页面自动探测、收费合成或 R2 转载。

## 7. Testing Decisions：按公开 seams 验证，不按内部实现猜绿灯

### T1：registry → mapping / exporter Interface

读取未改的原audit，校核初始124/38/86和385；检查primary first、去重/编码、林潇/阳光阿辰/Charlie/Skye；未知ID、重复ID、非HTTPS、HTML200、错误MIME、坏MP3头、resource_id冲突拒绝。对未命中返回unverified，不返回false「官方无样音」。mapping内容改变必须改publishedfingerprint；热度/模型选择/生成whitelist不变。

### T2：JSON snapshot → 真实目录 → HTTP Interface

用portable fixture /包内真实voice snapshot，任意cwd且无OPC目录生成voice slice；解析真实index/all/category页，不只测collectVoices临时对象。全部509 stableID，124媒体/385空，meta一致，nonvoice等价；search按voice_type返回同条，media route302到exactprimary（最终MP3由CDN负责），无验证/未知ID不偷猜；preview-only save接口先拒绝、无fetch/无磁盘写。重复导出确定性，缺snapshot不静默空目录。

### T3：DTO → 两个浏览器 Audio Adapter

通过真实 Catalog 与页/search DTO 送入现有组件，不 mock 另一份 registry。媒体事件可注入测试：primary→回退，同候选双 failure 的两种先后顺序只结算一次，旧请求与旧 candidate 迟到 NotAllowedError 隔离，ended/stop/close/unmount，播放与选择分离，未验证无入口。详情/卡片停止交接、无动作旁路与普通资产回归均保留。自动化事件不代替真媒体浏览器验收。

### T4：真正打包/安装 seam

实施后在隔离沙盒从真实pack结果解包，关闭scripts（先在授权工作树预构建），不使用repo符号链接/NODE_PATH；读取hub JSON、运行导出CLI、assets Host search/media、workflow dist和browserbundle，native module/未解析相对路径都失败。检查所需files真实存在，不仅清单。npm包安装若因既有UI file依赖失败，真实报告限制，不能用workspace绿代替。再验证desktop preset closure与Dev已安装源的fingerprint，禁止启动/重启生产App。

### T5：真实演示 seam

已批准的独立工作树功能旅程：资产库公共→声音→配音与真实音色弹窗；林潇代号、阳光阿辰中文别名、Charlie 外语别名，知性温婉/Jamie/Rosa 未验证；记录原生 currentTime、停止持续归零/无残留、故障回退提示一次、voice 前后不变及专属截图。使用既有工作树 QA 入口，不使用共享 Dev 或另起 Host/profile。本次不执行旅程；后续不重问既有 QA 授权，完整 PM 终验和用户演示确认仍在合入前保留。文件探测、ffmpeg 或主页截图均不能替代真实双端签收。

## 8. 两张已批准垂直薄片（行为段不含文件路径）

### S1：首批共同试听端到端演示（first shared preview integrated）

**技术/范围批准：已完成；开工无待批准依赖。签收前待补：整改后独立验收、双端真实旅程、PM 终验与用户演示确认。**
**Status：USER_APPROVED / IMPLEMENTED_PENDING_ACCEPTANCE；NOT_PASS 证据不由文档同步改变。**

**要交付的行为：** 用户在资产库配音名录与画布音色选择弹窗中，对同一音色读同版本官方试听资料；首批有证据的链接可试听并停止，主链接失败可按共同候选回退，未核对音色仍可浏览/搜索/选择。试听不生成、不计费、不写生成参数；安装后的包具备同样数据，不依赖维护者的个人素材目录。

**验收：** 原始124证据不变、509 identity保留；分页/全部/搜索与canvas相同voice_type映射一致；别名86不退化成代号拼接；两UI生命周期无残留/迟到回调污染；官方仅试听/详情、未验证无播放键且可选择；生成参数/目录兼容范围不变；真实打包加载、voice-only无私有目录重建与功能路径演示有证据。线上metadata未发布须明确，UI先演示后用户确认才合入。

**票内分工：** 寇豆码负责 hub mapping 的合格输入/来源验证、离线 exporter、builder 目录投影、Host search/media/保存拒绝与包内 seam；裴像素负责两 UI Adapter、身份/用途透传、详情、PM 白名单及媒体状态。Gao 校核接口与文档，Xu 产品终验，QA 独立验收。独立 importer CLI 不在已交付列表，一级单位仍是同一垂直票。

**控制体量：** 同一S1内按证据导入→目录/HTTP→两端DTO/Audio→安装/演示的依赖顺序执行小批次，每批尽量不超过五个业务文件。一级交付仍是一个能独立演示的vertical；不虚报它是几个互不相关UI改动，不把未验证全覆盖塞进来。若批准后实际范围大到无法单上下文验收，回到用户重拆垂直粒度，不擅自发布水平票。

### S2：剩余官方真实链接核对与增量演示（second remaining official-link audit）

**Blocked by：#3058 完整验收、PM 终验、用户演示确认并合入；不依赖一个不存在的 importer CLI。**
**Status：USER_APPROVED / BLOCKED_BY_3058；尚未开展增量来源调查。**

**要交付的行为：** 从官方真实资料核对剩余未命中的音色链接，明确出处/身份/版本，形成增量证据；能核实的样音经相同验证链进入共同映射并在两处演示；无法核实的保留可选音色及事实性未解决记录，不用猜测或TTS补齐。

**验收：** 每条新增有official-link来源+文件检查时间/结果、identity明确；同名/跨版本不借用；原124默认保持、其他数据不回归；同源生成version/fingerprint相同；新命中两UI实际播放/停止与参数隔离；没有新增命中也交付来源范围与未知项，不用「385无官方样音」作结论；0 paid TTS、0未经授权R2转载。

**票内分工：** 寇豆码负责官方链接证据/有界验证/增量导入与目录产物；裴像素只在新数据通过现有Interface后做代表新增命中的两UI演示与回归，不重做播放器/UI；Xu审核未解决项的用户表述，Gao复核identity与证据等级。

**依赖裁定：** #3059 不阻塞 #3058；按已批准产品顺序，先完成首票验收和演示确认并经 PR 合入，再核对其余链接，不等生产发布。是否增加维护 CLI 作为 #3059 可选 maintenance，先确认确有重复维护需要；不新造服务、共享包或本票完成声明。

## 9. Plan-notes（票外）：最小文件范围与归属

本节承接从主规格移出的物理切片登记，仅属票外实施备注；不向 Matt 正文或「要交付的行为」写路径。以下现存实现未由本次文档维护改动，报告中的切片通过不等于首票完整验收。

### 9.1 核心真源 / 离线公开数据（寇豆码）

- [preview.js](<../../plugins/omnimux/src/catalog/voices/preview.js>)加载校验附属 mapping、生成唯一候选与 preview 投影；[official-preview-mapping.json](<../../plugins/omnimux/src/catalog/voices/official-preview-mapping.json>)保存初始 124 条相对文件名及原审计时间/hash。resource_id 留在既有 [voice index](<../../plugins/omnimux/src/catalog/voices/volcengine-voice-index.json>)，不另造 registry。
- 实际 exporter 是复数 [export-voice-previews.mjs](<../../plugins/omnimux/scripts/export-voice-previews.mjs>)，支持 stdout、`--out FILE`、`--check FILE`，已列在 [hub package](<../../plugins/omnimux/package.json#L11-L18>)。不为文档旧单数拼写重命名实现。
- [options.js](<../../plugins/omnimux/src/catalog/voices/options.js>) join 已注册身份并附 `meta.preview`；[contract loader](<../../plugins/omnimux/src/catalog/contract/load.js>)与[Catalog 出口](<../../plugins/omnimux/src/catalog/list.js>)发布同次 mapping 的 `preview_fingerprint`，一般 Catalog 指纹不混用。
- 包内快照实际位于 [cloud-catalog/voice-preview-snapshot.json](<../../plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json>)，由 [assets package](<../../plugins/omnimux-assets/package.json#L11-L18>)的 cloud-catalog 范围携带，不在 src/generated。[审计副本](<../evidence/shared-official-voice-preview/initial-candidate-audit.json>)供来源测试读取；[原调查](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/voice-preview-investigation-20261003/report.md>)与原审计只读保留。
- 未发现独立 importer 脚本。初 map 的来源/合格输入验证见 §6，是否另增 CLI 仅归 #3059 可选维护，不写“已完成 importer”。

### 9.2 目录 / Host（寇豆码）

- [builder](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs>) collectVoices 消费 hub 同源快照，保留身份/用途/媒体资格；全量构建可用包内默认快照，`--voices-only` 必须显式 `--voice-snapshot=<path>`。以既有目录为基线，缺失或未注册音色在写输出前拒绝，不复活下架样本。
- [cloud-catalog.js](<../../plugins/omnimux-assets/src/cloud-catalog.js>)搜索 voice_type，saveToLocal 按用途先拒绝；[http-routes.js](<../../plugins/omnimux-assets/src/http-routes.js>)仅对已验证行 302 到 primary，无验证/未知不猜地址。媒体字节仍在官方 CDN，不新增代理。
- [工具注册入口](<../../plugins/omnimux-assets/src/index.js>)覆盖 assets_cloud_save 的用途拒绝；普通成功/错误的 staging 清理不扩展为本票音色写入。生产 tool 拒绝证据与测试隔离限制分别见协调文档。
- 生成产物为 [manifest](<../../plugins/omnimux-assets/cloud-catalog/manifest.json>)、[index](<../../plugins/omnimux-assets/cloud-catalog/index.json>)及 voiceover/audio/all 分页，携带 `voice_preview_fingerprint`。历史证据记录 6388 行 ID、509 音色、124 verified/385 unverified 和非音色等价；本次不重建或改生成文件。

### 9.3 前端 / 产品白名单

- 裴像素：[voiceCatalog.ts](<../../plugins/omnimux-workflow/src/shared/voiceCatalog.ts>) 加preview DTO类型；[voicePickerModel](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.ts>) 和 [VoicePickerDialog](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx>) 删除重复拼接规则，改消费DTO；继续保留名录/排序/选择。无需importhub JS；若保留兼容函数export，必须明确是legacy测试兼容，不让它成为第三份策略。
- 裴像素：[cloud-feed-helpers](<../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js>)、[use-cloud-assets-feed](<../../plugins/omnimux-assets/src/client/use-cloud-assets-feed.js>)、[CloudAssetsView](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx>)、[cloud-preview](<../../plugins/omnimux-assets/src/client/cloud-preview.js>) 做identity/preview透传与候选播放；卡片不承载额外营销字段。
- 裴像素：[AssetsStage](<../../plugins/omnimux-assets/src/client/AssetsStage.jsx>)、[AssetPreviewModal](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx>)和[locales](<../../plugins/omnimux-assets/src/client/locales.js>)按已批准用途限制详情/保存/会话与失败文案。[design.md](<../../design.md>)只消费、不改；实际双主题、几何与文案终验仍独立签收，不扩布局。

### 9.4 测试与文档，不改门禁

- 在既有 [options tests](<../../plugins/omnimux/src/catalog/voices/options.test.js>) / [assets builder tests](<../../plugins/omnimux-assets/src/cloud-catalog-build.test.js>) / [HTTP tests](<../../plugins/omnimux-assets/src/http-routes.test.js>) / [load retry tests](<../../plugins/omnimux-assets/src/catalog-load-retry.test.js>) 和现有voice/Dialog测试中增加公开seam用例，新增preview业务测试用可发现扩展名。package-detached测试纳入已有plugin tests实际运行入口，不只写孤立未执行测试。
- [CONTEXT](<../../CONTEXT.md#L49-L60>)的新术语已落，本次不重复修改；[hub contract](<../../docs/contracts/hub.md>)的既有公共接缝不因本次同步扩张。[design](<../../design.md>)、产品四件套、门禁、CI、hook 与 merge/restart 流程均不改。
- 不新增中性包或 ADR。当前 hub 附属 mapping 的 MVP 归属可逆，不以本票文档维护引入发行/同步基础设施。

## Unknowns

1. **双端真实签收**：round4 资产公共 Tab 定位失败，卡片/详情/动作旅程未执行；画布停止按钮、完整持续窗、故障/断网和全主题/键盘尚缺证。不能将缺证记 PASS。
2. **整改后独立覆盖**：Sol 原两项 HIGH 已被新独立源码复核确认解决，但复核又报键盘试听 HIGH、详情回退 MEDIUM，未运行测试或 UI；新双端旅程未建立。OCR partial 的六个变化文件完整 fresh coverage 仍缺，不以 exit 0 或旧相同 hash 代替。
3. **官方身份与许可**：124 的文件证据不覆盖全部声线版本/长期可达性，也不授予下载/再分发权；385 的真实来源待 #3059 核对，不猜链接。
4. **完整安装与发布**：包内 exporter 的隔离闭包已有历史证明，但整个插件 clean install、preset、Dev 运行和线上/本地目录一致性未建立。既有 dsh-ui-kit file 依赖限制保持公开。

## Not covered

本次仅改主规格的路径附录归属、票外实施备注与执行协调，另写最小 doc-sync 报告；不改业务 source、gates、测试、runner、生成数据、产品四件套、design 或 CONTEXT，不新增 ADR。不执行测试、构建、Git、App/Host、物化、媒体请求、收费调用或上传。历史失败报告/原件不覆盖，历史设计轮静态结果不作本次新验证。

所有当前 workflow seams 与首版范围已获用户批准。本报告不签发 QA/PM PASS，不重新请求技术批准；唯一后续人工决策仍是完整验收演示后是否合入。

## Confidence

- **高（批准与实现定位）**：已有产品批准、现存 exporter/mapping/snapshot 与 Catalog/资产/画布报告相互支持，物理路径已归票外，未虚构 importer。
- **有限（验收）**：历史日志计数真实，但绑定当时范围，后续状态机与 runner 变化尚待新的独立证据；浏览器 round4 和 OCR partial 仍不能给整票 PASS。
- **未建立（全部官方身份/权利）**：schema、hash、file probe 与可播放状态均不能代替官方版本身份和转载授权。
