# P1b：成员、线路、价格切换为网关快照

- Issue：#3734（父任务 #3719）
- 前置：P1a（#3719 / PR #3723）已合入——网关快照已在运行时真实拉取、缓存、刷新，并有只读诊断。
- 用户已拍板：**完全跟随网关，本地不做白名单兜底。**

## 这一步要什么

中枢目录里「哪些模型能选、每个模型有哪些线路、每个线路大概多少积分」这三件事，从此由网关快照决定。本地只保留「每个模型怎么调」的调用契约（协议、操作、参数映射）和展示名覆盖。

## 用户旅程与期望反馈

- 网关新上一个模型：用户重启应用后就能在目录里看到（前提是本地已有调用契约；没有契约时该模型不出现，并在诊断里列为「缺调用契约」）。
- 网关下架一个模型：用户重启后它就消失；此前保存的默认模型/会话引用会被默认值逻辑替换，不报错、不空列表。
- 网关改一个模型的分组或价格：用户重启后看到的线路与积分随之变化，仓库不需要任何提交。
- 断网/无磁盘缓存：用随包快照，目录照常可用（与 P1a 同一套解析）。

## 方案

1. **快照入口**：目录构建接受一份已解析的网关快照；调用方（`apply()`）传入运行时那份（P1a 的 live catalog，含刷新），离线工具与测试传入随包快照。缺省回落到「随包快照 → 磁盘缓存」的只读解析，不联网。
2. **成员资格**：以快照里「有可用线路的模型」为候选集合，再与本地调用契约求交——没有契约的模型不进列表，只在诊断里计数。删除本地成员状态表对「上架/下架」的决定权（`unavailable` / `draft` 行不再参与判断）。
3. **线路**：模型的线路取自快照的 `enable_groups`；本地分组表退化为「展示名与排序覆盖」，不再决定某模型能否走某条线路。自动线路取自快照的 `auto_groups`，不再读本地 `requiredInAuto` 清单。
4. **价格**：分组倍率与模型计费取自快照（`group_ratio` + 每模型的计费信息），删除两张手抄基准价格表；网关按表达式计费的模型照实标注「无法比对」而不是猜一个数。
5. **提交前校验**：用户提交时若所选模型已不在快照里，直接拒绝并说明「该模型已下架」，不再回落到别的模型静默成功。
6. **诊断**：把 P1a 的只读诊断接进设置页（本轮若放不下，拆到下一步，不阻塞本步）。

## 验收

- 用随包快照做离线夹具：网关在售的模型全部可见、网关无线路的模型不可见，逐项与快照一致。
- 线路与价格逐项等于快照口径；差异诊断在同一份输入下归零（除「缺调用契约」一项）。
- 无快照/快照损坏时仍用随包快照，不出现空目录；提交已下架模型被拒绝且原因明确。
- 跨插件一致性检查改为对着新真源校验，不再比对两份本地硬编码清单。

## 假设

- 网关快照的 `enable_groups` 是「这个模型有哪些线路」的唯一真源，且只在用户可用（已认证）范围内；匿名视图看到的线路可能少于账号视图，因此运行时以账号视图为准，匿名视图只用于随包兜底。
- 本地调用契约（协议、操作、参数映射）在网关变更时**不需要**跟着改：网关新增模型时若缺契约，该模型只是不出现，不会报错。
- 模型标识以 `model_name` 为准；网关的 `id` 是库号，不参与任何匹配。
- 「完全跟随」不会让用户在无网关访问时失去全部模型：随包快照保证首启与断网可用。

## 证伪方式

- 若目录里出现快照中不存在的模型，或快照中在售的模型缺失且不是「缺调用契约」，说明成员资格没有真正切到快照。
- 若某模型的线路或积分与快照口径不一致（同一份快照、同一份契约下），说明仍有本地表在参与决策。
- 若删除本地表后出现空目录、启动失败或提交静默成功，说明兜底与拒绝逻辑没接上。
- 若「缺调用契约」的模型数量在切换前后没有变化，说明这次切换没有实际发生（网关独有模型本应全部落进这一类）。

## 旧标准变更

本步把成员资格 / 线路 / 价格的真源从本地表切到网关快照，并删除 16 条成员状态行与全部 `requiredInAuto`
判断。下列既有用例的断言锁定的正是切换前的旧标准，逐条声明（原断言 → 必须改的理由 → 新期望证据）。

### A. 删除 13 条 `unavailable` + 3 条 `draft` 行（处置表 83 → 67）

- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `dispositions.json: every row unique, all kinds valid, reasons present`
  - 原断言：`rows.length === 83`。
  - 理由：13 条墓碑行与 3 条 draft 行按设计删除，处置表只剩 canonical/alias。
  - 新期望：`rows.length === 67`，shape 校验仍为 0 issue；`DISPOSITION_KINDS` 不变。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `locked dispositions: draft-probeable / tombstones / un-quarantined / alias / Batch A canonical`
  - 原断言：`kling-avatar` / `gpt-image-2` / `google-vids-omni` / `omni_flash` / `kling-o1` 的 `disposition === 'unavailable'`。
  - 理由：这些行已删除，`resolveDisposition` 对它们返回 `undefined`；它们本来就不在 runtime 宇宙内。
  - 新期望：这 5 个 id 无处置行；`whisper-1` / `minimax-h3` / `kling-o3` / alias 与 Batch A 断言不变。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `forbidden-listed set has no listed op in the real index`
  - 原断言：`forbidden.has('kling-avatar') === true`（墓碑行仍在禁止集合内）。
  - 理由：仓内已无 `unavailable`/`quarantine`/`deprecated` 行，禁止集合为空。
  - 新期望：`forbiddenListedIds(doc).size === 0`；`whisper-1` 的上架断言不变。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `negative: listed op on forbidden disposition triggers disposition_listed_forbidden`
  - 原断言：用真实 `omni_flash` 墓碑行 + 合成 listed op 触发 D4。
  - 理由：该墓碑行已删除，D4 无法再用仓内数据触发。
  - 新期望：改用一份合成 `unavailable` 行（口径不变）验证 D4 仍拦截 listed op。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `tombstone whitelist: exactly the 13 removed models are unavailable, no typos or ghosts`
  - 原断言：墓碑集合恰好等于 13 个 id 且都被 D4 禁止。
  - 理由：13 条墓碑行已删除，该白名单锁定已无对象。
  - 新期望：16 个撤架 id 都无处置行；仍留在 runtime 宇宙内的 3 个 draft 型号（`mj-v7` / `mj-v8-1` / `grok-imagine-image-quality`）`listedOperations` 为空。
- `plugins/omnimux/src/catalog/contract/cli.test.js` :: `runVerify audit ok; strict ok with 83 dispositions resolved`
  - 原断言：用例名与 `strict.dispositions.total === 83`。
  - 理由：处置表行数变为 67。
  - 新期望：`strict.dispositions.total === 67`，audit/strict 仍 `ok === true`。
- `plugins/omnimux/src/catalog/contract/cli.test.js` :: `runVerify JSON report exposes schemaVersion only (no root version)`
  - 原断言：JSON 报告 `dispositions.total === 83`。
  - 理由：同上。
  - 新期望：`dispositions.total === 67`，其余 JSON 形状断言不变。
- `plugins/omnimux/src/catalog/contract/coverage.test.js` :: `verifyContracts: audit ok; strict ok once 83 dispositions resolve`
  - 原断言：用例名与 `strict.dispositions.total === 83`。
  - 理由：同上。
  - 新期望：`strict.dispositions.total === 67`，`unresolvedDispositions` 仍为空。
- `plugins/omnimux/src/catalog/model-capabilities.test.js` :: `H2: 处置表 83 行 + implementation-ready 集合与处置一致`
  - 原断言：`doc.dispositions.length === 83` 与 `report.dispositions.total === 83`。
  - 理由：同上。
  - 新期望：两处均为 67；`report.ok === true` 与 listed 集合断言不变。

### B. 成员资格 / 线路 / 价格切到网关快照

- `plugins/omnimux/src/catalog/list.test.js` :: `returns Catalog v1.1: models[] authority + listed-only four lists + defaults`
  - 原断言：image 含 `seedream-5-0-pro`、video 含 `seedance-2-0-fast`/`seedance-2-0-mini`、`grok-imagine-image-quality` 处置为 `draft`、channelGroups 为本地表口径。
  - 理由：四个列表改为与随包快照求交；网关不售 `seedream-5-0-pro` / `seedance-2-0-fast` / `seedance-2-0-mini`，`grok-imagine-image-quality` 的 draft 行已删除。
  - 新期望：image=`['gpt-image-2.5']`、video=`['seedance-2-0','seedance-2-5']`、text=`['gemini-3.8-flash']`、audio=`['suno']`；默认值四项不变；`catalog.gateway.missingContract` 非空。
