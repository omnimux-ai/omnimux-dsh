---
title: "统一上游输入：Issue #2848 英文逐字文案"
id: "product-unified-upstream-input-2848-copy-en"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-30"
authors: ["Xu"]
subsystem: "omnimux-workflow"
tags: ["upstream", "input", "product", "copy", "en"]
supersedes: []
superseded_by: null
related:
  - "docs/product/unified-upstream-input-2848.md"
  - "docs/contracts/ui-copywriting-and-naming-standards.md"
---

# 统一上游输入：Issue #2848 英文逐字文案

作者：产品经理许清楚（Xu）。适用工作树：`cross-unified-input-issue-2848`。字典观察基线：`39c6449778c57d2b11451016e17cbb70b508f343`；本票前端尚未实施。

**PM_PREFLIGHT: translation issued**

**PM_SIGN_OFF: NOT_PERFORMED**

本文只签发[正式批准中文四件套](unified-upstream-input-2848.md#L142-L209)的英文等义逐字对照，供 V1 前端同步中文和英文字典。原 PRD、Spec、Plan 不变。发布翻译不等于实现完成、英文界面验收、多语言全量验收或几何例外批准。

## 一、范围与读表规则

仅覆盖本票卡槽、同一 Picker、预览、操作、编辑器占位、状态及校验错误，以及 Picker 必要角色和方式名称。表中中文原样来自批准白名单；英文列为唯一 literal，大小写、标点、空格及省略号逐字锁定。省略号统一为 `…`。不增加副标题、Badge、装饰图标、教程、计数按钮或重复区标题。原白名单已列 SVG 的许可不变，本文不新增任何图标。

`组件` 是正式中文文档的产品组件 ID，不是待创建的源码 key。`已核实 key` 仅指[中文母字典](../../plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts)与[英文字典](../../plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts)中确实存在的标识；不保证既有中文/英文 literal 已符合新白名单，也不自动批准把其他消费位置一并改写。`待接线` 只签发可见字符串决策，不虚构 key；实际命名、复用和消费点由前端在本票范围内核定。

真实来源名、文件名、正文、摘录、渠道名、格式标准名、模型与品牌名均为业务数据，不翻译、不重命名、不加营销修饰。两份既有字典中的品牌/模型名称保持原样。TXT、Markdown、PDF、Office 的名称保留不代表格式准入；PDF/Office 仍须真实有效链路证据才展示。

完整模板逐字翻译；`{方式名称}`、`{渠道名称}`、`{角色名称}`是中文批准表的业务变量，不是已经核实的源码插值 key。只替换真实数据：方式和角色使用本文固定集合，渠道沿用已有真实名称。工程若选用已有插值 API，必须报告实际字段，不得把本文变量标记误当已存在 key。

四类输出共用上游入口，文本首版必做。单正文 TTS 按已绑定且使用中的上游文本可见顺序，后接本地正文；不读名称、来源标签或 token，不新增合并开关或正文二选一错误。独立表达字段须有完整契约证据；缺口不靠英文文案补能力。

## 二、卡槽、预览、操作与状态

| 组件 | 已核实 key | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `inputs.add` | 待接线 | `添加素材` | `Add assets` | 空态存在任意上游发现路径；aria/title |
| `inputs.first` | `panel.slot.first_frame` | `首帧` | `First frame` | 当前完整方案声明该角色 |
| `inputs.first` | 待接线 | `添加首帧` | `Add first frame` | 首帧空槽 aria |
| `inputs.last` | `panel.slot.last_frame` | `尾帧` | `Last frame` | 当前完整方案声明该角色 |
| `inputs.last` | 待接线 | `添加尾帧` | `Add last frame` | 尾帧空槽 aria |
| `inputs.swap` | `panel.slotSwap` | `对调首尾帧` | `Swap first and last frames` | 两边整组约束满足时；aria/title |
| `inputs.preview` | `mention.preview` | `素材预览` | `Asset preview` | 同一文本/媒体预览浮层 aria |
| `inputs.actions`、`picker.actions` | `node.replace`；Picker 待接线 | `替换` | `Replace` | 预览替换；替换会话主按钮 |
| `inputs.actions` | 待接线 | `停用` | `Disable` | 保留绑定和来源，停止消费 |
| `inputs.actions` | 待接线 | `使用` | `Use` | 已停用项，经整组复核恢复消费；非 Picker 添加按钮 |
| `inputs.state` | 待接线 | `不兼容` | `Incompatible` | 已使用意图的格式、容量或角色冲突 |
| `inputs.state`、`picker.format` | 待接线 | `格式未知` | `Unknown format` | 必要格式尚未确定 |
| `inputs.state` | 待接线 | `等待中` | `Waiting` | 正在读取或上游产出未完成 |
| `inputs.state` | 待接线 | `不可用` | `Unavailable` | 来源失效 |
| `inputs.state` | 待接线 | `未使用` | `Not in use` | 显式停用；刷新或回切不自动恢复 |

每卡仅显示当前主因一个状态；正常无状态标签。`inputs.item` 的真实名称、摘录和缩略图不生成额外固定文案。`panel.slotClear` 现有 `移除（保留连线）` 不属于新版操作许可；不能把 `Remove (keep connection)` 当 `停用` 对照。预览现有 `node.replaceMaterial` 的 `替换素材` 也不扩大新版 `替换` literal。

## 三、Picker 与生成操作

| 组件 | 已核实 key | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `picker.shell` | `picker.title` | `素材` | `Assets` | 添加和替换会话同一标题 |
| `picker.shell` | `app.close` 存在；消费接线待核定 | `关闭` | `Close` | 关闭按钮 aria |
| `picker.source` | `picker.tab.canvas` | `画布` | `Canvas` | 画布来源 Tab，不加数量括号 |
| `picker.source` | `picker.tab.local` | `本地` | `Local` | 本地来源 Tab |
| `picker.search` | `picker.search` | `搜索素材…` | `Search assets…` | 搜索输入占位 |
| `picker.type` | 待接线 | `类型` | `Type` | 多个有效类型时；单类型隐藏 |
| `picker.type`、`picker.format` | `picker.filter.all` | `全部` | `All` | 下拉首项，不拼维度 |
| `picker.type` | `node.type.text` 存在；筛选接线待核定 | `文本` | `Text` | 完整候选支持文本 |
| `picker.type` | `picker.filter.image` | `图片` | `Image` | 完整候选支持图片 |
| `picker.type` | `picker.filter.video` | `视频` | `Video` | 完整候选支持视频 |
| `picker.type` | `picker.filter.audio` | `音频` | `Audio` | 完整候选支持音频 |
| `picker.type` | `panel.slot.document` 存在；筛选接线待核定 | `文档` | `Document` | 真实 document 导入与映射链可用 |
| `picker.format` | 待接线 | `格式` | `Format` | 文件格式筛选确有意义时 |
| `picker.views` | `picker.view.grid` | `网格` | `Grid` | 既有网格按钮 aria/title |
| `picker.views` | `picker.view.list` | `列表` | `List` | 既有列表按钮 aria/title |
| `picker.item` | `picker.added` 为现有候选状态位置 | `已使用` | `In use` | 相同消费身份已使用；仅有供给边不算已使用 |
| `picker.empty` | `picker.empty` | `暂无可用素材` | `No assets available` | 无可用候选 |
| `picker.empty` | `picker.emptyFilter` | `没有匹配的素材` | `No matching assets` | 筛选无结果 |
| `picker.local` | `picker.chooseFiles` 为现有导入按钮位置 | `导入文件` | `Import files` | 同一导入操作；TXT/Markdown 真解析必做 |
| `picker.local` | `picker.dropTitle` | `拖拽文件到此处` | `Drop files here` | 既有拖拽区 |
| `picker.draft` | `picker.removeFile` | `移除` | `Remove` | 移除未确认草稿；aria/title，不删原文件 |
| `picker.mode` | 待接线 | `方式` | `Method` | 多完整方式候选时的条件控件 |
| `picker.mode` | 待接线 | `方式：{方式名称}` | `Method: {方式名称}` | 唯一跨方式目标摘要；添加时确认 |
| `picker.channel` | 待接线 | `渠道` | `Channel` | 必须显式选择渠道时 |
| `picker.channel` | 待接线 | `渠道：{渠道名称}` | `Channel: {渠道名称}` | 必须显式变更渠道时的摘要 |
| `picker.role` | 待接线 | `角色` | `Role` | 存在会改变结果的角色歧义；固定角色入口隐藏 |
| `picker.actions` | `picker.cancel` | `取消` | `Cancel` | 不修改目标模型、方式、绑定或连线 |
| `picker.actions` | `picker.use` 为现有主按钮位置 | `添加` | `Add` | 全组使用意图由同一方式和渠道承接；不拼数量 |
| `generate.action` | `panel.generate` | `生成` | `Generate` | 最终全组重验；既有执行/额度/权限规则保留 |

现有代码引用 `picker.replace`、`picker.replaceTitle`，但两份字典均未定义这两个 key；这里只记录真实缺口，不把引用或 fallback 当已核实词条。替换会话仍按本文使用 `Assets` 标题和 `Replace` 主按钮，不沿用 `替换素材` fallback。

现有 `picker.dropHint`、`picker.items`、成功通知、部分成功或跳过文件文案未列入本票中文白名单，不在本轮补译，也不得据其存在追加界面文字。非本票消费位置不在本轮授权改写范围。

## 四、编辑器占位

| 组件 | 已核实 key | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `prompt.editor` | `panel.promptPlaceholder` | `输入提示词…` | `Enter a prompt…` | 普通无上游来源的提示词角色 |
| `prompt.editor` | 待接线；现有 `panel.supplementOptional` 不等字 | `补充要求…` | `Additional instructions…` | 普通有上游正文时本地补充要求；不用于单正文 TTS |
| `prompt.editor` | 待接线；现有 `panel.audioPromptPlaceholder` 为旧占位 | `输入正文…` | `Enter body text…` | 单正文 TTS 本地文字为正文；其他明确正文角色同义复用 |
| `prompt.editor` | 待接线 | `输入要求…` | `Enter instructions…` | 契约支持独立要求角色/字段 |
| `prompt.editor` | `panel.musicPromptPlaceholder` 为现有音乐占位位置 | `描述音乐…` | `Describe music…` | 明确音乐描述/风格角色 |
| `prompt.editor` | 待接线 | `输入歌词…` | `Enter lyrics…` | 明确歌词角色 |

旧 `panel.textPromptPlaceholder`、`panel.imagePromptPlaceholder`、`panel.videoPromptPlaceholder` 不能作为本票长占位新增许可；实际受影响消费点按批准角色接入上述 literal，不作全字典清扫。单正文 TTS 不显示 `Additional instructions…`，不提示保留单一正文来源。

## 五、条件角色与方式值

角色只在有真实 type/role/slot 映射且有必要时显示。下列词条是对中文 §3.3 的封闭等义集合，不新增角色，不证明角色已可选。同一中文在不同位置仍使用同一英文 literal；单项角色标签不按数量改成复数。

| 组件 | 已核实 key | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `picker.role`、`inputs.preview` | `panel.slot.first_frame` | `首帧` | `First frame` | 声明首帧角色 |
| `picker.role`、`inputs.preview` | `panel.slot.last_frame` | `尾帧` | `Last frame` | 声明尾帧角色 |
| `picker.role`、`inputs.preview` | 待接线 | `参考` | `Reference` | 通用 reference；不能一概写参考图 |
| `picker.role`、`inputs.preview` | `panel.slot.reference_image`、`panel.slot.reference_images`；其他旧 key 需核定角色 | `参考图` | `Reference image` | 明确图片参考 |
| `picker.role`、`inputs.preview` | `panel.slot.reference_videos` | `参考视频` | `Reference video` | 明确视频参考 |
| `picker.role`、`inputs.preview` | `panel.slot.reference_audio`、`panel.slot.reference_audios` | `参考音频` | `Reference audio` | 明确音频参考 |
| `picker.role`、`inputs.preview` | `panel.slot.reference_documents` | `参考文档` | `Reference document` | 真实文档链与角色成立 |
| `picker.role`、`inputs.preview` | `panel.slot.character` | `角色图` | `Character image` | 明确角色图片 |
| `picker.role`、`inputs.preview` | `panel.slot.driving_audio` | `驱动音频` | `Driving audio` | 明确驱动用途 |
| `picker.role`、`inputs.preview` | `panel.slot.mask` | `蒙版` | `Mask` | 明确蒙版角色 |
| `picker.role`、`inputs.preview` | 待接线 | `正文` | `Body text` | 正文角色 |
| `picker.role`、`inputs.preview` | 待接线 | `要求` | `Instructions` | 独立要求角色 |
| `picker.role`、`inputs.preview` | 待接线 | `歌词` | `Lyrics` | 歌词角色 |
| `picker.role`、`inputs.preview` | 待接线 | `风格` | `Style` | 独立风格角色 |
| `picker.role`、`inputs.preview` | `panel.slot.image` | `图片` | `Image` | 图片角色 |
| `picker.role`、`inputs.preview` | `panel.slot.video` | `视频` | `Video` | 视频角色 |
| `picker.role`、`inputs.preview` | `panel.slot.audio`、`panel.slot.audio_track` | `音频` | `Audio` | 音频角色 |
| `picker.role`、`inputs.preview` | `panel.slot.document` | `文档` | `Document` | 真实文档角色 |

方式值只用于本票 Picker 条件确认或摘要。已核实的 `tool.*`/菜单 key 是同名字典证据，不是 Picker 已接线证明；不改原工具菜单和品牌名。其余不从 operation ID 猜 key。

| 组件 | 已核实 key | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `picker.mode` | 待接线 | `文本对话` | `Text chat` | listed 且 profile/mapping/route 完整的对应方式 |
| `picker.mode` | 待接线 | `图文对话` | `Image and text chat` | 同上 |
| `picker.mode` | 待接线 | `多模态对话` | `Multimodal chat` | 同上 |
| `picker.mode` | `tool.text-to-image`、`menu.option.text.image-text-to-image` | `文生图` | `Text to Image` | 同上 |
| `picker.mode` | 待接线 | `垫图参考` | `Image reference` | 同上 |
| `picker.mode` | 待接线 | `多图垫图` | `Multi-image reference` | 同上 |
| `picker.mode` | 待接线 | `文生视频` | `Text to Video` | 同上 |
| `picker.mode` | `panel.slot.first_frame` 为同名角色 key；方式接线待核定 | `首帧` | `First frame` | 同上 |
| `picker.mode` | `panel.slot.last_frame` 为同名角色 key；方式接线待核定 | `尾帧` | `Last frame` | 同上 |
| `picker.mode` | 待接线 | `首尾帧` | `First and last frames` | 同上 |
| `picker.mode` | 待接线 | `全能参考` | `Multimodal reference` | 同上；非能力 Badge |
| `picker.mode` | `panel.slot.reference_image` 为同名角色 key；方式接线待核定 | `参考图` | `Reference image` | 同上 |
| `picker.mode` | 待接线 | `视频编辑` | `Video editing` | 同上 |
| `picker.mode` | 待接线 | `视频延长` | `Video extension` | 同上 |
| `picker.mode` | 待接线 | `数字人/对口型` | `Digital human/Lip sync` | 同上；`tool.digital-human` 不覆盖完整中文值 |
| `picker.mode` | `tool.text-to-audio`、`menu.option.text.audio-text-to-audio` | `文本转语音` | `Text to Speech` | 同上 |
| `picker.mode` | `tool.voice-clone`、`menu.option.audio.audio-voice-clone` | `声音克隆` | `Voice Clone` | 同上 |
| `picker.mode` | 待接线 | `AI 音乐生成` | `AI music generation` | 同上 |
| `picker.mode` | `menu.option.audio.text-audio-transcription` | `语音转文字` | `Speech to Text` | 同上 |
| `picker.mode` | `pill.speechToText` 为现有同名位置 | `语音识别` | `Speech recognition` | 同上；不能与语音转文字混为唯一值 |
| `picker.mode` | 待接线 | `文档参考` | `Document reference` | 同上，文档链真实可用 |
| `picker.mode` | 待接线 | `网页参考` | `Webpage reference` | 同上，网页链真实可用 |

## 六、错误与阻断

以下完整对应中文 §3.4。共用 Picker 必要原因与生成禁用反馈，不叠加提示条，不显示内部错误码。表中已有 key 只标语义相近位置；前端必须核定新原因到真实稳定接口的映射，不能把进行中的 shared/host 修改当最终实现，也不能仅改字典就声称阻断生效。

| 组件 | 已核实 key / 语义位置 | 批准中文 | 唯一英文 literal | 触发 |
|---|---|---|---|---|
| `picker.reason`、`generate.reason` | 待接线 | `这些素材无法在同一生成方式中使用` | `These assets cannot be used in the same generation method` | 无同方式、同渠道整组方案 |
| `picker.reason`、`generate.reason` | 待接线 | `部分素材不兼容，请替换或停用` | `Some assets are incompatible. Replace or disable them` | 保留使用意图不兼容 |
| `picker.reason`、`generate.reason` | `panel.reason.mime_unsupported` 为旧格式原因位置 | `素材格式不符合要求，请更换素材` | `Asset format does not meet the requirements. Replace the asset` | 已知格式不符 |
| `picker.reason` | 待接线 | `格式未知，暂不能验证兼容性` | `Format unknown. Compatibility cannot be verified yet` | 必要格式尚不确定，校验反馈 |
| `generate.reason` | 待接线 | `格式未知，暂不能生成` | `Format unknown. Cannot generate yet` | 必要格式尚不确定，提交反馈 |
| `picker.reason`、`generate.reason` | 待接线 | `当前契约未声明可用格式` | `The current contract does not specify supported formats` | 执行需要格式，但契约未声明 |
| `picker.reason`、`generate.reason` | `panel.reason.slot_capacity` 为旧容量原因位置 | `素材数量超过上限` | `Too many assets` | 数量超限 |
| `picker.reason`、`generate.reason` | `panel.reason.size_exceeded` 为旧大小原因位置 | `素材大小不符合要求，请更换素材` | `Asset size does not meet the requirements. Replace the asset` | 已知大小违规 |
| `picker.reason`、`generate.reason` | `panel.reason.duration_exceeded` 为旧时长原因位置 | `素材时长不符合要求，请更换素材` | `Asset duration does not meet the requirements. Replace the asset` | 已知时长违规 |
| `picker.reason`、`generate.reason` | 待接线；旧 `panel.slotMissing` 模板不同 | `请补齐{角色名称}` | `Add the required {角色名称}` | 必需角色未齐；角色值用本文英文，不回退 ID |
| `picker.reason`、`generate.reason` | `panel.reason.min_unsatisfied` 为旧必需素材原因位置 | `请补齐必需素材` | `Add the required assets` | 必需组合组未齐 |
| `picker.reason`、`generate.reason` | 待接线 | `请补齐正文` | `Add the required body text` | 必需正文未齐 |
| `picker.reason`、`generate.reason` | 待接线 | `请补齐要求` | `Add the required instructions` | 必需独立要求未齐 |
| `picker.reason`、`generate.reason` | `panel.reason.input_waiting` 为旧等待原因位置 | `素材尚未就绪` | `Assets are not ready yet` | 仍在读取或产出 |
| `picker.reason`、`generate.reason` | `panel.reason.input_unavailable` 为旧失效原因位置 | `素材不可用，请替换或停用` | `Asset unavailable. Replace or disable it` | 来源失效 |
| `picker.reason`、`generate.reason` | `panel.reason.catalog_unavailable` 为旧目录原因位置 | `模型目录不可用` | `Model catalog unavailable` | 目录不可用，不静态兜底 |
| `picker.reason`、`generate.reason` | 待接线；旧 `error.channelUnavailable` 语义与建议不同 | `当前渠道不可用` | `Current channel unavailable` | 当前渠道不可用 |
| `picker.reason`、`generate.reason` | 待接线；旧 `panel.reason.text_role_required` 不是新版语义 | `当前方式不支持该文本角色` | `The current method does not support this text role` | 角色或字段无法映射；不得用于阻断已批准单正文合并 |
| `picker.reason`、`generate.reason` | 待接线 | `文本超过上限，请调整内容` | `Text exceeds the limit. Adjust the content` | 文本超限，不截断 |
| `picker.reason`、`generate.reason` | 待接线 | `文本读取失败，请更换文件` | `Text could not be read. Choose another file` | 本地文本解析或编码失败 |
| `picker.reason`、`generate.reason` | 待接线；旧 `picker.unsupported` 含部分跳过行为 | `当前方式不支持该文件格式` | `The current method does not support this file format` | 本地文件格式不支持，不静默部分成功 |

旧字典 §`panel.reason.text_role_required` 的中英值要求保留一个正文来源，与批准单正文 TTS 冲突，不得在该场景保留、翻译或展示。旧 source 名、`{max}`、`{min}`、`{current}`、`{formats}` 原因模板不是本文新增许可，不应附加到本票已锁定错误句后。

## 七、几何证据与权限边界

| 对象 | 已读证据 | 结论 |
|---|---|---|
| 素材 well 44×44 | [Issue #1788 专项规格第 4、14 行](../../specs/independent-effective-slot-loading.spec.md#L4-L14)明文锁定文本卡 `44×44`及实测要求；主干提交 `b3ae2bc67`，`fix(workflow): 独立有效卡槽加载与固定文本方槽 (#1788) (#1798)` | 找到专项规格和已合入历史依据，保留本部件既定内容卡几何，不误当普通 IconButton |
| 图片/视频 well 44×44 | [媒体卡槽专项规格第 4 至 8 行](../../specs/slot-media-cover.spec.md#L4-L8)明文 44×44 及 `cover`；主干提交 `13b61ad3c`，`fix(workflow): 卡槽媒体缩略图支持等比例缩放铺满无黑边 (object-fit: cover) (#1915)` | 辅证既定方槽；不借旧 #760 的 `contain` 报告反向改现有媒体表现，不扩为全局按钮例外 |
| 资源 Picker 720px | [既有 ResourcePickerModal:157-164](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx#L157-L164)调用 `CustomModal` 且 `width={720}`；[正式中文规格第 148 行](unified-upstream-input-2848.md#L148)已记差异 | 核实既有实现，未找到该 Picker 的专项宽度批准真源。设计 Owner unresolved |
| 设计默认 | [design.md:30-37](../../design.md#L30-L37)普通控件 32px/8px，Modal 圆角 16px；[默认 Modal:243-246](../../design.md#L243-L246)宽度 `min(480px, calc(100vw - 48px))` | 现有 Picker 宽度差异不能由翻译文档补批准；也不授权全局缩窄、放宽或重设几何 |
| 不适用的近似证据 | [聊天输入框资产库 PRD:139-158](../specs/2026-09-04-composer-add-file-assets-prd.md#L139-L158)为“从资产库添加”的新组件建议约 720px | 不是画布 ResourcePickerModal 的专项批准，不转用其宽度许可 |

检索范围为本工作树 `docs/`、`specs/`、`.agent-reports/` 与根设计文档，关键词包括 `44px`、`44×44`、`720px`、`resourceModal`、`SlotWells`、`ResourcePicker`。没有读取 backend 正在修改的 shared/host 内容作为实现结论。44×44 专项依据只用于保留现有部件，不继承 #1788 旧输入消费语义；本票行为仍以正式中文四件套为准。

## 八、V1 接收条件

前端在本票受影响消费点同步中英等义 literal，并保持两字典现有品牌/模型名不变；待接线项必须核定真实 key，避免缺词 fallback、工程 ID 或中文落入英文界面。同步表不能被当成对整个字典的重命名授权。

实际界面完成后，按正式中文四件套检查卡槽、文本与媒体候选、真实预览、替换、停用/使用、角色化编辑器、必要错误和跨方式确认的中英一致性。没有实际界面及请求证据，不签发 `PM_SIGN_OFF: PASS`。720px 设计缺口由设计 Owner 查证/裁决，本文只登记，不创建几何方案。
