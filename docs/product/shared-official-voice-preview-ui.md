---
title: "官方音色共享试听产品四件套"
id: "spec-shared-official-voice-preview-ui-3058"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
updated: "2026-10-04"
---

# 资产库与创作画布共用官方试听映射：开发前产品策划

日期：2026-10-03
角色：产品经理 · 许清楚（Xu）
阶段：开发前产品核定；本轮仅更新四件套报告
PM_PREFLIGHT: APPROVED
产品核定：用户已确认共享方案、首版动作与两票顺序；按本报告范围供后续实施使用
本轮执行范围：仅本报告文档更新，不改业务代码，不执行 merge 或 restart
PM_SIGN_OFF: NOT_RUN（无本轮实现与真实界面验收）
合入门禁：首票先接已验证样音并演示，PM 终验通过且用户明确确认演示后，才可经 PR 合入；之后开展其他音色 audit 增量票。

## 当前发现入口（2026-10-04）

后续局部几何以 [音色弹窗四件套附录](<voice-picker-ui-polish-3058.md>) 为准；产品结果以 [限定签收](<shared-official-voice-preview-pm-sign-off-20261004.md>) 的 `PM_SIGN_OFF: PASS_SCOPED` 为准；最新工程/QA与命令证据见 [本票交付页](<../evidence/shared-official-voice-preview/delivery-20261004.md>)。以下开发前 `NOT_RUN` 与附录 T 的历史范围保持原义，不删除原验收、不将历史 FAIL 改成 PASS，也不将局部签收扩成全量。

## Conclusion

用户本轮已确认：同一 `voice_type` 在资产库与创作画布使用同一官方样音映射，支持播放、停止与切换；试听不改生成 `voice`；无验证链接不伪装可播，断网如实提示；BGM、SFX 与其他资产行为不变。前序证据为 509 个音色中 124 个当前候选命中可访问 MP3、385 个当前候选全部 404；不等于后者没有官方样音，也不等于前者全部已通过真实浏览器播放验收。

共享方案已核定为既有执行中枢 hub 拥有附属映射与候选规则，通过既有 `modelCatalog` 下发 preview DTO，并由 hub 离线导出同源快照供资产构建消费。两个消费者不维护私有映射或互相导入内部实现。媒体对外来源为火山官方 HTTPS CDN 直读，不做 R2 转载、媒体字节代理或 TTS 样音生成。离线快照仅包含元数据，不是离线音频包，断网不能假显示已播放。

首版复用既有资产音频卡、播放／停止图标、画布音色弹窗及候选回退，不另造播放器、营销徽章、重复组标题或生成入口。未有已验证映射的音色保留名录与画布选择能力，但不渲染播放键。试听成功或失败都不能改写生成 `voice` 参数。

**首版动作已核定：火山官方音色条目只提供试听与现有详情查看；`official-voice-preview` 卡片不渲染「保存到本地」「添加到会话」，详情不渲染「保存到本地」「加入对话」。** 用途必须无损传递到控制端与详情，不能只靠显示名或 ID 黑名单隐藏按钮；不留下普通保存／会话消费旁路。限制仅针对官方音色试听，不改变 BGM、SFX、角色或其他资产动作，也不删除名录。以后若要引用音色身份或保存样音，应另行确认语义与授权，不在本轮扩展。

播放失败及断网提示逐字核定为中文「试听暂不可用，请稍后重试。」、英文「Preview is temporarily unavailable. Try again later.」。复用现有提示载体，不显示「该音色暂无官方试听音频」，不增加提示条、错误徽章或重试按钮。

两票顺序已核定：S1 接入已验证样音，完成双端真实演示、PM 终验与用户演示确认后经 PR 合入；S2 在 S1 合入后核对其他音色官方链接并增量纳入。同意产品范围不等于演示已通过。本轮只更新本报告，不修改业务源码或设计规范，不执行 merge、restart、构建、环境物化、付费 TTS 或官方样音转载。

## Evidence

E1 至 E14 沿用前版已读取的证据快照，计数与源码观察均保留原证据限度，不声称本轮重新探测。当前批准依据是用户本轮明确确认，补读架构方案与 §3.5.1 控制端代码行用于更新产品规格，不把规格写成已实现现状。