- `plugins/omnimux/src/catalog/generation-fingerprint.test.js` :: `buildModelCatalog invalidates when channelGroups enabled alone changes`
  - 原断言：改本地 `MODEL_CHANNEL_GROUPS` 的 `enabled` 后指纹必须变化。
  - 理由：本地表不再决定某模型能否走某线路，改它不应影响目录指纹（网关快照才是真源）。
  - 新期望：改本地 `enabled` 不影响指纹；改**传入的网关快照**（`enable_groups`）才使指纹变化。
- `plugins/omnimux/src/catalog/generation-fingerprint.test.js` :: `buildModelCatalog invalidates when channelGroups pricing alone changes`
  - 原断言：改本地表的 `pointsEstimate` 后指纹必须变化。
  - 理由：本地表价格已被忽略，改它不应影响指纹。
  - 新期望：改本地表价格不影响指纹；改快照的 `groups.ratio` / 模型 `modelPrice` 才使指纹变化。
- `plugins/omnimux/src/catalog/generation-fingerprint.test.js` :: `buildModelCatalog preserves semantic channel candidate order`
  - 原断言：本地表分组顺序决定候选顺序。
  - 理由：线路与自动顺序改由快照 `enable_groups` / `groups.auto` 决定。
  - 新期望：候选顺序等于快照线路顺序（自动线路按 `groups.auto` 优先）。
- `plugins/omnimux/src/catalog/serving/channel-groups.test.js` :: `returns defined channel groups for seedance-2-0`
  - 原断言：`getModelChannelGroups('seedance-2-0')` 直接返回本地表（`discountRate: 1`、`pointsEstimate: 4.9`）。
  - 理由：线路与价格改由快照推导，本地表只留展示覆盖。
  - 新期望：返回快照线路（`wireGroup: 'default'`、`pointsEstimate: 4.86`、`unitPriceUsd: 0.0971`、`groupRatio: 1`）。
- `plugins/omnimux/src/catalog/serving/channel-groups.test.js` :: `returns the 480p economy and 720p standard(default) lines for seedance-2-5`
  - 原断言：只返回本地登记的两条线路（480p / 720p）。
  - 理由：快照为 `seedance-2-5` 发布 4 条线路（含 `seedance-2-5-480p` / `seedance-2-5-720p`）。
  - 新期望：4 条线路，价格分别 6.8 / 9.6 / 20.96 / 28.82，默认线路仍为 720p。
- `plugins/omnimux/src/catalog/serving/channel-groups.test.js` :: `sorts by cost_first (lowest points estimate first)`
  - 原断言：以本地表价格排序。
  - 理由：价格改为快照口径，排序输入随之变化。
  - 新期望：仍按积分升序，但积分取自快照推导。
- `plugins/omnimux/src/catalog/serving/channel-groups.test.js` :: `sorts by stability_first (highest 24h stability first; unpublished SLA ranks last)`
  - 原断言：以本地表线路集合与 SLA 排序。
  - 理由：线路集合改为快照线路，未登记 SLA 的线路同样排最后。
  - 新期望：SLA 降序、未公布 SLA 最后，线路集合来自快照。
- `plugins/omnimux/src/catalog/pricing-calculator.test.js` :: `accurately calculates per-second video generation costs`
  - 原断言：`calculatePoints({modelId:'seedance-2-5',duration:5}).points === 40` 等手抄基准价推导。
  - 理由：`MODEL_BASE_PRICING` / `TEXT_MODEL_BASE_PRICING` 两张手抄表已删除，`calculatePoints` 不再存在。
  - 新期望：改为对 `estimatePointsFromGateway` 用快照单价/倍率逐项验算。
- `plugins/omnimux/src/catalog/pricing-calculator.test.js` :: `accurately calculates per-task package costs`
  - 原断言：`seedance-2-5-task` / `gpt-image-2.5` / `seedream-5-0-pro` / `suno` / `whisper-1` 的手抄按次价。
  - 理由：同上；且 `seedance-2-5-task` 等 id 已不在快照在售集合内。
  - 新期望：按次价只由快照 `modelPrice × group_ratio` 推出；快照按表达式计费的型号返回 `null` 并带「无法比对」说明。
- `plugins/omnimux/src/catalog/pricing-calculator.test.js` :: `takes channel group discount or multiplier ratios into account`
  - 原断言：`minimax-h3-video` 0.025 USD/秒 × 0.9 → 1.13 积分。
  - 理由：手抄单价删除，`minimax-h3-video` 亦不在快照在售集合内。
  - 新期望：倍率只作用于快照单价（用快照内的在售型号验算）。
