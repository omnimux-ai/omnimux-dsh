---
title: "统一上游输入：Issue #2848 V1 UI 决策"
id: "product-unified-upstream-input-2848-ui-decisions"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-30"
authors: ["Xu"]
subsystem: "omnimux-workflow"
tags: ["upstream", "input", "product", "ui", "v1"]
supersedes: []
superseded_by: null
related:
  - "docs/product/unified-upstream-input-2848.md"
  - "docs/product/unified-upstream-input-2848-copy-en.md"
  - "docs/plans/unified-upstream-input-2848-plan-notes.md"
  - "design.md"
---

# 统一上游输入：Issue #2848 V1 UI 决策

签发人：产品经理许清楚（Xu），本票 UI 与逐字文案唯一 Owner。
适用工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-unified-input-issue-2848`。
实际读取日期：2026-09-30。HEAD/base：`39c6449778c57d2b11451016e17cbb70b508f343`。

**PM_PREFLIGHT: approved for scoped V1 layout and interaction implementation**

**PM_SIGN_OFF: NOT_PERFORMED**

## 一、结论与权威边界

资源 Picker 在本票局部采用设计默认宽度 `min(480px, calc(100vw - 48px))`；不保留无专项批准证据的 `720px`。复用现有 CustomModal，通过已经在 V1 范围内的 ResourcePickerModal 局部 ref/wrapper/effect 管理对话框语义、焦点限制、焦点恢复及既有关闭按钮的中英标签；本次不扩写 CustomModal 或 CustomSelect。上述局部路径经源码核对可行，不再等待用户决定内部组件架构。

中英文产品白名单保持有效：没有额外类型 Badge、来源 Tab 数量、添加数量、替换专用标题、内部 ID 或营销说明。现存源码或静态 regex 允许某种结构，不构成其可见文案许可。测试的真实行为变化与仅结构兼容分别见第五节；本轮不写、不运行测试。

本文补充[已批准产品四件套](unified-upstream-input-2848.md#L142-L209)与[英文逐字表](unified-upstream-input-2848-copy-en.md#L62-L98)，只关闭其中已登记的宽度和通用壳复用缺口，不重写原文件、不覆盖 L1 设计、不授权其他功能。五个垂直薄片、同一 Picker 确认方式、单正文 TTS 顺序和 TXT/Markdown 首版必做均已关闭，不重问。V1 不提前实现 V3 全路由选择或 V4 文本文件解析，不把后续薄片标为可用。

文档影响：唯一任务文档写入为本文；设计、产品四件套、英文表、工程规格和计划原文保持只读。后端正在修改的 shared/host/YAML/测试保持不触碰，未读取其 dirty 实现来推定稳定接口。前端预检的 UI Owner 未决项以本文决策为准，其 backend 稳定 Interface 和真实运行证据要求不因此消失。

## 二、布局决策：局部应用已有设计，不设例外

### 2.1 可核实依据

- [design.md §5.5:243–246](../../design.md#L243-L246) 明定 Modal 宽度 `min(480px, calc(100vw - 48px))`、圆角 `16px`、原生表面与遮罩 token、底部操作间距 `8px`。
- [ResourcePickerModal:157–164](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx#L157-L164) 实际传 `width={720}` 和唯一 Picker 类名；只是实现现状，不是批准依据。
- [英文表 §七:195–205](unified-upstream-input-2848-copy-en.md#L195-L205) 已记录无 Picker 专项宽度真源，且聊天输入框资产库约 720px 建议不是本组件许可。本轮另检索工作树 `docs/decisions/` 中 `720|480|ResourcePicker`，未命中专项决策。
- [CustomModal:15–18、54–76](../../plugins/omnimux-workflow/src/canvas/ui/CustomModal.tsx#L54-L76) 已接受字符串 width、外壳 className、bodyClassName 和任意 title/footer/children；无需改默认 width 或通用壳接口。
- [components.css:5445–5520](../../plugins/omnimux-workflow/src/canvas/theme/components.css#L5445-L5520) 通用壳仍有 `18px` 圆角、`90vw` 上限、旧色值、28px 关闭按钮；[Picker CSS:5541–5714](../../plugins/omnimux-workflow/src/canvas/theme/components.css#L5541-L5714) 已有局部类名、单行工具栏、420px body 最小高与四列网格。它们是实施要适配的现状，不是全局重设理由。

### 2.2 前端执行口径

| 对象 | 唯一批准方向 | 边界 |
|---|---|---|
| 外壳宽度 | 在现有 Picker 调用传设计默认的精确字符串；局部上限与 `calc(100vw - 48px)` 一致，不受旧 `90vw` 额外收窄 | 不改 CustomModal 默认 640、不保留 720、不改其他 Modal |
| 外壳与标题 | 在 `.wf-picker-modal` 及其局部后代消费原生 token、16px 圆角、标题 16/22、既有 X 关闭控件 32px/8px | 不重写 `.wf-modal-card`、`.wf-modal-title`、`.wf-modal-close` 的全局定义，不私造 token |
| 工具栏 | 搜索、条件类型筛选、既有网格/列表保持单行；单类型隐藏筛选；普通操作按设计几何 | 不新增第二工具栏、计数条或固定全类型列表 |
| 网格与短视口 | 在现有 Picker CSS 局部降低列数/允许内容区域收缩与内部滚动，避免原四列或420px最小高导致溢出；底部取消/确认始终可达 | 不以缩字、截正文、放宽宽度或清扫所有组件解决挤压；不新增 UI 元素 |
| 底部操作 | 右对齐、间距8px、`取消` 与 `添加`/`替换`；主操作黑白反转，原生焦点/禁用反馈 | 不拼数量，不改节点原底栏胶囊共享契约 |
| 卡槽与媒体预览 | 素材 well 保留已批准44×44及现有 cover；Picker 的媒体预览保留现有 contain/比例分档 | 不把 well 的 cover 授权套到 Picker；不借本票统一全局卡片尺寸 |

批准现有 [components.css](../../plugins/omnimux-workflow/src/canvas/theme/components.css) 中本票 Picker/卡槽受影响的局部样式接线。这是[既定 V1 UI 范围](../plans/unified-upstream-input-2848-plan-notes.md#L174)内的设计符合性修改，不是几何豁免、共享组件重构或追加目录。

## 三、可访问性决策：现有 Picker 局部管理

### 3.1 可行性证据

[CustomModal:31–42、46–80](../../plugins/omnimux-workflow/src/canvas/ui/CustomModal.tsx#L31-L80) 将唯一卡片 portal 到 document.body，遮罩与关闭按钮沿用 onCancel；标题、body、footer 都在卡片内。它没有 role、aria-modal、focus trap/return，关闭 aria 固定为 `Close`。Picker 的 body 子节点可挂局部 ref，其 `closest('.wf-picker-modal')` 可取得同一实例的卡片、标题、关闭按钮和 footer；不能以页面级 `document.querySelector` 猜第一个 Modal。title 支持 ReactNode，可在局部提供稳定 title id。因此不用向全局 CustomModal 增 props 即可做到本票要求。

[CustomSelect:43–44、78–114、144–224](../../plugins/omnimux-workflow/src/canvas/ui/CustomSelect.tsx#L78-L114) 的列表 portal 另挂到 document.body；触发器已有 aria-haspopup/aria-expanded，选项为 button，外部关闭与 Escape 监听存在。只把 focus trap 写成 `card.contains(target)` 会误排本 Picker 的合法筛选选项；允许全页面所有 `.wf-custom-select-dropdown` 则会越权接纳其他弹层。局部管理必须处理此真实 portal 边界。

### 3.2 局部交互与逐字白名单

| 项目 | 批准行为 | 禁止 |
|---|---|---|
| 对话框语义 | 局部在本实例 card 设 `role=dialog`、`aria-modal=true`、`aria-labelledby` 指向显示 `素材`/`Assets` 的既有标题；没有可聚焦控件时 card 可程序聚焦 | 新建第二对话框、在 body/标题/footer重复挂多个dialog |
| 关闭名称 | 局部 effect 在既有 `.wf-modal-close` 同步当前语言的 `关闭`/`Close`；使用已批准翻译，不新增可见文字 | 加第二关闭按钮、用中文 fallback 混入英文、借机改所有 Modal |
| 初始焦点 | 画布页优先搜索框；无搜索时是当前来源页首个有效交互控件；没有可用控件时聚焦本实例card | 自动聚焦确认、打开即提交、焦点留在背景 |
| 焦点限制 | Tab/Shift+Tab只在本实例已显示、可用控件与其所属弹层之间循环；focusin 防背景逃逸；候选选中态以原生/ARIA状态表达，Enter/Space实际可选 | 查询所有页面按钮；用额外“已选N项”文字弥补状态 |
| 来源 Tabs | 保留 `画布`/`本地`，aria-selected正确，键盘可切换并对应实际tabpanel；切换/筛选卸载当前焦点目标时回到本实例合理控件 | 数量后缀、空白重复区标题 |
| 内嵌筛选 portal | 仅纳入由本card内实际已展开trigger产生的dropdown。局部记录新增portal与该trigger归属及清理；选项可键盘选择，选择/收起回trigger | 允许任意全局dropdown、改CustomSelect全局行为 |
| Escape | 本 Picker 所属筛选展开时先关闭该筛选并回trigger，拦截本次事件防止全局壳同时退出；无内嵌层时沿现有 onCancel 关闭Picker | 一次Esc同时关闭多层、重复提交/重复关闭 |
| 关闭与恢复 | 取消、X、遮罩、Esc、成功确认关闭及组件卸载都清理本实例监听/临时属性，并恢复打开前入口焦点；入口因容量变化消失时回到原节点配置区可用入口/容器 | 焦点落body/其他节点，强行重建已消失卡槽 |
| 原生文件选择 | OS文件选择器激活期间不抢焦点；返回后仍归本Picker，保持取消无目标图变更 | 以focusin监听干扰系统文件选择器、提前承诺V4解析 |
| 校验原因 | 复用已批准单处原因；必要 aria-describedby/status 对接同一原因，键盘可读。invalid/pending不靠颜色或disabled title独自传达 | 复制一份原因、内部错误码、教程横条 |

实现细节属于前端，可用已有 React ref/effect，在当前 ResourcePickerModal 内设置属性、捕获监听和所属 portal 关联；不新增 focus 管理框架、依赖或共享模块。临时属性和监听必须按实例保留旧值并恢复，兼容 React StrictMode 的重复 setup/cleanup；locale 变化不得把外部焦点重新捕获为 opener。焦点恢复必须等待旧实例实际卸载/关闭，不在重渲染或语言更新时提前跳回。与合法系统文件对话框、同一Picker所属portal的活动不构成背景逃逸。

静态读取支持“局部路径可实施”，不证明运行结果已经符合。若真实实施证明无法可靠关联本 Picker 的 portal，前端应向主理人报告精确失败接缝与最小补丁，而不是向用户重新提问产品方向。本轮没有批准任何 CustomModal/CustomSelect 扩 scope，也没有必要拟造可选 props；不得先改通用组件再登记。

## 四、已有白名单收口，不新增值、状态或营销文案

| 区域 | 固定中文 / 英文 | 显隐与红线 |
|---|---|---|
| 通用入口 | `添加素材` / `Add assets` | 有真实上游资格即显示，不按四种输出猜能力 |
| 壳、关闭 | `素材` / `Assets`；`关闭` / `Close` | 添加、替换同标题，不加类型、角色或用途后缀 |
| 来源 | `画布` / `Canvas`；`本地` / `Local` | 不拼候选数、草稿数、选中数 |
| 搜索/类型 | `搜索素材…` / `Search assets…`；`类型` / `Type`；选项首项 `全部` / `All` | 类型值只沿原表和实际qualified候选；单类型隐藏 |
| 候选 | 真实名称、文本摘录/真实缩略图、必要客观元数据、批准Check | 不挂重复类型标签，不以nodeId补标题/副标题；正常不挂就绪状态 |
| 已使用身份 | `已使用` / `In use` | 仅实际active source/output/role身份；纯供给或inactive不误锁；每条单处，不叠加类型胶囊 |
| 确认 | `取消` / `Cancel`；`添加` / `Add`；替换会话 `替换` / `Replace` | 按整组accepts确认，不只因selectedCount>0；缺必需项可继续装填，不等于可生成；不显示“使用N项”或“添加(N)” |
| 预览动作 | `替换` / `Replace`；`停用` / `Disable`；`使用` / `Use` | `使用`只用于恢复inactive，不用于Picker添加；保留绑定/边/位置 |
| 卡状态 | `不兼容` / `Incompatible`、`格式未知` / `Unknown format`、`等待中` / `Waiting`、`不可用` / `Unavailable`、`未使用` / `Not in use` | 每卡主因择一，原批准状态集合不变，不叠加Ready、数量或新Badge |
| 编辑器及原因 | 原[中文§3.2–3.4](unified-upstream-input-2848.md#L162-L209)、[英文§四/六](unified-upstream-input-2848-copy-en.md#L100-L193) | 只按真实composition/localRole，single_body正文不显示要求占位或旧二选一错误；不追加旧max/min模板 |

内部selectedCount可用于空选择检查，CSS class可继续复用，不等于授权把数值渲染为文案。`picker.use`是否复用或另加精确literal key由实际消费点决定，不跨位置把预览Use改成Add。业务真实文件名包含数字不属于禁用计数；必要大小、格式、时长也不属于营销标签。

## 五、旧静态断言：哪些真实行为变，哪些无需改

以下均已读取原测试，不把其标题当做实际断言。不授权skip、删测试、弱化负例，也不为了regex创建另一条UI/消费逻辑。本轮只有决策文档，没有测试写入授权执行。

| 原证据 | 真实检查与产品关系 | V1处理口径 |
|---|---|---|
| [Modal test:21–27](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs#L21-L27)“Footer 使用N项” | 实际只匹配CustomModal、Tab keys、`picker.use`、`selectedCount === 0`；没有断言渲染数量 | 可保留复用壳、来源及空选择保护；产品真正变化是Add/Replace逐字无数值且整组accepts判定。保留key不等于保留Use或N项；若为纯净接线必须换key/判定结构，只针对实际冲突断言列精确维护请求，不整段重写 |
| [Modal test:125–132](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs#L125-L132)“已添加样式” | 检查CSS中`.wf-picker-added-badge`存在，不验证渲染，不要求类型tag或Tab计数 | 无需删除类以证明极简；可承载唯一批准In use状态，实际语义由binding身份决定。不增加额外徽章、对号+重复状态条 |
| [Modal test:163–168](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs#L163-L168) title契约 | 保护title声明/解构及`title ||`源码结构，原目的是防未定义变量；不要求替换专用标题 | 可保留可选prop与安全解构，本票传入/默认只用Assets，不引入替换标题。若实现选择删掉prop或改结构，需精确断言级维护，不把产品白名单当测试改写许可 |
| [Modal test:134–161](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs#L134-L161) | 无分割线、Picker媒体contain、比例分档、复用PreviewThumb | 保持。文本分支可在CanvasResourcePane展示FileText/真实摘录，保留原媒体PreviewThumb；不扩写PreviewThumb、不改成well的cover |
| [CanvasResourcePane:178–180、228–240](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/CanvasResourcePane.tsx#L178-L180) | 现有重复type tag及nodeId/type副行；以上Modal suite没有要求它们存在 | 删除本票候选重复类型可见部分和ID回退是遵循已批准白名单，不是真正改变任何上述regex期望 |
| [ResourcePickerModal:129–154、166–184](../../plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx#L129-L154) | 当前确认拼数量、替换标题fallback、画布Tab计数；suite未检查数值显示 | 可见行为确实从旧数量/替换标题变为原批准简洁文案，但不需为了移除显示而普遍更改测试；补真实DOM/键盘行为证据，不以regex绿签收 |
| [policy test:56–83](../../plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs#L56-L83) | 实际排除text，只期待media；与qualified upstream text新路径冲突 | 新路径必须准入ready selected text，不凭node_field全开；若旧默认调用确属仍用的legacy供给用途可保持其负例并加strict-context正例。若不再合理保留，主理人精确授权该case替换；不为保绿刻意维持双能力真源 |
| [policy test:98–122、182–200](../../plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs#L98-L122) | 实际接受部分项目并返回rejected、已连边不接受；新显式消费确认要求全组原子与供给/消费区分 | 新Picker必须拒绝整组已知冲突且图不变；已供给未消费仍可合法绑定。旧纯供给调用只有真实保留用途才可沿结构验证；若scope内改动造成旧断言冲突，由主理人列精确case维护，不自动扩大已授权legacy名单 |
| [textSlotAcceptance:265–322](../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs#L265-L322) TC-T01-05/TC-T02-01/TC-T01-07 | 当前已明确批准的替换子集 | 已证实upstream text映射有入口，local-only/source-only仍无假入口；当前用户显式方式受保护，不能凭残留chat猜迁移。授权仅这三case，不包含TC-T02-02等其他源码结构期望 |

指定TTS layout legacy cases仍按原[计划:111–113](../plans/unified-upstream-input-2848.md#L111-L113)的精确授权与真实能力判定处理，本文不改backend/shared测试、不扩到materialSpeechSubmission或其他TTS case。单正文upstream→local已是V1批准行为，不临时保留旧二选一规则。

主理人区分“只有标题过时”“无害的class/key保留”“会真红的结构或行为断言”。仅在实际冲突且无法合理保留时发精确断言级维护范围，前端保留原红证据和严格替代覆盖。不得把这些维护问题再问成用户产品选择，也不得宣称本PM文件自动批准所有旧测试重写。

## 六、实施接收与终验边界

前端依次接入本票冻结的backend Interface、现有Picker局部布局/a11y、批准中英文literal、统一card/preview/use，按原批准V1 seams验证。无需等待新的用户宽度或组件架构拍板；本文件不声称backend已稳定，主理人仍负责最终接口交接和运行派单。

实际验收需证明：设计默认宽度的computed geometry，桌面和紧凑窗口无溢出/遮挡，中英文长名称与原因可读，双主题关键对比度，原44×44 well，标题/来源/确认无计数或重复type，网格与列表一致，四类新建空节点的真实选材/预览/停用/使用。键盘覆盖初始焦点、Tab双向循环、来源切换、筛选portal选择与分层Esc、系统文件选择取消、每种关闭出口和入口消失fallback，背景不能意外操作；reduced-motion下不妨碍交互。

未完成/未知：没有本轮真实browser/PNG、对比度测量、焦点实测、loaded-code身份、提交capture或实现review；没有证明TXT/Markdown解析或任何document链已完成。上述运行事实由实施与QA补证，不是开放产品取舍。任何通用组件新增props的必要性仅在局部方案被真实证据否定后才讨论，本轮无scope amendment。

未覆盖：SOURCE/tests/fixtures/shared/backend写入、测试/构建、运行环境、依赖安装、新服务、应用重启、付费调用、staging/commit/push/PR/合入/Dev/生产。PM实现终验及用户演示确认保持独立，不能以本文件accepted或preflight签实现PASS。

## 七、证据身份、核查与信心

实际读取：本文所有链接的产品、设计、计划、组件、CSS及测试原文；另完整读取[前端预检](../../.agent-reports/unified-upstream-input/v1-frontend-preflight.md)、[UI设计合同](../contracts/ui-design-guidelines.md)、[文案合同](../contracts/ui-copywriting-and-naming-standards.md)与[文档治理合同](../contracts/docs-governance-standard.md)。未读取AGENTS/agent/CLAUDE局部指令文件。没有调用其他专家或创建teammate。

只读命令在任务树显式workdir执行：`pwd`、`git status --short`（开场旧调用未带-C但workdir正确，无写入）、后续`git -C <任务树> rev-parse HEAD`，工具exit均0；UI skill更新检查无输出且同调用exit0。工作树已dirty，shared/host/catalog及其测试为并行后端工作，产品/计划/spec和指定新测试也已存在，全部保留。文档复核结果与实际未运行项在交付中单独报告，不将状态读取当业务验证。

文档检查：`pnpm doc:lint` 的运行器在执行lint前触发依赖检查/安装流程，因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止，exit1；未放开CI/purge、未继续安装。改用该运行器错误中已明确的Node可执行文件直接执行已读只用fs/path的 `scripts/doc-lint.mjs`，全仓结果exit1，1277错误/52警告，不宣称全仓通过；完整诊断检索没有命中本文。另只读校验本文29个相对链接目标、末尾换行和尾随空白，exit0、无缺失/尾随空白；这只证明文档路径与格式，不是UI验收。收尾canvas源码diff为空；已有其他dirty路径保留。

对默认宽度、局部壳访问路径、中英文白名单、已读静态断言边界信心高。局部portal/焦点管理可实施为源码支持的工程判断，不是实测证明；最弱点是运行层尚未验证。可执行下一步：主理人把本文与最终backend接口交给前端，沿[已有V1 UI路径](../plans/unified-upstream-input-2848-plan-notes.md#L174)实施，不改通用组件，真实行为证据完成后另请求PM终验。