| 编号 | 证据与摘录 | 支持的事实 |
|---|---|---|
| E1 | [前序调查报告：15-39](<../implementation/shared-official-voice-preview-plan-notes.md#e1来源证据与计数复核>)：124 条命中有效 MP3 文件；385 条当前候选全部 HTTP 404；不证明 385 个音色没有任何官方预览 | 官方样音可以复用；链接核对尚未完成；未做弹窗实际播放验收 |
| E2 | [候选审计：1-23](<../evidence/shared-official-voice-preview/initial-candidate-audit.json#L1-L23>)：`checkedAt=2026-10-03T15:10:20.311Z`；匿名 Range GET、audio MIME、MP3 头 | 124 个是文件可访问证据，不是收费 TTS 结果或全量浏览器可播承诺 |
| E3 | 前版只读 Node 校核 E2：509 个唯一 `voice_type`，124 个 `matchedUrl` 满足 2xx/audio/MP3 头，385 个无命中；38 个代号命中、86 个别名命中 | 名录不能压缩为 124 条；不能只拼接 `voice_type.mp3`；本轮未复发网络探测 |
| E4 | [CloudAssetsView:233-355](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx#L233-L355>)：`canPlay` 取决于 audio/hasMedia/playable；使用既有 PlayIcon/PauseIcon；悬停播放；保存与会话按钮常驻于动作簇 | 音频卡可以复用；媒体可播放与资产可保存／可引用目前未分开 |
| E5 | [cloud-feed-helpers:154-196](<../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js#L154-L196>)：normalizer 保留 `playable/hasMedia`，未保留稳定音色 ID 与 preview 语义；无媒体为文本卡 | 仅补 media_url 不足；需无损保留身份与试听用途，不能依赖卡片显示名 |
| E6 | [use-cloud-assets-feed:62-126](<../../plugins/omnimux-assets/src/client/use-cloud-assets-feed.js#L62-L126>)：`new Audio(cloudMediaUrl(id, 'media'))`；错误仅清空状态；[分类切换：286-298](<../../plugins/omnimux-assets/src/client/use-cloud-assets-feed.js#L286-L298>)停止试听 | 可复用单播和清理；资产卡目前没有专用播放失败提示 |
| E7 | [VoicePickerDialog:35-92](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L35-L92>)及[voicePickerModel:196-253](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.ts#L196-L253>)都有相同候选逻辑 | 共享应收敛既有重复，不复制第三份；保留外语别名／代号／原名／去版本名回退 |
| E8 | [VoicePickerDialog:141-193](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L141-L193>)：播放点击 `stopPropagation`，逐候选重试；失败 Toast；[行选择：300-339](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L300-L339>)调用 `onSelect(option.value)` | 试听与选择必须维持独立；现有所有行都有播放键，且已有「热门」徽章 |
| E9 | [资产文案：170-176](<../../plugins/omnimux-assets/src/client/locales.js#L170-L176>)：`试听`／`停止`；[动作文案：224-234](<../../plugins/omnimux-assets/src/client/locales.js#L224-L234>)：`添加到会话`／`保存到本地`／`加入对话` | 原有卡片是停止并归零，不承诺断点续播；本规格不用新增「暂停」卡片文案掩盖现有行为 |
| E10 | [add-to-chat:124-170](<../../plugins/omnimux-assets/src/client/add-to-chat.js#L124-L170>)：云端行透传媒体定位符；[统一引用投递：259-282](<../../plugins/omnimux-assets/src/client/add-to-chat.js#L259-L282>)仅为普通公共素材 context | 当前可证明的是媒体／资产引用，不是音色选择指令；未证明下游一定误改 voice，风险是缺少专用语义保障 |
| E11 | [cloud-catalog:324-442](<../../plugins/omnimux-assets/src/cloud-catalog.js#L324-L442>)：保存下载主媒体并 `library.add({files, source: cloud:id})`；[save route:335-345](<../../plugins/omnimux-assets/src/http-routes.js#L335-L345>)按 ID 执行 | 沿用保存不是「收藏音色身份」，会复制样音文件；下载授权不能从可公开试听推导 |
| E12 | [cloud-preview:44-60](<../../plugins/omnimux-assets/src/client/cloud-preview.js#L44-L60>)把 audio 行转换为媒体预览；[AssetPreviewModal:176-239](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx#L176-L239>)使用原生 audio controls、常驻加入对话、可选保存；[AssetsStage:458-465](<../../plugins/omnimux-assets/src/client/AssetsStage.jsx#L458-L465>)仅按 cloud ID 保存 | 除卡片外还须核定详情出口；不能只隐藏卡片动作却保留详情动作 |
| E13 | [builder collectVoices:1767-1793](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L1767-L1793>)保留 voice_type/resource_id 但 playable=false；[索引压缩：2242-2265](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs#L2242-L2265>)只选部分 meta | 页 JSON、搜索索引、normalizer 与详情转换都需身份和用途一致；失联会导致搜索结果与分类浏览差异 |
| E14 | [design.md:18-22](<../../design.md#L18-L22>)规定官方 token；[控件规范：30-55](<../../design.md#L30-L55>)规定几何、SVG；[下拉文案：217-219](<../../design.md#L217-L219>)区分维度触发器与 `全部` 首项 | 本功能不新创主题或控件体系，不改设计规范 |

观察到的范围外近失误：资产 hook 注释「the only route ... conversation」与实际已存在保存入口不一致；候选函数注释宣称固定 3-5 秒，但前序林潇样音为 9.912 秒。二者均不作为产品承诺，本轮不修源码注释。

## 1. PRD：产品概况与目标

### 1.1 Problem

用户在资产库浏览配音音色时无法试听，而画布已经能尝试播放官方公开样音。两端使用相同音色身份，却没有共同的已验证链接与可用状态；将空媒体地址误判为官方没有样音，会引出不必要的付费 TTS 或未经授权的再分发。

新增可播放地址还会自动接通普通资产保存和会话引用路径。用户在此处想了解音色，不是在生成新音频、提供克隆参考或提交生成参数，产品必须明确这些区别。

### 1.2 Solution 与核心用户价值

共用一个以 `voice_type` 为键、由既有 hub 拥有的官方试听解析模块。hub 通过既有 `modelCatalog` 发出只读 preview DTO，离线导出同源元数据快照；资产构建读取快照，画布沿既有 capabilities 消费 DTO。资产库恢复已有音频卡，画布保持现有选择弹窗；同音色读取同版本映射和同候选策略，最终媒体直接读取火山官方 CDN。已验证样音优先，候选回退保留；未验证名录不消失，不提供死播放键。S1 先接已验证样音并演示确认后合入，S2 再核对其他官方真实链接、增量增加覆盖，不要求首版全量覆盖。

播放是预览副作用，选择是参数副作用。两者不能互相暗示或触发。官方样音不进入「AI 生成」或生成历史，不生成节点输出，不自动变为上游音频、克隆参考、背景配音素材或 `voice` 参数。

### 1.3 用户故事

1. 作为在资产库挑选配音的创作者，希望试听已验证的官方样音，以便比较音色，而不用触发生成或付费。
2. 作为在画布配置音频节点的创作者，希望同音色与资产库使用相同试听资料，试听失败仍能选中原有音色，以便参数配置不被网络状态阻断。
3. 作为浏览完整音色名录的创作者，希望未核对出官方链接的音色仍可搜索和选择，以免把试听覆盖率误当成模型能力范围。

### 1.4 In scope

- 共享方案：hub 拥有附属映射与候选规则，既有 `modelCatalog` preview DTO 和 hub 离线元数据快照是消费接口；同音色两端同官方样音，不另建音色 registry 或预览服务。
- 首版行为：播放、停止、切换与查看详情；按验证状态显隐播放入口；试听不改生成 `voice`；断网或候选全失败用核定提示如实反馈；官方音色卡片与详情均不保存、不加入会话。BGM、SFX、角色与普通资产不变。
- 两票顺序：S1 优先前序 124 个有效候选，真实演示、PM 终验和用户演示确认后经 PR 合入；S2 在 S1 合入后核对其余官方真实链接并增量纳入，不阻塞首批演示。
- 产品一致性：无营销徽章、重复组标题、新增生成按钮；原有画布「热门」徽章不进入首版白名单，保留既有排序，不引入排序改造。

### 1.5 Out of Scope / Non-goals

不生成 TTS 样音；不替换官方音色目录；不删除 385 个音色；不保证 509 个音色都有样音；不新增全量覆盖仪表盘／覆盖率徽章／待验证标签／版权说明横条；不做音色收藏、引用身份新协议、克隆、自动选中音色、放入画布、批量下载、R2 转存、后台健康巡检或官方页面爬虫平台；不调整模型兼容范围、resource_id 选择、定价、生成输入、prompt、节点结构、排序规则、主题或页面大布局。

### 1.6 可测成功标准

- 基于前序固定审计快照，509 个身份保留；124 个验证映射具备播放资格，385 个无验证映射的条目无播放键。后续补链可改变数量，但必须以新证据更新，而非写死这些计数于 UI。
- 同 `voice_type` 的两端 primary URL、候选顺序、验证状态一致；英文／中文别名命中不可丢失。
- 试听点击与悬停不产生 TTS 请求、节点输出、资产写入、会话投递或参数写入；选中行仍只产生既有 `voice_type` 选择。
- 同一活动试听区域仅一个样音发声；停止、关闭、卸载／切离试听界面后无残留音频；过时回调不能覆盖新音色的播放状态。
- 验证链接失败并穷尽回退后只出现一次核定提示；已知断网可直接报告不可用，不假显示播放中，不把元数据快照伪称离线音频；保留音色行和选择能力，不显示「不存在官方样音」。
- 未验证音色、已验证音色及失败音色，在资产卡与详情均无保存／会话动作及旁路；其他类型资产动作不变。

## 2. Prototype：复用布局与文字结构

这是文字原型，不是已实现界面或交互演示。原有页面页头、工具栏、整体分类结构不重做。

### 2.1 资产库：公共 → 声音 → 配音

沿用公共分类导航、搜索、分页与网格。当前导航已经表示配音分类，不在网格前重复新增「官方音色」「配音音色」「官方试听」组标题。全部页原有分类货架不重做，也不额外新增音色分组。

单个已验证官方音色卡：既有音频色块与 PlayIcon/PauseIcon → 原始官方名称 → 既有客观描述。色块保持既有播放／停止触发方式，卡片文字区域仍打开既有详情。官方音色卡的保存／会话动作簇不出现，不留空按钮占位。

单个未验证官方音色卡：原始官方名称 → 既有客观描述。保持现有文本卡，无音频色块、播放键、灰态占位键、错误标签或「暂无官方样音」文案；文字区域仍可查看详情。

现有悬停试听可复用，但仅限已验证官方音色，不能变成页面加载、搜索、排序或进入分类时自动播放。用户显式停止后，同次悬停不得反向重启。试听按钮不触发详情。

### 2.2 资产库：官方音色详情

复用 AssetPreviewModal 外壳、名称和关闭按钮，不新造音色详情弹窗。

已验证条目：名称 → 既有 audio controls → 必要的一次性播放失败提示。无格式 Badge、路径标签、保存／会话按钮。原生音频控件及其系统本地化文案沿用，不复制另一套播放、进度、音量控件。

未验证条目：名称 → 既有完整描述 → 关闭。无 audio controls、无不支持格式插画、无保存／会话按钮。验证状态不是未知文件格式，不能退化为「当前文件格式不支持内嵌预览」。

打开详情前停止卡片试听，关闭／切换详情后停止详情音频，避免两套现有播放器并行发声。共享的是映射与解析语义，不要求首版新造跨插件全局播放管理器。

### 2.3 画布：音色弹窗

沿用既有 CustomModal、搜索、语言／口音／性别／场景四维筛选、音色列表及当前音色底栏。

结构：标题「选择音色」及现有关闭 → 搜索 → 四维筛选 → 单层音色行 → 当前音色底栏。

音色行结构：已验证时显示既有 Play/Pause SVG 按钮 → 官方名称 → 非冗余客观场景信息（如确有数据） → 当前选中的 Check。未验证时省略播放按钮，名称和选择区域仍存在。禁加「热门」「高清」「极速」「官方」「已验证」「待核对」徽章，禁插入新分组标题或宣传副标题。

保留现有排序；不因可试听状态更改音色顺序。不把名称里的 `2.0` 删掉；去版本名只用于既有样音候选回退。

## 3. Spec：UI 文案、组件白名单与行为规格

### 3.1 单一真源与身份／用途契约（已核定）

核定由既有 hub 拥有官方试听附属映射、验证口径与候选规则，音色身份仍来自既有 registry，不另建音色名录。运行时沿既有 `modelCatalog` 在音色 meta 中下发 preview DTO；构建时由 hub 自己的离线导出 CLI 生成同源 JSON 快照，资产 builder 只消费该公开快照，不启动 hub、不导入其他插件内部实现。采用 [架构报告的数据接口](<../implementation/shared-official-voice-preview-plan-notes.md#3-数据结构与公开-interface>) 作为实施口径；该报告的旧待批准状态不覆盖本轮用户确认。具体新增文件由后续工程计划登记，不再作为产品范围待决项，也不授权新增独立 package、预览 HTTP endpoint、IPC 或跨插件全局播放对象。

preview DTO 固定用途 `purpose='official-voice-preview'`，验证状态 `state='verified-file' | 'unverified'`，携带 `primary_url`、有序去重 `candidates`、`checked_at`、`evidence_ref`；稳定身份 `voice_type` 与 `resource_id` 保留在原 meta。离线快照携带 `schema_version`、`catalog_fingerprint` 与 `preview_fingerprint`，两个消费者校核同源版本，不独立手填映射。官方音色身份不是 card ID、中文名、URL 文件名或 `resource_id`；不得改写生成配置。

`verified-file` 只表示已有指定时刻的文件验证证据，不代表当前浏览器播放、官方版本身份或转载授权已通过。不能从 `hasMedia=true`、扩展名 `.mp3`、`source=volcengine` 或字符串拼接推导资格。用途、身份、验证状态与候选须在分页、全部货架、搜索索引、normalizer、详情转换中无损传递；控制端依据用途限制保存／会话动作，不依靠显示名或 ID 黑名单。

最终媒体只读火山官方 HTTPS CDN。既有按目录 ID 的媒体重定向可沿用，但不得抓取、缓存或代理媒体字节，不上传 R2，不发 TTS 请求。离线快照仅保存映射元数据；媒体断网时如实提示不可用，不宣称离线可听。

### 3.2 已验证优先与候选回退

1. 前序 matchedUrl 作为首个候选，保留检查时间和来源；不是新生成的音频。
2. 回退保留现有策略：外语名／斜杠别名 → `voice_type` → 中文原名 → 去 `2.0` 显示名，统一编码与去重；primary 已在列表中时不重复请求。
3. 回退只在具备已验证映射的音色发生运行时播放失败后尝试。无已验证映射的音色不以隐藏 autoplay 或用户点击行选择的方式进行候选探测；待查候选保留在真源供核对，不成为可见播放键的依据。
4. 某个回退临时播放成功不自动重写发布映射或生成参数。新增已验证记录仍需官方来源／文件证据核对；同名别名与不同版本的身份匹配存在歧义时不能随意挪用。
5. 385 个当前候选全部 404 的音色状态为「待核对官方链接」（内部数据语义），不是「官方没有样音」（用户事实陈述）。页面不展示这一内部状态 Badge。

### 3.3 UI 元素与逐字文案白名单（唯一真源）

本表冻结本功能涉及的区域，不借此批准全应用文案改写。动态内容必须来自既有官方目录的原始字段或明确规定的派生，禁止前端生成营销文案。未列入的新增元素一律非法。下表「不渲染」表示不输出文案或占位字符。

| 区域／组件 ID | 允许组件／图标 | 精确文案或动态模板 | 显隐／交互规则 | 严禁附加项 |
|---|---|---|---|---|
| assets.nav.source | 既有来源 Tab | 中文 `公共`；英文 `Public` | 原有入口不变 | 禁新设「官方试听库」Tab |
| assets.nav.audio | 既有分类 | 中文 `声音`；英文 `Audio` | 原有分类不变 | 禁叠加标题 |
| assets.nav.voiceover | 既有子分类 | 中文 `配音`；英文 `Voiceover`；重置中文 `全部`／英文 `All` | 名录范围不按试听状态过滤 | 禁新增「可试听」筛选 |
| assets.search | 既有搜索 Input | 中文 `搜索资产`；英文 `Search assets` | 原有行为不变 | 禁改成营销提示 |
| assets.voice.name | 既有卡片标题文本 | 原有 `name` 原文 | 全名保留，含版本号 | 禁加品牌／质量形容词 |
| assets.voice.description | 既有描述文本 | 原有客观 `description` 原文；无数据不显示 | 仅分类／语言／目录段等已存在客观信息 | 禁新增「专业配音」「高品质样音」副标题 |
| assets.voice.preview | 既有音频色块、PlayIcon／PauseIcon | title/aria：`{name} · 试听`、`{name} · 停止`；英文 `{name} · Preview`、`{name} · Stop` | 已验证显示；停止按原有归零语义；显式动作隔离详情点击 | 禁新增播放文字按钮、波形、下载图标 |
| assets.voice.details | 既有卡片正文可点击区域 | aria：`{name} · 查看详情`；英文 `{name} · View Details` | 有／无验证映射均可查看 | 禁改变为音色选择或生成 |
| assets.voice.actions | 不渲染官方音色动作簇 | 不渲染 | `purpose='official-voice-preview'` 的所有状态都隐藏保存与会话动作；普通资产不变 | 禁沿用 `保存到本地`／`添加到会话`、禁空占位 |
| assets.preview.title | 既有模态标题 | 原有 `name` 原文 | 有／无验证均显示 | 禁格式徽章、官方徽章、额外副标题 |
| assets.preview.audio | 既有原生 audio controls | 系统控件文案由浏览器本地化；不新写 | 仅已验证显示；不自动播放 | 禁新造进度／音量控件 |
| assets.preview.text | 既有文本预览 | 原有客观 `description` 原文 | 未验证时显示；不渲染格式错误空态 | 禁「无官方样音」判断 |
| assets.preview.close | 既有关闭 SVG | 中文 `关闭预览`；英文 `Close Preview` | 沿用关闭、Escape、遮罩 | 禁再加底部关闭 CTA |
| assets.preview.actions | 不渲染官方音色底部动作 | 不渲染 | `purpose='official-voice-preview'` 详情不加入对话、不保存；普通资产不变 | 禁保留加入按钮、保存按钮或隐藏旁路 |
| canvas.dialog | 既有 CustomModal 与内建关闭 | 标题 `选择音色` | 原有开关与关闭行为 | 禁标题图标／副标题／新确认按钮 |
| canvas.search | 既有 Search SVG、Input | placeholder `搜索音色...`；aria `搜索音色` | 原有即时搜索 | 禁扩写说明 |
| canvas.filters | 既有四个 CustomSelect | 触发维度 `语言`／`口音`／`性别`／`场景`；每个菜单重置项 `全部`；性别选项 `男声`／`女声`；其他选项取既有 facets 原文 | 触发器空态显示维度名；菜单第一项单独显示「全部」；实现需确认现有 CustomSelect 是否能区分 trigger label 与 option label，不扩展为筛选器重构 | 禁 `全部语言` 等；禁括号解释 |
| canvas.list | 既有单层 listbox | aria `音色列表` | 原有顺序与选中状态 | 禁重复可见组标题 |
| canvas.voice.name | 既有名称文本 | `resolveVoiceLabel` 原文：display_name → label → value | 无试听也可选择 | 禁截掉 2.0 版本号 |
| canvas.voice.meta | 既有次级文本槽（可为空） | 首个真实场景分类原文；缺失不渲染 | 仅保留帮助选音色的客观分类；不复制宣传 tags | 禁 `热门`、`抖音同款`、`剪映同款`、`豆包同款`营销标签／副标题 |
| canvas.voice.preview | 既有 Play／Pause SVG 按钮 | title `试听`／`暂停试听`；aria `试听 {label}`／`暂停试听 {label}` | 仅已验证显示；与行选择隔离；沿用现有停止并清理，非断点续播承诺 | 禁未验证的灰态播放键／死播放键 |
| canvas.voice.selected | 既有 Check SVG | 不渲染 | 只由 `option.value === value` 控制 | 禁播放后自动选中 |
| canvas.empty | 既有文本、条件按钮 | `未找到匹配音色`；`清除筛选` | 搜索筛选无结果时显示，不用于无试听 | 禁额外插画／营销引导 |
| canvas.footer | 既有 AudioLines SVG、文字底栏 | `当前音色`；选中 label 原文；无选择 `未选择` | 参数选择不受播放成败影响 | 禁样音 URL／覆盖率说明 |
| voice.preview.failure | 既有 toast／notice 载体；单条可访问状态提示 | 中文 `试听暂不可用，请稍后重试。`；英文 `Preview is temporarily unavailable. Try again later.` | 当前有效播放请求候选全失败或已知断网时提示一次并回空闲；画布沿用 toast.info；资产卡／详情复用现有 notice 或已有提示通道，不新造载体 | 禁「该音色暂无官方试听音频」、禁格式错误提示、禁假播放态、禁堆叠提示／重试按钮 |

画布现有硬编码中文不在首版额外进行全量国际化；资产英文是既有 locale 的对应冻结文案，新失败文案必须同时有中英文。CustomModal 内建关闭／焦点文案保持原组件，不另行复制。原有分页／加载／搜索空态与非官方音色资产动作均冻结不改。

### 3.4 试听状态与选择状态

| 状态／事件 | 资产库表现 | 画布表现 | 不变量 |
|---|---|---|---|
| 无验证映射 | 文本卡；详情完整描述；无播放键 | 保留行与选择，无播放键 | 不发 TTS；不抹掉 voice 身份 |
| 已验证且空闲 | 既有 PlayIcon、试听标签 | 既有 Play、试听标签 | 不自动选择，不标「生成完成」 |
| 用户开始试听／加载 | 用既有控件；无新加载 Badge | 用既有控件；无新提示条 | 播放态应以有效 play 结果／事件确认，不能永久假显示播放 |
| 播放中 | PauseIcon、停止标签 | Pause、暂停试听标签 | 同活动区域一个样音；voice 不变 |
| 用户停止／结束／关闭 | 清理实例，回空闲 | 清理实例，回空闲 | 无后台发声、无生成结果记录 |
| primary 失败、回退可播 | 无中途失败文案 | 无中途失败文案 | 候选顺序共源，不重发已失败同一 URL |
| 回退全部失败或已知断网 | 回空闲，一次核定提示 | 回空闲，一次核定 Toast | 不假播放，不把离线元数据当音频，不删除行，不判「官方无样音」，仍可选择 |
| 旧请求迟到 | 不覆盖新播放状态 | 不覆盖新播放状态或重复 Toast | request ownership 清理；双 error/play rejection 不双重推进 |
| 点击画布音色行 | 不适用 | `onSelect(option.value)` 并原有关闭 | 只传原 voice_type，不传样音 URL/resource_id 替代值 |

### 3.5 保存／加入对话边界及取舍

| 方案 | 优点 | 关键风险／成本 | 本次裁定 |
|---|---|---|---|
| 完全沿用普通资产动作 | UI 改动最少 | 保存下载样音；会话是普通媒体引用；下游没有已证明的 preview-only 防误用保障 | 首版排除 |
| 新增「收藏音色／引用音色」动作与专用协议 | 可保留身份便利、区分音频文件与 voice 参数 | 扩大 UI、数据持久化、下游消费与授权范围 | 本次不做 |
| 官方音色首版仅试听与详情，其他资产动作不变 | 最小明确产品范围，避免把样音当生成物／输入参数 | 需在卡片、详情及控制端一致限制官方试听用途 | 用户已确认，APPROVED |

该裁定不等于法律上所有本地下载均禁止，也不宣称公开 CDN 无版权；首版产品不提供保存动作，不留普通保存／会话旁路，明确禁止 R2 转载。以后若增加保存或引用，须另立授权与消费契约，不在本轮扩展。

### 3.5.1 控制端与代码行白名单（实施约束，非已改源码）

以下行号来自本轮只读源码，是后续实施定位基线；移行后以组件与函数名为准。只允许为官方试听用途增加必要条件、身份透传与播放适配，不授权改写普通资产行为。隐藏指不渲染，不是 CSS 隐藏、禁用按钮或空占位。

| 控制端／源码定位 | 允许的局部改动 | 官方音色硬规则 | 普通资产与选择不变量 |
|---|---|---|---|
| [normalizer:154-171](<../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js#L154-L171>) 与 [详情转换：44-60](<../../plugins/omnimux-assets/src/client/cloud-preview.js#L44-L60>) | 无损保留 `voice_type`、`resource_id`、preview 用途／状态／候选；详情读取同一 DTO | `official-voice-preview` 不因无媒体丢用途；未验证详情只展示描述；验证后才提供 audio | 非官方资产转换与能力不变；不以显示名判断用途 |
| [CloudAssetCard 控制函数：235-259](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx#L235-L259>)、[播放区：299-315](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx#L299-L315>)、[动作簇：319-344](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx#L319-L344>) | 按 DTO 资格控制播放；按用途控制动作与 handler | 所有 `official-voice-preview` 保存／会话按钮和动作簇不渲染；handler 不调用保存或会话投递；无验证不渲染播放键 | BGM／SFX／角色等普通资产保留原保存／会话／播放行为；正文查看详情不变 |
| [AssetsStage 保存控制：458-464](<../../plugins/omnimux-assets/src/client/AssetsStage.jsx#L458-L464>)、[详情接线：588-597](<../../plugins/omnimux-assets/src/client/AssetsStage.jsx#L588-L597>) | 按用途过滤详情保存能力并保护保存回调 | 官方试听不传可用保存 callback；回调遇到该用途不执行 `cloudSave.save`；不能仅凭 cloud ID 开放 | 普通公共素材继续沿用原保存接线 |
| [AssetPreviewModal 加入控制：73-85](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx#L73-L85>)、[保存控制：93-97](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx#L93-L97>)、[详情动作：208-239](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx#L208-L239>) | 依据 item 中保留的用途限制动作及回调 | `official-voice-preview` 详情无「加入对话」按钮、无保存按钮；不调用默认 `addMediaToConversation` 或自定义加入回调；无空 footer 占位 | 普通资产按钮、默认加入路径和保存能力不变 |
| [VoicePickerDialog 行选择：300-312](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L300-L312>)、[播放键：314-326](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx#L314-L326>) | 仅 `verified-file` 且有已验证 primary 时渲染既有播放键；播放消费共源候选 | 未验证按钮完全不渲染；播放／停止／切换与行选择事件隔离 | 所有音色行保持点击与 Enter／Space 调用 `onSelect(option.value)`；Check 只依当前 value；无验证、断网与失败均不阻断 select |

控制端用途限制必须覆盖保存 API／工具的实际入口，在网络或磁盘写入前拒绝 `official-voice-preview`，并阻断该用途的普通会话投递；界面隐藏不作为旁路已关闭的证明。此项仅限官方试听，不修改普通资产保存／会话契约。

### 3.6 设计与复用约束

沿用 [design.md](<../../design.md>) 的官方 token、主题级联、控件几何、SVG 与字体规格；不得修改该文件。复用既有音频色块、Modal、搜索和下拉，无新增样式体系、颜色轮盘或波形组件。已有高密度行内控件不借任务重做布局；若实测与设计几何冲突，记录并提出局部调整，不自批例外。

画布目前宽 540px，而设计通用 Modal 指引为 `min(480px, calc(100vw - 48px))`；现有组件是专用选择弹窗。本次先保留布局作为演示基线，不据此宣称几何已合规或启动宽度重构；实际是否需要局部宽度调整留待演示审核。明确指出差异，不修改设计规范。

## 4. Plan：已核定的实施与验收计划（本轮不执行）

### 4.1 两票、阶段门与顺序

一级票固定为 S1「已验证官方样音双端接入与演示」和 S2「其他音色官方链接 audit 增量」。下表 P1 至 P4 是 S1 内部实施阶段，不另扩为一级票；S2 阻塞于 S1 演示确认后合入，不反向阻塞 S1。

| 阶段 | 前置条件 | 计划内容／允许范围 | 完成证据／下一道门 |
|---|---|---|---|
| P0 产品核定 | 本轮用户明确确认 | hub 映射、preview DTO／离线快照、只试听／详情、未验证无播放键、断网提示与两票顺序均已确认 | PM_PREFLIGHT: APPROVED；不需要重复追问已确认范围 |
| S1-P1 真源与身份 | P0 已通过；后续独立工作树实施 | hub 持有附属映射与共同候选策略；导入前序 124 个 matchedUrl 与证据；通过既有 Catalog DTO 和离线导出快照供两端消费；保留其他 385 的名录与待查候选 | 同键同版本 primary／候选／状态；导出与包内加载可复核；新增文件由工程计划登记 |
| S1-P2 资产数据到卡片 | 真源契约稳定 | [catalog builder](<../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs>)、[cloud-feed-helpers](<../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js>)、[CloudAssetsView](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx>)、[试听 hook](<../../plugins/omnimux-assets/src/client/use-cloud-assets-feed.js>)、[locales](<../../plugins/omnimux-assets/src/client/locales.js>)；页／索引／搜索／normalizer 无损传递身份与用途；控制端禁止官方试听保存／会话旁路 | 分类／搜索／全部货架同资格；普通资产不回归；不复制音频，不上传 R2 |
| S1-P3 详情与画布 | 资产契约稳定 | [cloud-preview](<../../plugins/omnimux-assets/src/client/cloud-preview.js>)、[AssetPreviewModal](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx>)、[AssetsStage](<../../plugins/omnimux-assets/src/client/AssetsStage.jsx>)；[VoicePickerDialog](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx>)与[voicePickerModel](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.ts>)；遵守 §3.5.1 控制端白名单 | 同映射两端一致；详情无加入／保存；未验证无播放键但 select 不变；试听不写生成参数 |
| S1-P4 真实演示、终验与合入门 | S1 接入及必要验证完成 | 演示真实声音／配音卡片、详情和画布音色弹窗的播放／停止／切换／失败／断网；保存专属截图与交互证据，逐项终验 | PM_SIGN_OFF: PASS 或 REJECT；只有 PASS 且用户明确确认演示后，才可经 PR 合入；本轮不合入、不重启 |
| S2 其他音色 audit 增量 | S1 已演示确认并经 PR 合入 | 对其他音色逐条查官方真实样音链接及版本／身份，记录出处、检查时间、响应与文件格式；明确匹配后增量纳入同一 hub 真源 | 不猜 URL、不用其他音色顶替、不付费生成；不从 404 推导不存在；增量资格和两端一致性可核验 |

切片跨文件较多时继续拆为不超过五个业务文件的实施任务；身份／用途契约优先于 UI，防止先填 URL 导致旁路。目录构建路径使用显式工程输入，不偷用开发机默认绝对路径。新增共源文件、测试、生成物和构建工序由后续工程计划逐项登记，不能借产品核定扩大到新服务、全库重建、生产发布或重启。

### 4.2 自动化验证计划

按当前已读取的 package scripts，后续可用以下定向命令；本轮均未执行，不能拿命令存在宣称测试通过：

- 在已授权的独立工作树根执行 `pnpm --filter omnimux-assets test`，涵盖 catalog builder、server index/media 与 cloud save、card、preview、feed、locale、attachment 原有回归。
- 同位置执行 `pnpm --filter omnimux-workflow test` 与 `pnpm --filter omnimux-workflow typecheck`，涵盖 voicePickerModel、dialog、audio adapter 与选择参数回归。
- 定向运行画布现有测试：`node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.test.mjs plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerDialog.test.mjs plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/audioParamsIntegration.test.mjs`。
- 后续 S1 实施与隔离演示使用 `pnpm --filter omnimux-assets build`、`pnpm --filter omnimux-workflow build`，并为 hub DTO／离线快照登记定向测试；它们写构建产物，因此本轮不运行。catalog build 使用显式输入参数，不默认全量重建，不下载样音媒体。

测试 Interface 应覆盖：同键同映射、primary 优先／去重、86 个别名不能退化为只拼代号、未验证名录无播放、分页与索引身份无损、preview-only 动作能力、过时回调和 error/play rejection 重复触发、选中参数完全不变。依赖注入可模拟媒体事件测试，但模拟不能替代真实媒体播放演示。

### 4.3 关键操作旅程与量化验收

| 验收项 | 旅程与证据 | 通过条件 |
|---|---|---|
| A1 代号命中 | 资产库公共→声音→配音，查林潇 2.0，试听／停止；画布选同一音色试听 | primary 与 E2 相符；audio 非暂停且 currentTime 递增；停止后无发声；两端 voice 身份一致 |
| A2 别名命中 | 同路径查阳光阿辰，再在画布查同音色 | 使用中文文件名命中，不固定为 voice_type.mp3；参数仍为 zh_male_qingyiyuxuan_mars_bigtts |
| A3 未验证保留 | 查知性温婉 2.0、Jamie、Rosa；同映射无验证状态 | 资产名录与详情保留，无播放键；画布音色仍可选；不得显示「没有官方样音」 |
| A4 故障回退与断网 | 隔离演示中故意阻断 primary；再阻断所有候选；另做断网试听 | 回退可播不弹错误；全失败或断网只提示一次核定文案并回空闲；不假播放、不宣称离线可听；选择仍有效；不发 TTS |
| A5 选择／试听隔离 | 记录当前 voice；试听另一行；停止；再点击其选择区域 | 试听与停止期间 voice 完全不变；选择后仅变为既有 option.value；样音 URL 不成为生成字段 |
| A6 生命周期 | 连续试听两音色；打开／关闭详情；关弹窗；切分类／来源／活动页面 | 每次只有活动区域一个音频；旧音频停止；无后台残留；过时失败无重复 Toast |
| A7 动作边界 | 已验证／未验证官方音色卡、搜索结果、全部货架与详情逐一检查，并检查保存／会话控制入口 | 无保存、添加到会话或加入对话按钮；控制端无隐蔽调用／自动入库旁路；BGM／SFX／角色动作不变 |
| A8 文案与元素 | 对照 §3.3 检查源码与真实截图，明暗主题、键盘 Enter/Space、关闭与焦点恢复 | 白名单一致率 100%；新增未授权元素 0；营销徽章 0；重复组标题 0；可操作但无媒体的死播放键 0 |
| A9 生成边界 | 记录试听网络请求与生成历史／节点输出前后快照 | 试听仅媒体读取；计费 TTS 请求 0；新生成记录／节点输出／参数写入 0；无 R2 上传 |

截图必须来自声音／配音卡片及真实音色弹窗，不以主页冒烟图替代。可访问 MP3 与完整解码是链路证据，但不能当作浏览器进度证据；真实播放仍需 currentTime 变化与实际媒体事件／试听确认。本轮没有执行该验收，不声称可播 UI 已通过。

### 4.4 PM_PREFLIGHT 核查与门控

| 核查项 | 结果 | 说明 |
|---|---|---|
| 已确认产品方向与事实依据 | APPROVED | 同音色两端同样音、播放／停止／切换、无验证不伪可播、断网如实提示均已确认；124／385 非全量 UI 可播结论 |
| PRD／Prototype／Spec／Plan | DOCUMENTED | 四章独立；动作边界、逐字文案、控制端代码行白名单与验收齐全 |
| 设计规范读取与复用决策 | DOCUMENTED | [design.md](<../../design.md>) 未修改；画布 540px 现状差异已公开，不擅自重做 |
| preview 与生成参数隔离 | APPROVED | 只试听／详情；不改变 voice、生成记录或素材输入 |
| 首版官方音色动作取舍 | APPROVED | `official-voice-preview` 卡片隐藏保存／会话；详情无加入／保存；普通资产不变，控制端不留旁路 |
| 共享 seam | APPROVED | hub 拥有 mapping／候选规则，既有 Catalog preview DTO 与 hub 离线快照；官方 CDN 直读；新增文件由工程计划登记 |
| 两票顺序 | APPROVED | S1 已验证接入，演示确认后经 PR 合入；之后 S2 其他音色 audit 增量 |
| 产品实施依据／本轮执行范围 | APPROVED / DOC_ONLY | 后续按核定范围实施；本轮仅文档，不改业务代码；不代表演示、合入或发布已完成 |
| 演示／PM_SIGN_OFF | NOT_RUN | 无本轮实现或真实界面验收，不给 PASS；后续 PM 终验通过且用户明确确认演示后才可合入 |
| merge／restart／付费 TTS／R2 转载 | NOT_PERFORMED | 本轮均不执行；TTS 样音与 R2 转载不属于批准范围；Agent 不重启 |

## Unknowns

1. 前序 124 个验证链接本轮未重新联网验证，不保证当前或所有浏览器持续可播；385 个是否存在其他版本／目录官方链接需由 S2 核对官方真实来源。该未知项不改变已批准首版范围。
2. 已命中别名样音的音色身份／模型版本对应，前序文件存在性证据不能完全证明音质与版本正确。S1 演示前需对重点样音听辨及官方页面身份核对，不移用近似音色。
3. 已有资产 notice 能否直接承接卡片与详情失败、CustomSelect 能否区分触发器维度名和首项「全部」、画布 540px 在实际容器下的几何合规，尚未通过浏览器验证。若需要新载体或重做控件，返回 PM 核定，不自行扩展。
4. 新 DTO 的包内加载、离线导出、生成目录指纹与线上／本地目录一致性尚未实施验收；hub 拥有方案已确认，具体新增文件与测试由后续工程计划登记。不得把接口方案等同于安装或界面已成功。
5. 官方公开可试听不等于本地保存／转载授权；本轮未调查完整授权条款，也不提供保存、引用或转载能力。该未知项不能用于重新开放首版已排除的动作。

## Not covered

未读取或应用 AGENTS／CLAUDE 特殊业务话术；只使用当前用户要求、实际工程与设计文件作为事实与产品依据。未修改业务源码、测试、构建产物、design.md 或现有调查报告；未运行构建、测试、浏览器演示、应用物化、Git 提交／合并、重启、TTS、上传或付费调用。未创建 Issue／PR，不代替架构实施设计或 PM_SIGN_OFF。

本报告限定于官方音色 preview。普通素材、音效、背景音、角色、生成素材及其原有资产动作不重新授权或改版；同一仓库其他并发工作的改动不属于本轮。

## Confidence

- **高**：既有代码证实双端可复用试听路径、媒体资格与保存／会话动作没有用途隔离、画布候选逻辑重复、稳定音色身份在资产转换链路丢失；前序审计数据重新计算与 124／385／38／86 完全一致。
- **高（已批准产品范围）**：用户已确认 hub 同源映射、preview DTO 与离线快照、首版只试听／详情、无验证不渲染播放键且选择不变，以及 S1 演示确认合入后再 S2 增量；PM_PREFLIGHT 为 APPROVED，不是界面验收 PASS。
- **中**：已核定共享方案的实际包内加载、DTO 透传、提示与筛选组件复用需后续实现和真实界面核实；具体文件由工程计划登记。
- **低／未验证**：所有样音在当前浏览器中实际可播、385 个音色的其他官方链接、完整转载授权与两端 UI 终验。最弱证据点是缺少真实弹窗播放演示与官方版本身份核对。

## 本轮产出核对

本轮更新基线：工作目录为 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`，更新前 `git status --short` 无输出。本轮以已有报告及用户明确确认作为依据，补读 [架构报告](<../implementation/shared-official-voice-preview-plan-notes.md>) 与控制端实际代码行，写入范围仅本报告。前序证据表保留为历史观察，不声称本轮重复执行全部探测或 SHA-256 校核。

收尾已核对：四件套与 Conclusion／Evidence／Unknowns／Not covered／Confidence 章节齐全；PM_PREFLIGHT 为 APPROVED，PM_SIGN_OFF 为 NOT_RUN；共享方案和首版动作均为已确认范围；控制端白名单与报告内本地文件链接检查通过，文档标点检查通过；S1 演示确认后经 PR 合入、之后 S2 audit 增量的门禁不变。文档检查不等于业务测试、真实播放验收、实现或合入。

## 附录 T：#3058 音色弹窗主题纠偏（局部 Spec / Plan）

日期：2026-10-03；核定人：产品经理 · 许清楚（Xu）。

**PM_THEME_CORRECTION: APPROVED（仅既有颜色消费恢复）；PM_SIGN_OFF: NOT_RUN。** 原 PM_PREFLIGHT、§3.3 逐字白名单及演示后合入门全部有效。本附录是 §3.6 的实现澄清：允许消除与现行设计不符的固定暗色，不批准新主题、新元素或几何改版；技术 token 已由 PM 核定，无需再向用户索取颜色选择。详情关闭归零／切本地卸载的真实证据仍未齐，整票不因此通过。

### T.1 PRD：恢复既有设计，不增加产品范围

问题：round6 已接入真实官方 light 主题，音色弹窗却保留固定暗底，浅色名称与底栏文字落在暗面上。目标：light 与 dark 均随宿主原生语义级联，名称、输入、筛选、当前音色可读；搜索后剩余空白不是固定黑洞。

依据：[round6 报告:62–68](<../../.agent-reports/shared-official-voice-preview/browser-qa-round6.md#L62-L68>)、[真实 computed](<../evidence/shared-official-voice-preview/browser-qa-round6/light-theme-computed.json>)、已 display_file 复检的[画布播放原图](<../evidence/shared-official-voice-preview/browser-qa-round6/2026-10-03T22-17-37.366Z-9c0340aa/canvas-dialog-playing.png>)与[资产详情原图](<../evidence/shared-official-voice-preview/browser-qa-round6/2026-10-03T22-17-37.366Z-9c0340aa/assets-failure.png>)。资产浅色详情仅是同轮主题对照，不证明详情起播或关闭通过。归因是现有生产 CSS，不是 fake fixture 或全局 token 为空。

非目标：不改 [design.md](<../../design.md>)；不造播放器／组件／Badge／copy／分组；不调整宽度、高度、间距、字体、圆角、列表最小高度、滚动、阴影几何、动效、DOM、业务、选择、播放或测试 runner。`width={540}`、≤70vh、既有布局继续作为演示基线；通用几何债不在本次解决，也不宣称已合规。

### T.2 Prototype：可见结构与逐字文案零变化

既有 CustomModal「选择音色」与关闭 → 原搜索 → 原四维筛选 → 原单层音色行 → 原「当前音色」与名称底栏，顺序、显隐、SVG、aria 与动态名称一律沿 §3.3。已验证／未验证、播放／选择的行为不变。新增可见元素 0，改写文案 0；只有颜色随宿主切换。

### T.3 Spec：语义颜色唯一字典与选择器边界

设计依据为 [design.md:74–114](<../../design.md#L74-L114>)、[搜索:221–225](<../../design.md#L221-L225>)及[模态:248–250](<../../design.md#L248-L250>)。实际 [round6 官方主题产物](<../evidence/shared-official-voice-preview/browser-qa-round6/2026-10-03T22-17-37.366Z-9c0340aa/official-theme.css>)定义了 `bg-base/bg-layer-1/border-l1/l2/l3`，未定义通用 `bg-elevated/border`；禁止直接使用空别名使背景透明。设计表的参考 Hex 不是运行时替代调色板。

本附录唯一锁定链：弹窗／菜单表面为 `var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)))`；常规外框为 `var(--dsw-alias-border, var(--dsw-alias-border-l2))`。均只使用现有设计字典，light/dark 使用同一链，禁止新增变量、裸色 fallback、JS 主题特判或覆盖宿主变量。Dialog 属选择界面，不适用视频媒体节点「浅色仍暗底」例外。

生产定位仅 [components.css](<../../plugins/omnimux-workflow/src/canvas/theme/components.css>) 中既有三个组件区：CustomModal、VoicePicker、供本弹窗使用的 CustomSelect。优先三个锚点：`.wf-voice-picker-modal`（表面）、其 `.wf-modal-title`（标题）、`.wf-voice-picker__selected-name`（底栏核心值）。共享规则只能以现有音色 modal 成员关系局部限定，不得全局重涂所有 modal/select；允许颜色覆盖选择器，不允许增加 DOM/class 或组件 API。

| 现有选择器／区域 | 固定语义角色 | 唯一批准的现有 token／透明继承 | 可见元素与文案约束 |
|---|---|---|---|
| `.wf-voice-picker-modal` | Dialog 主体表面、外框、默认正文 | 背景用上述表面链；border-color 用上述外框链；color 为 `--dsw-alias-label-primary` | 保留现有 540px 外壳；不按画布点阵根底另造色 |
| 同 modal 内 `.wf-modal-body`、`.wf-modal-header`、`.wf-modal-footer` | 连续主体表面、现有分隔 | 背景透明／继承主体；既有上下 divider 为 `--dsw-alias-border-l1` | 不新增分隔线；无结果／单行时原留白仍同主题表面 |
| 同 modal 内 `.wf-modal-title`、`.wf-modal-close` 及 hover | 一级标题、次级关闭图标 | 标题 `--dsw-alias-label-primary`；关闭 `--dsw-alias-label-secondary`，hover 文字 primary、背景 `--dsw-alias-interactive-bg-hover` | 标题「选择音色」和内建关闭不改 |
| `.wf-voice-picker__search`、其 input／placeholder | 输入槽、搜索图标、输入值、占位 | 槽 `--dsw-alias-bg-layer-1`；图标 `--dsw-alias-label-secondary`；input primary、placeholder `--dsw-alias-label-tertiary`；input 背景透明 | 不新增描边或说明；现有 focus 的 brand-primary 保留 |
| `.wf-voice-picker__filter` 的既有 trigger／chevron／hover | 筛选控件、主值、次级箭头 | 背景 layer-1；边框 border-l2；主值 primary、箭头 secondary；hover 背景 interactive-bg-hover、边框 border-l3 | 四维、首项「全部」与既有 open/focus 几何不改 |
| `.wf-voice-picker__row-name`、`__row-tags`、`__empty-text`、`__empty-clear` | 核心名称、辅助场景、空态、清除动作 | 名称／清除 primary；场景／空态 secondary；清除现有边框 border-l2、hover interactive-bg-hover | 不把场景正文降为 tertiary；无新增标签 |
| `.wf-voice-picker__row:hover/:focus-visible`、`__row--selected` | 原有悬停／选中反馈 | hover 背景 interactive-bg-hover；selected 背景 `--dsw-alias-interactive-bg-active`；原 brand-primary 选中描边保留 | 不改变选中逻辑、排序与行高 |
| `.wf-voice-picker__preview` 及 hover／playing／focus、`__row-check` | 次级试听图标、播放／选择反馈 | 原边框 border-l2、图标 secondary；hover 边框 border-l3、图标 primary；playing 与 Check/focus 沿现有 brand-primary、原 16% 色混合 | 不新增播放状态文案或图标；不改声源 |
| `.wf-voice-picker__selected`、`__selected-label`、`__selected-name` | 底栏次级标签／图标、核心音色值 | 标签／AudioLines secondary；选中名称／「未选择」primary；背景继承主体 | 原「当前音色」与动态名称不改，不隐藏底栏规避低对比 |
| `.wf-modal-overlay:has(> .wf-voice-picker-modal)` | 本弹窗既有遮罩 | `--dsw-alias-bg-mask-1` | 原阴影及 blur 保留，不将遮罩 token 另用作新阴影体系 |
| `body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown` 及其原 option／hover／selected／check | Portal 菜单面、选项与反馈 | 面用上述表面链；框用上述外框链；文本／Check primary；hover interactive-bg-hover；selected interactive-bg-active | Portal 非 modal 后代，必须命中真实 body 子菜单；不追加新菜单，仅音色弹窗活动时限定颜色 |

表内未重复前缀的 primary／secondary／layer-1／border-l1 等均指同名完整 `--dsw-alias-*`，不是新增变量。`transparent`、`inherit` 和既有 SVG `currentColor` 可保持。既有 `--wb-*` 若解析已符合表内角色，无须机械迁移；禁止全局重定义该桥接变量。允许改动只限本表既有组件的颜色声明，非颜色差异须另报 PM，不能自动扩大授权。

### T.4 Plan：实施与真实验收（本轮不执行）

前端先按 T.3 在原生产 CSS 局部恢复颜色，确认 diff 无非颜色属性／文案／DOM／业务变更；不改 fixture 配色来凑绿，不碰 runner。本附录不是新增一级票，也不启动主题平台治理。

QA 后续在同一修复源码指纹下，取得真实官方 light、dark 各自的功能路径截图与 computed 记录：全列表、完整名称搜索后单行、播放中、筛选菜单打开、空态、当前音色底栏。主题选择器与实际 token 均须有效；主体／菜单背景按本表链可解析、非透明；input／名称／标签／divider 与对应 token 实值一致。dark 依宿主，不复制 light 固定色值；不要求等同画布根的点阵色。

人眼 display_file 复检要求：两主题正文、输入、筛选、名称和底栏清晰；light body 无固定大黑块，dark 无浅色控件孤岛；原单行搜索留白可保留，不靠缩高／改间距藏问题。正文及关键交互文本对最终合成背景按 [design.md:63–66](<../../design.md#L63-L66>) 实测 ≥4.5:1；标题适用阈值按该规范。当前未测量数值，不凭 token 名或截图捏造已达标。

局部颜色满足后仍须补齐资产详情原生起播、播放中关闭归零及切本地卸载证据，结合既有功能外门再提交 PM 整体终验。本轮仅批准恢复方向；不记 PM_SIGN_OFF PASS/REJECT，不改 round6 FAIL 历史。唯一用户合入决策仍是终验后真实演示确认，再经 PR 合入，不能以本附录替代。