- `plugins/omnimux/src/catalog/pricing-calculator.test.js` :: `generates natural language billing descriptions for Agent perception`
  - 原断言：描述文案为「5 秒约 40 积分 / 30 秒约 240 积分」「按条/按次计费…固定每次 ≈5.6 积分」。
  - 理由：描述改由快照生成，且表达式计费型号不得给出数字。
  - 新期望：文案含网关单价与「≈N 积分/5秒（或/次）」；表达式计费型号只输出「无法比对」说明。

### C. 对账计数断言（P1a 快照差异收敛）

- `plugins/omnimux/src/catalog/cloud/diagnostics.test.js` :: `the real diagnostics body reports the diff summary and leaks nothing local`
  - 原断言：`body.drift.groupUnregistered > 0`（中枢未登记网关分组）。
  - 理由：线路改由快照推导后 `groupExtra` 归零，这正是本步的目标；`unreachable` / `priceChanged` 同理归零。
  - 新期望：三个计数均为 0，且与 `diffGatewayAgainstHub` 的 summary 逐项相等；无本地路径/上游文本泄漏的断言不变。
- `plugins/omnimux/src/catalog/cloud/p1a-review-fixes.test.js` :: `drift counters come from the diff summary, including unregistered groups`
  - 原断言：用真实 bundled 快照 + `buildModelCatalog({})` 断言 `groupExtra > 0`。
  - 理由：该断言依赖「仓库当前恰好存在漂移」；P1b 后真实对已无漂移。
  - 新期望：改用显式构造的 gateway/hub 对（网关有 hub 未登记的线路）继续锁定 `driftSummaryCounts` 的类别名映射。

### D. 删除 `requiredInAuto` 判断

- `scripts/verify-auto-serving.test.mjs` :: `manifest registers all whitelist IDs without claiming online supply`
  - 原断言：`report.requiredCount === 8`。
  - 理由：`requiredInAuto` 字段与判断已删除，报告不再有该计数。
  - 新期望：`report.requiredCount === undefined`，`registeredCount === 24` 不变。
- `scripts/verify-auto-serving.test.mjs` :: `required supply cannot include an unlisted model or exclude a listed whitelist model`
  - 原断言：`requiredInAuto: true` 触发 `not_listed`、`false` 触发 `required`。
  - 理由：这两条判断按设计删除。
  - 新期望：改名后的用例断言残留 `requiredInAuto` 字段既不加分也不扣分，登记本身仍受 canonical/gatewayIds 约束。
- `scripts/verify-auto-serving.test.mjs` :: `malformed or unreadable manifests fail closed`
  - 原断言：`delete m.models[0].requiredInAuto` 触发 `manifest_invalid`。
  - 理由：该字段不再是必填项。
  - 新期望：改用 `priority = 'P2'` 作为 `manifest_invalid` 负例。
- `scripts/verify-cross-plugin-model-alignment.test.mjs` :: `fails when a canvas whitelist model is unlisted without manifest exemption`
  - 原断言：把 `seed-audio-1.0` 的 `requiredInAuto` 改为 `true` 以撤销豁免，从而触发 `whitelist_unlisted`。
  - 理由：豁免口径改为「已登记即豁免」，`requiredInAuto` 不再是豁免开关。
  - 新期望：把该行从 manifest 中整体移除（完全未登记）后仍触发 `whitelist_unlisted`。
- `scripts/verify-pricing-points-integrity.test.mjs` :: `verifies pointsEstimate matches pricing-calculator derivation for registered models`
  - 原断言：本地 `MODEL_CHANNEL_GROUPS` 的每个 `pointsEstimate` 都必须能由 `resolveGroupEstimatedPoints` 重算（误差 ≤ 0.1）。
  - 理由：本地价格表已删除，`resolveGroupEstimatedPoints` 不再存在；价格真源是快照。
  - 新期望：目录投影的每条线路积分必须等于 `estimatePointsFromGateway`（快照单价 × 快照倍率）；表达式计费线路不得出现数字，只带「无法比对」说明；数值仍在 0–100 安全区间。

### E. 提交守卫默认拒绝不在快照中的模型（连带影响的既有用例）

