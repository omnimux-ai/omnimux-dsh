---
id: "canvas-model-visibility"
title: "画布模型可见性：默认全开 + 用户设置开关"
status: active
---

# Spec: 画布模型白名单 → 设置驱动可见性

- 风险级别: R1（settings schema + workflow 共享投影 + 设置 UI 区块；无网关、无计费、无生产写）
- 背景: 画布当前用 `CANVAS_GENERATION_POLICY`（`plugins/omnimux-workflow/src/shared/generationPolicy.ts` L11-38）硬编码白名单——text=[gemini-3.8-flash]、image=[gpt-image-2.5]、video=[seedance-2-5,seedance-2-0]、audio=[suno]。L20 注释明示「P0 会把可选集合改为从目录推导」。用户要求改为：默认显示网关目录里所有已上架模型，可见性由用户在官方插件设置页按模型逐个开关。先例：`composerHiddenModels`（`schema.js` L48，`apply.js` `syncComposerList` 消费，`ModelsSettingsCard.jsx` L318-333 复选瓦片）。

## 目标与用户结果

- 画布生成节点选择器（image/video/audio/text）默认列出网关目录中全部已上架模型，不再被硬编码白名单裁掉。
- 用户在 插件→内置插件配置→模型 设置卡里能按模型逐个关掉不想看到的；关掉后该模型从画布选择器消失。
- 已保存画布引用了一个后来被隐藏的模型时，走与「网官下架」相同的 `not_listed` 降级路径，不删节点、不崩画布。

## 范围与设计

### 2.1 settings schema（`plugins/omnimux/src/settings/schema.js`）

- `SETTINGS_DEFAULTS` 新增 `canvasHiddenModels`（沿用 `composerHiddenModels` 命名风格），形状为 `{ text: [], image: [], video: [], audio: [] }`——每类一个字符串数组，存被用户隐藏的 model id。
- `SettingsConfig` 增加对应 schemastery dict 节点；`FIELD_META` 补中文标签（「画布生成中隐藏的模型」）。
- `parseSettingsSection` 返回类型补 `canvasHiddenModels` 字段。

### 2.2 投影改造（`plugins/omnimux-workflow/src/shared/generationPolicy.ts`）

- `projectCanvasCatalog` 的 `lists[kind]` 改为：`catalog[kind]` 行 减去 `hidden[kind]`（从 `CANVAS_GENERATION_POLICY` 常量之外的新数据源读）。
- 隐藏集的数据源：catalog 行已带 `generationPolicy` 之外的上下文不足——**最干净的做法是让 hub 在 `buildModelCatalog` 时把 settings 的 `canvasHiddenModels` 一并注入 catalog DTO**（`listCatalog` 已现读 `settings.get('omnimux')`），投影直接 `catalog.canvasHiddenModels[kind]`；fallback 是投影侧通过 seam 再读一次 settings。
- `defaults[kind]` / `defaultsByOperation` / `defaultOperations`：若解析出的默认 id 落在隐藏集内，回落到过滤后列表首个（与现有 `not_listed` 默认回落一致）。
- `generationPolicy[kind].allowedModelIds` 字段语义改为「过滤后可用的 id 集」（目录 − 隐藏），`defaultModelId` 保证不在隐藏集。`compatKernel` L971-983 的默认解析顺序与排序源自动跟随，无需改消费方。
- `fingerprint` 已含 `':canvas:'+JSON(policy)`，隐藏集变化自动翻转指纹触发 `catalogRuntime` 刷新。

### 2.3 设置 UI（`plugins/omnimux/src/client/ModelsSettingsCard.jsx`）

- 在现有 text 模型复选瓦片组（「输入框模型列表中隐藏的模型」）下方，按 image/video/audio 各加一组同构 `SelectableTile`。
- 数据源：同一 `GET /omnimux/model-catalog` 已取回的 `catalog[kind]` 行；`checked = !hidden[kind].includes(id)`；`onToggle` 调 `scope.set('canvasHiddenModels', next)`。
- `execution:stub` 的模型（如 `minimax-h3-video`）正常显示并可被勾选——stub 不是隐藏理由。

### 2.4 不改的

- `CANVAS_GENERATION_POLICY` 常量保留但语义改为「目录推导的兜底可见集」或标注 deprecated——具体取舍在实现时按最小 diff 定，但所有读取方必须改走 settings 路径。
- `omitted-model-defaults` 不动——它是默认模型回落顺序，不是隐藏机制。
- 路由/存储/`generationPreferences` 不动——「记住上次选的模型」与「可见性」是两件事。

## 假设

- `catalog[kind]` 行序本身有展示意义（hub 目录行序即展示序），过滤后排序沿用即可，不需要额外 preferredModels 序。若错：compatKernel L983 用 `allowedModelIds` 排序会把隐藏后的剩余集按目录序排，仍可接受。
- `settings.get('omnimux')` 在 `buildModelCatalog` 调用点（`apply.js:167`）每次都现读，新字段随 `omnimux:model-catalog-updated` 事件流到画布。若错：需另加一条 settings→catalog 的显式通道。
- `execution:stub` 不 unlist（`admission.js:183` 只记 info）→ stub 模型会进选择器并在提交时失败；产品决策是「显示出来让用户知道已注册但暂不可用」，不做默认隐藏。
- 保存过的画布引用被隐藏模型 → `not_listed` 降级已存在，行为与「hub 下架」一致。

## 证伪方式

- 若隐藏字段不生效：settings 里给 `canvasHiddenModels.video` 加 `seedance-2-0` 后，`GET /omnimux-workflow/api/capabilities` 返回的 `generationPolicy.video.allowedModelIds` 仍含它 → 通道断。
- 若默认值选到隐藏模型：`canvasHiddenModels.image` 含 `gpt-image-2.5` 时，`generationPolicy.image.defaultModelId` 不得仍是它 → 默认回落逻辑失效。
- 若 UI 不回写：设置卡勾掉一个 video 模型后 `settings.get('omnimux').canvasHiddenModels.video` 不含该 id → scope.set 没接上。
- 若 stub 模型被误藏：未配置任何隐藏时，`catalog.video` 含 `minimax-h3-video` 且 `generationPolicy.video.allowedModelIds` 含它 → 默认全开门被破。

## 验收

1. 未配置隐藏时，`capabilities` 的 `generationPolicy` 各类 `allowedModelIds` == `catalog[kind]` 全部已上架 id（默认全开）。
2. 配置 `canvasHiddenModels.video=['seedance-2-0']` 后，`generationPolicy.video.allowedModelIds` 不含它，其余不变；`fingerprint` 变化。
3. `ModelsSettingsCard` 三类生成模型各有一组复选瓦片；勾选/取消写回 `omnimux` settings 的 `canvasHiddenModels`。
4. `pnpm --filter omnimux-workflow test` + `pnpm --filter omnimux test` 相关用例绿；新增投影单测覆盖隐藏/默认回落/stub 显示。

## 非目标

- 不改 `generationPreferences`（lastModelByType）——那是默认值记忆。
- 不引入「暂未接入」徽标渲染——stub 徽标是 P2，本轮只保证 stub 可被选并如实失败。
- 不动 composer 的 `composerHiddenModels`（它只管输入框 text 列表，与画布正交）。
- 不改网关/catalog 契约——`buildModelCatalog` 仍返回全部已上架行，可见性是画布侧投影。

## 旧标准变更

本任务把画布模型准入从「`CANVAS_GENERATION_POLICY` 硬编码白名单」改为「目录全集 − 用户隐藏集」。旧断言普遍假设默认可见集只有白名单那一两个模型；现在默认全开，这些用例的原断言必然失效。以下逐条声明被改写的具名用例，理由与旧断言一并给出。

- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `curation intersects listed operations and enabled buckets; policy defaults cannot admit absent models`
  - 原断言：`view.text` 只有 `[GEMINI]`，`'unapproved'` 既不进 `view.text` 也不进 `view.models`；`view.defaults.text===GEMINI`。
  - 必须改：fixture 目录里 5 个 text 模型全部已上架且未被隐藏 → 默认全开下 `view.text` 是全集，`catalog.defaults.text='unapproved'` 成为默认。改后断言 `view.text` 含全部已上架 id、`'unapproved'` 进 `view.models`、默认落到 `unapproved`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `audio policy admits only the listed suno model as the canvas default (#3516)`
  - 原断言：`view.audio` 只有 `['suno']`，其余 3 个已上架音频模型被白名单裁掉。
  - 必须改：默认全开下 `view.audio` 含全部 4 个已上架音频模型；`catalog.defaults.audio='seed-audio-1.0'` 已上架 → 默认是它而非 suno。用例名重命名为反映「默认全开」语义（例如 `audio policy admits every listed model...`），对应 `test-case-removed-or-renamed`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `saved models that fell out of the visible set degrade via not_listed while keeping configuration and outputs`
  - 原断言（`saved excluded models preserve configuration and outputs during catalog hydration`）：`'unapproved'` 被白名单裁掉 → `not_listed`；空新节点默认到 `GEMINI`。
  - 必须改：`'unapproved'` 现默认可见（有 listed op 且在 `catalog.text`）→ 让它脱离可见集改用 `canvasHiddenModels.text=['unapproved']`；新节点回落 = 手动偏好 `preferredModels.text=GPT`（可见 → 采用它），不是目录默认 `unapproved`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `new nodes use compatible manual preference, then type default, then curated order`
  - 原断言：`select().modelId===GEMINI`、`select({preferredModelId:'unapproved'})` 落到 GEMINI、`withoutGemini` 时 `select` 为 `null`。
  - 必须改：`'unapproved'` 现在是合法可见模型且是 `catalog.defaults.text` → `select()` 落到 `unapproved`；`preferredModelId:'unapproved'` 被接受；`withoutGemini` 仍有候选 → 非 `null`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `saved excluded models preserve configuration and outputs during catalog hydration`
  - 原断言：已存的 `'unapproved'` 节点 `compat.status==='configuration_error'` 且 `reasonCodes` 含 `not_listed`；新建空节点默认到 GEMINI。
  - 必须改：`'unapproved'` 已上架可见 → `not_listed` 不再出现，`compat.status` 不再因未列而 error；新空节点默认到 `unapproved`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `real Hub catalog exposes the curated text models and selects Gemini 3.8 for video`
  - 原断言：`catalog.text` 是 `[gemini-3.8-flash]` 且 `catalog.defaults.text` 是 gemini；真实 hub 只有这一个 text 在售模型。
  - 必须改：真实 hub text 桶本来就是 `[gemini-3.8-flash]`，默认全开下仍唯一；断言值不变，但语义从「白名单裁出唯一」变为「目录唯一在售」，注释更新。（若实际目录行不变则此条仅注释翻新，仍按更名/注释归此节。）
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `real Hub catalog: the listed whisper-1 ASR contract is selectable in the audio-transcription tool (#1789)`
  - 原断言：`catalog.text` 只含 `[gemini-3.8-flash]`，whisper-1 不进 chat 桶。
  - 必须改：whisper-1 本就不进 `hub.text`（`speech_to_text` 虽输出 text 但绑 capability seam，不被收入生成桶），默认全开下 chat 桶仍只有 gemini；断言值不变，注释由「白名单防漏」改为「capability seam 本就排除」。
- `plugins/omnimux-workflow/src/shared/voiceCloneCanvasPolicy.test.mjs` :: `canvas audio policy admits only listed suno and drops the delisted clone/speech models (#3516)`
  - 原断言：`view.audio` 只有 `['suno']`，`seed-audio-1.0`/`indextts-2`/`gpt-4o-mini-tts` 被白名单裁掉且不进 `view.models`；`view.defaults.audio==='suno'`。
  - 必须改：fixture 三个模型都持有 listed 的 audio-output op → 默认全开下全部进 `view.audio`/`view.models`；`catalog.defaults.audio='seed-audio-1.0'` 已上架 → 默认是它而非 suno。用例名重命名（如 `canvas audio policy admits every listed model, catalog default wins`）。