- `plugins/omnimux/src/catalog/contract/submit-guard/submit-guard.test.js` :: `strict listedOperations is exactly 24 and every key has a ready profile payload contract`
  - 原断言：24 个 listed operation 的每个最小合法请求都必须被 `guardSubmit` 放行。
  - 理由：其中 4 个（seedance-2-0-fast / seedance-2-0-mini / seedream-5-0-pro / whisper-1）的型号网关不售，默认现在必须被拒。该用例本意是「每个 listed operation 都有可用的 profile 载荷契约」，不是成员资格声明。
  - 新期望：profile 契约检查改用 `requireListed: false` 只做契约准入；同一请求再用默认口径调用必须返回 `not_listed` 且带「该模型已下架」。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: saved defaults pointing at delisted models resolve only to the fixed real published catalog`
  - 原断言：图片可选集合为 `['gpt-image-2.5','seedream-5-0-pro']`。
  - 理由：`seedream-5-0-pro` 有契约但网关不售，成员资格求交后不在列表内。
  - 新期望：图片可选集合为 `['gpt-image-2.5']`；其余「已下架默认值不得复活」的断言不变。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: omitted image model keeps legal environment and current Config priority over saved or invalid defaults`
  - 原断言：省略图片型号时默认落到 `seedream-5-0-pro`。
  - 理由：同上，该型号已不可售。
  - 新期望：默认落到 `gpt-image-2.5`。
- `plugins/omnimux/src/media/generation-mapping.test.js` :: `#3272 actual image and Mini standard identities agree with the unchanged single-group resolver`
  - 原断言：`seedance-2-0-mini` 仍能解析出 `standard` 线路。
  - 理由：该型号不在网关在售集合内，没有可用线路。
  - 新期望：解析失败并给出「所选渠道分组不可用」；同一用例中断言「标准版身份」的其余部分改用仍在售型号。
- `plugins/omnimux/src/media/generation-mapping.test.js` :: `#3272 literal registered wire overrides are preserved and cross-group tails never qualify`
  - 原断言：图片默认身份为 `grok-imagine-image-2.0`。
  - 理由：该型号网关不售，默认图片型号改为在售的 `gpt-image-2.5`。
  - 新期望：默认身份为 `gpt-image-2.5`；wire 覆盖与跨分组尾部不合格的断言不变。
- `plugins/omnimux/src/media/route.test.js` :: `resolves channel candidates by cost_first and stability_first strategy`
  - 原断言：`seedance-2-5` 候选为 `['...@desktop-480p','...@desktop-720p']`。
  - 理由：快照为该型号发布 4 条线路，候选随之为 4 条。
  - 新期望：候选为 4 条（480p / 720p / seedance-2-5-480p / seedance-2-5-720p），两种策略的顺序按各自口径断言。
- `plugins/omnimux/src/media/candidate-intent-constraints.test.js` :: `3312: the delisted H3 series exposes no channel groups while the listed multi-line model resolves legal heads`
  - 原断言：`seedance-2-5` 的线路 id 集合为 `['480p','720p']`。
  - 理由：同上，快照多发布两条专线。
  - 新期望：集合为 4 条；H3 系列无线路的断言不变。
- `plugins/omnimux/src/session/context-injector.test.js` :: `tells the agent which model the user pinned`
  - 原断言：注入文案匹配 `/5 秒约 40 积分/`（旧文案格式）。
  - 理由：计费描述改由快照生成，文案格式变为「网关单价 … ≈ 40 积分/5秒」。
  - 新期望：匹配 `/40 积分\/5秒/` 与 `/按秒计费/`，型号与操作指引部分不变。

### F. 画布消费方原子闭环（`omnimux-workflow`，跨插件闭合要求）

网关不再出售 `seedream-5-0-pro`、`seedance-2-0-fast`、`seedance-2-0-mini`，画布侧的可选集合必须同步收敛，否则 CI 的 `omnimux-workflow` 套件红。改动：`generationPolicy.ts` 图像白名单收敛为 `gpt-image-2.5`、视频收敛为 `seedance-2-5` / `seedance-2-0`；测试夹具的「配置默认 vs 策略默认」对照项随之调整（text/image/audio 各只剩一个在售型号，只有 video 仍有两个可选型号，因此 `ALTERNATIVE_CASES` 只剩 video 一项）。

- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `configured defaults survive public catalog projection, adaptation and new nodes for all four outputs (#3312)`
  - 原断言：配置默认 `seedream-5-0-pro`（图像）/`seedance-2-0-fast`（视频）必须原样出现在投影、适配与新节点上。
  - 理由：这两个型号已不在网关在售集合内，目录不再列出它们；配置值不再被采纳。
  - 新期望：图像默认收敛为 `gpt-image-2.5`；视频默认改用 `seedance-2-0`（与策略默认 `seedance-2-5` 仍是不同型号，对照语义保留）。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `adaptation respects a legal catalog default even when the attached policy prefers another model (#3312)`
  - 原断言：显式注入的目录默认 `seedream-5-0-pro` / `seedance-2-0-fast` 必须被适配采纳。
  - 理由：同上，这两个型号不再是合法目录项。
  - 新期望：注入 `gpt-image-2.5` / `seedance-2-0`，断言与原先一致。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `missing policy models fall back only to real remaining rows for all four outputs (#3312)`
  - 原断言：删掉回退型号后，图像回退到 `seedream-5-0-pro`、视频回退到 `seedance-2-0-fast`。
  - 理由：回退目标必须是真实在售行；这两个型号已下架。
  - 新期望：只有 video 仍有「另一个真实行」可回退（`seedance-2-0`），图像与 text/audio 一样无替代项。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `operation recommendations cannot impersonate a model preference or override an explicit operation (#3312)`
  - 原断言：显式节点参数使用 `seedream-5-0-pro` / `seedance-2-0-fast`。
  - 理由：同上。
  - 新期望：改用 `gpt-image-2.5` / `seedance-2-0`，断言不变。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `same-model valid operation recommendations initialize new nodes while invalid recommendations are removed (#3312)`
  - 原断言：`defaultOperations` 里图像/视频推荐分别指向 `seedream-5-0-pro` / `seedance-2-0-fast`。
  - 理由：推荐必须指向在售型号，否则会被丢弃，用例语义随之失效。
  - 新期望：指向 `gpt-image-2.5` / `seedance-2-0`；「无效推荐被移除」的第二段改用 `seedance-2-0`。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `compatible recent manual preferences win only for new nodes and are never rewritten (#3312)`
  - 原断言：最近手动偏好 `seedance-2-5` / `gpt-image-2.5` 的胜出与「不回写」语义。
  - 理由：夹具改后 `row.fallback` 变为 `gpt-image-2.5`（图像）与 `seedance-2-5`（视频），断言对象随夹具变化。
  - 新期望：语义不变（偏好胜出、目录不被回写），仅型号随新真值调整。
- `scripts/verify-cross-plugin-model-alignment.test.mjs` :: `baseline repository contracts pass cross-plugin model alignment verification`
  - 原断言：`whitelistModelsChecked === 8`（文本 1 + 图片 2 + 视频 4 + 音频 1）。
  - 理由：白名单随网关在售集合收敛（#3734），计数随之变化；该数字仍作金丝雀保留。
  - 新期望：`whitelistModelsChecked === 5`（文本 1 + 图片 1 + 视频 2 + 音频 1），其余断言不变。

## 实现期偏离与例外

1. **STT 暂不纳入成员资格门禁**：随包快照（匿名口径）不发布任何转写型号，若对 STT 套用「不在快照即下架」，
   已上线的 whisper-1 默认会被拒。`stt.js` 显式传 `gatewayMembership: false`（只放宽这一道闸，
   操作契约准入不变），等账户视图/刷新后的快照发布 speech_to_text 型号后回收。
2. **`diff.js` 的 `hubCatalogView` 优先读 DTO 的 `gatewayListed`**：字段缺失时行为与 P1a 完全一致，
   因此 P1a 的 diff 用例不变；这是让只读对账跟着新真源走的最小改动。
3. **D1 收窄为「有 listed 操作的 runtime id 才必须有处置行」**：删除 3 条 draft 行后，
   有契约但无 listed 操作的型号不再需要处置行；D1 真正防的「可上架却无治理」风险不变。
4. **跨插件线路镜像一致性检查仍比对旧本地表**：`verify-cross-plugin-model-alignment.mjs` 与
   `verify-channel-group-pricing.test.mjs` 比对的是 `MODEL_CHANNEL_GROUPS` 与画布镜像（两者都未改），
   因此仍全绿；「改为对着新真源校验」属于镜像清理那一步，本步不做（见验收项偏离说明）。

## 不做什么

- 不改调用契约本身的格式（协议族重组是第三步）。
- 不删插件侧的镜像清单（画布白名单、已知模型能力表等），那是第二步的收尾，单独一个任务。