- `plugins/omnimux-workflow/src/shared/voiceCloneCanvasPolicy.test.mjs` :: `the delisted clone model reaches no node and the voice-clone tool fails closed (#3516)`
  - 原断言：`indextts-2`/`seed-audio-1.0` 不进任何节点；voice-clone 工具候选为空并 `isZeroCandidateEmptyState`；text-to-audio 只给 `['suno']`。
  - 必须改：clone/speech 现在都可见 → voice-clone 工具按上游 audio 资产匹配到 `indextts-2` 的 `voice_clone` op；text-to-audio 候选含全部 3 个已上架模型。用例名重命名（如 `capability-filtered tools expose only their seam's listed models`）。

- `plugins/omnimux-workflow/src/workflow/seam/generationSubmission.test.mjs` :: `omnimux: direct submission rejects excluded model and unlisted operation`
- `plugins/omnimux-workflow/src/workflow/seam/generationSubmission.test.mjs` :: `mock: direct submission rejects excluded model and unlisted operation`
  - 原断言：`catalog.text` 里 `'excluded'` 行被画布白名单裁掉 → 提交它返回 `model-not-allowed`。
  - 必须改：`'excluded'` 现默认可见（在 `catalog.text` 且有 listed op）→ 改用 `canvasHiddenModels.text=['excluded']` 让它退出可见集；`model-not-allowed` 语义与 `operation-not-allowed` 断言不变。

- `plugins/omnimux-workflow/src/workflow/seam-gateway.test.mjs` :: `capabilities：hub 目录按画布白名单投影，不继承画布外默认项`
  - 原断言：fixture 目录 8 个模型里只有白名单 4 个可见（gemini/gpt-image/seedance-2-5/suno）；`kling-o3`/`nanobanana-2`/`seed-audio-1.0`/`gpt-4o-mini-tts` 全部被裁，video 默认落 `seedance-2-5`（因 `kling-o3` 不在白名单，`defaults.video='kling-o3'` 被丢弃）。
  - 必须改：默认全开下所有持 listed op 的 bucket 行均可见（`kling-o3`/`nanobanana-2`/`seed-audio-1.0` 全部出现；`gpt-4o-mini-tts` 因无 listed op 仍被裁），`defaults.video` 落目录默认 `kling-o3`；隐藏集经 DTO `canvasHiddenModels` 端到端生效——隐藏 `kling-o3` 后 `defaults.video` 回落策略种子 `seedance-2-5`。用例名重命名（如 `capabilities：hub 目录按画布可见集投影，隐藏集逐类相减`）。

- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `missing policy models fall back only to real remaining rows for all four outputs (#3312)`
  - 原注释断言「text/audio have a single admitted model」；真实 hub 里 audio 桶现含 `[indextts-2, suno]` 两个已上架模型，注释失效。
  - 必须改：断言值不变（ALTERNATIVE_CASES 仍只含 video），仅修正注释——「另一行真实剩余候选」仅 video 体现（selected=seedance-2-0、fallback=seedance-2-5）。

注：hub.test.mjs 中其余 `#3312` 系列（defaults 存活、适配、新建节点等）的断言基于「`catalog[kind]` 即全集」推导，默认全开下断言值不变、仍绿，不属于削弱；`generationPolicy.test.mjs` 里 `compatible current model survives preferences`、`graph atomically assigns new-node preference`、`supply changes preserve the current model`、`upstream text readiness`、`video editing intent`、`only upstream text contributes prompt`、`capability seam admits only LISTED speech models` 等用例断言值不变、仍绿。只有直接断言「被白名单裁掉 / 集合只有 N 个 / 默认到白名单模型」的用例才在上面逐条声明。

## 新用户基线

默认全开后，新用户画布选择器会列出所有已上架模型（数量比白名单时代多）。这不是回归而是设计意图；用户可在设置卡关掉不用的。空目录仍走 `catalog_unavailable` 降级，不崩。

## 文档影响

`docs/contracts/` 下若有「画布模型白名单」表述需同步为「设置驱动可见性」；`generationPolicy.ts` L20 注释的实现承诺本任务兑现，注释更新。settings-ui 合同若描述 `composerHiddenModels` 独占隐藏机制需补 `canvasHiddenModels`。
