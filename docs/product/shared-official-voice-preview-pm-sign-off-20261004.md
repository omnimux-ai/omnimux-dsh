---
title: "官方音色共享试听限定产品签收"
id: "evidence-shared-official-voice-preview-pm-sign-off-20261004"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-04"
---

# #3058 官方音色共享试听：产品终验签收

日期：2026-10-04
签收人：产品经理 · 许清楚（Xu）
工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-official-voice-preview-issue-3058`
基线 HEAD：`0deb18ee3f6e6f0448db874d05872238a273c73e`
证据绑定 runId：`2026-10-04T04-19-14.961Z-87f8826e`

## Conclusion：唯一产品判定

**PM_SIGN_OFF: PASS_SCOPED。**

批准签收的是第二轮新真实证据覆盖的界面：当前正式目录的画布音色弹窗，light/dark × 1280×800、1920×929、390×844；已完成的全表、单条、搜索空态、真实长名称、已选与试听隔离、四维菜单及关闭/焦点路径；以及正式代表音色资产卡与已验证官方音色原生音频详情的白名单表现。当前核查源码与这些证据一致，没有未授权文案、营销徽章、重复组标题或新增播放器。

这不是全量 `PM_SIGN_OFF: PASS`，不是整票、独立 OCR、所有音色、所有网络故障或所有输入法/缩放环境的通过声明。原首验三项 UI 缺陷在本次实际目录范围可结算，不重写历史 FAIL。

**产品裁定：操作系统中文 IME、显式无选择空值、字体缩放导致实际换行增高，均保留未覆盖，不阻止本次限定界面的签收。** 当前目录默认有选中值，没有无损可达的空选择旅程；不清参数、不注入 store、不改 fixture 伪造「未选择」。OS IME 未取得有效原生完成证据，不能以 CDP 的 compositionend trusted=false 声称通过。本次局部几何/颜色修改没有替换输入节点或新增组合输入处理，已有真实连续输入、焦点及坐标稳定证据支持本 scope；这项判断是产品边界决策，不是完整 IME 验证。

本轮按用户当前指令直接作产品验收判断，不新增一次用户技术审批、不要求用户选择 token 或批准中间验收。签收不授权 Git merge、发布或应用重启。并发通用 Select 长内容宽度、普通卡片保存悬停修复及 builder 工程审查仍独立收口，不以它们尚未完成将已证实的 voice UI 改写为 FAIL。

## Evidence：已读真源与实际复核

### 1. 完整读取及权威边界

完整读取了 [局部四件套附录](<voice-picker-ui-polish-3058.md>) 全部 152 行、[共享原规格](<shared-official-voice-preview-ui.md>) 全部 357 行（含原逐字字典 §3.3 与颜色附录 T）、[设计规范](<../../design.md>) 全部 293 行，以及 [第二轮独立 QA 报告](<../../.agent-reports/shared-official-voice-preview/acceptance-round2-20261004.md>) 全部 90 行。

另读取当前 [VoicePickerDialog](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx>)、[CustomModal](<../../plugins/omnimux-workflow/src/canvas/ui/CustomModal.tsx>)、[CustomSelect](<../../plugins/omnimux-workflow/src/canvas/ui/CustomSelect.tsx>)、[音色 CSS 区](<../../plugins/omnimux-workflow/src/canvas/theme/components.css#L8460-L8791>)、[展示字段派生](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/voicePickerModel.ts#L185-L200>)、[资产卡](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx#L217-L399>)、[资产详情](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx>)、[详情转换](<../../plugins/omnimux-assets/src/client/cloud-preview.js>) 及 [资产 locale](<../../plugins/omnimux-assets/src/client/locales.js#L170-L172>) 的中英文核定项。

本报告是签收记录，不新建第五套规格。PRD、Prototype、Spec、Plan 继续以原共享规格和局部四件套附录为真源；局部附录在画布范围取代旧 540px/只改颜色/保留空槽限制，资产库、共享试听及选择契约不被改写。旧文档的 NOT_RUN 是当时状态，由本文记录本次限定终验结果，不伪称全部 required 已完成。

### 2. 本轮 display_file 人眼复检

以下 11 张均为第二轮真实新 PNG，实际用 display_file 打开，覆盖全部六个主题/视口组合及资产详情。不是旧 round6 图片、合成原型或主页冒烟。完整 66 张文件 SHA 与 bundle/runId 绑定见 [截图清单](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/screenshot-manifest.json>)；本轮逐文件 SHA 校验 66/66 一致。工具附件规范化预览 SHA 不作为原 PNG 的 SHA。

| 实际 PNG | 人眼观察 | 签收边界 |
|---|---|---|
| [light 1280 单条](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/light-1280x800-single.png>) | 弹窗水平居中；搜索、四筛选、Charlie 2.0 一行与当前林潇 2.0 底栏衔接紧凑；没有少结果大空洞 | 浅色单条视觉 |
| [dark 1280 单条](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-1280x800-single.png>) | 原生暗表面连续，名称与底栏 Kevin McCallister 2.0 清晰；不出现浅色控件孤岛 | 暗色单条视觉 |
| [light 390 菜单](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/light-390x844-final-menu.png>) | 场景菜单不透明，右边未截出视口；「全部」及客观选项原文；选中 Charlie 行与 Check 明确 | 实际四维菜单范围；筛选条横向滚动后左侧维度部分退到可视区外属批准行为，不是永久删除 |
| [dark 390 菜单](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-390x844-final-menu.png>) | 菜单与弹窗同层级暗表面，文字可读，右边未越界 | 实际 140px 菜单，不替代通用长内容反例 |
| [light 1920 全表末段](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/light-1920x929-full-last.png>) | 搜索/筛选/底栏保留，列表末段可读；无试听资格的行没有假按钮空槽 | 已滚动至末段；结果区边界可显示半行，这是连续滚动，不是名称永久裁切 |
| [dark 1920 全表末段](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-1920x929-full-last.png>) | 同一布局与字阶，底栏主值明显，原始名称与场景无叠字 | 暗色全目录滚动表现 |
| [light 390 真实长名](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/light-390x844-final-long-1.png>) | `かずね（和音）/JavierorÁlvaro` 完整可读，无尾截；无试听键行直接展示名称；当前值仍 Charlie 2.0 | 当前实际字体及目录长度，不假造换行样本 |
| [dark 1280 独立试听](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-1280x800-playing-independent.png>) | Charlie 2.0 仅播放键显示暂停/焦点反馈，整行无选中 Check；底栏仍 Kevin McCallister 2.0 | 试听与选中视觉语义隔离 |
| [light 1280 搜索空态](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/light-1280x800-empty.png>) | 只有「未找到匹配音色」「清除筛选」，反馈区短且平衡，底栏原值未改；无插画或新提示 | 搜索无结果，不等同无选择空值 |
| [正式资产卡](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/formal/assets-voiceover-grid.png>) | 林潇 2.0 原名称与客观描述，既有音频卡/播放 SVG；官方卡不出现保存或会话动作 | 公共搜索代表卡；不重验整资产中心页头 |
| [正式原生详情起播](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/formal/assets-detail-native-playing.png>) | 林潇 2.0 标题、原生音频 controls、内建关闭；无格式徽章、路径、保存/加入或空 footer | 既有详情媒体舞台留白属于复用外壳，局部附录不要求把资产详情改成 480px 音色选择器；系统音频菜单属白名单原生 controls |

视觉方向保持既有原生中性表面、系统字阶与紧凑工具区。搜索独立一行、四维独立一行让输入目标稳定；完整名称保留版本，当前名称作为底栏主信息，播放状态不抢占选择状态。这些是原附录的批准取舍，不新增装饰或营销层级。

### 3. 实证复核，不以自检或 exit0 代替验收

[实际初采账本](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/ui-initial.json>)、[紧凑补采账本](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/ui-compact.json>)、[初采坐标摘要](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/ui-initial-summary.json>) 与 [正式媒体摘要](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/formal-summary.json>) 已读取/按字段提取交叉核对；原初采不足样本及 trusted=false 未改成绿。

| 验收点 | 第二轮实际证据 | 产品结算 |
|---|---|---|
| FE-01 位置/漂移 | 全部→单条→空态→全部，六配置输入 x/y 漂移均 0px；1280 top120/center640，1920 top139.34375/center960，390 top126.59375/center195 | 在 ≤1px 漂移、15vh 顶锚、水平居中范围通过；外盒 482/342px 含边框，不误读为 CSS width 失败 |
| 内容高度 | 全表结果区 320px；单条 48px，末行至 body 底16px；空态110px；总高 ≤70vh | 原单条空洞已消除，搜索/筛选不随结果重居中 |
| 完整目录/长名 | 509 行真实 wheel 首末可达，scrollHeight25448；实际两条最长名 Range 边界、邻行 overlap/escaped 均空 | 当前字体下实际目录通过；不宣称缩放换行增高场景已测 |
| FE-02 关闭与焦点 | 菜单 Escape 只关菜单，第二次关模态；X、行 Enter/Space 后 activeElement 为 wf-voice-trigger，trigger 存在，selectedNodes=1 | 覆盖这些实际关闭路径；不把未取证的所有模态消费者算通过 |
| 试听/选择隔离 | Enter/Space 真实起播，参数/底栏/Check 未改；只按钮 playing；行本体才回写 voice_type 并关闭 | 产品语义符合白名单；「暂停试听」文案不扩张为续播承诺，停止仍归零 |
| FE-03 窄菜单 | 六配置实际四维菜单均140px；390右边分别185/281/377/382，最大bottom544.59375 | 本弹窗实际 facets 范围通过；通用200px/长内容 finding 独立保留 |
| 详情原生输入 | 同 native id6，focus+trusted Space/targetAudio=true；play、playing、timeupdate；paused=false/currentTime0.549411 | 原生操作起播已履行；PNG自身不是音频进度证明；本轮PM不宣称另做听感/音质或版本身份验证 |
| 生命周期 | 正式详情关闭1564ms/16、本地卸载1562ms/16、画布关闭1564ms/16均 stopped=true；N1负窗1562ms/16真实持续推进、restore1558ms/16停止；UI补窗≥2993ms/16 | 采纳正式媒体联合门已覆盖路径，不以瞬时 paused 或纯 mock 代替持续停止 |

正式外层仍为一次完整旅程测试：tests1/pass1/fail0/skip0、REAL_EXIT=0；实际记录 A34+B22+N1 6=62，不是62个 node:test。媒体、原始窗口与 UI 证据分别成立，均不是 PM 全覆盖声明。

真实 computed 背景经逐祖先 alpha 合成及 WCAG sRGB 复算，以下实测来自最终有效六配置，正文/关键文字均 ≥4.5:1：

| 主题/视口 | 最小对比度 |
|---|---:|
| light 1280×800 | 5.37149:1 |
| light 1920×929 | 5.20790:1 |
| light 390×844 | 4.83521:1 |
| dark 1280×800 | 11.28650:1 |
| dark 1920×929 | 8.96907:1 |
| dark 390×844 | 7.32676:1 |

### 4. 当前源码白名单与逐字文案

| 区域 | 当前源码核对 | 结论 |
|---|---|---|
| 标题/搜索 | `选择音色`；`搜索音色...`；aria `搜索音色`；原 Search、内建 X | 与局部字典相同；内建关闭 aria `Close` 属原组件保留，不另造中文关闭文案 |
| 四维/菜单 | `语言`、`口音`、`性别`、`场景`；首项 `全部`；性别/其余 facets 原字段；未传 icon/badge/subtitle | 与白名单相同，不因通用 CustomSelect 支持 badge 就认定本音色菜单渲染了徽章 |
| 音色行 | resolveVoiceLabel 保留官方全名；voiceTagLine 仅首个真实 category；无 marketing tags/热门徽章 | 不删2.0、不造简称、不插入组标题；无预览资格不输出按钮 |
| 试听/选中 | 原 Play/Pause，`试听`/`暂停试听` 与原动态 aria；isSelected 仅比较 value，Check 不跟 playingVoice | 状态隔离符合原产品契约 |
| 空态/底栏 | `未找到匹配音色`、条件 `清除筛选`；AudioLines、`当前音色`、原名称、兜底 `未选择` | 已覆盖搜索空态/有值底栏100%相同；`未选择` 仅静态字符串核对，未签真实空value表现 |
| 失败中英文 | `试听暂不可用，请稍后重试。`；`Preview is temporarily unavailable. Try again later.` | 当前locale及canvas字符串相同；未扩大签故障/断网全矩阵 |
| 官方资产卡/详情 | 原名称、描述、试听/停止SVG；转换 extension/pathInfo为空；purpose门阻止动作簇与footer渲染 | 实际代表卡/详情符合原字典，无保存、会话、格式徽章或URL文案；普通卡保存修复不由此签收 |

上述签收区域白名单一致率100%，新增未授权营销Badge/副标题/Emoji/重复组标题0。这里的100%限列明且实际覆盖的 UI，不包括全部应用或未覆盖状态。

### 5. 截图源 SHA、当前公开 diff 与复用限制

截图使用 Canvas bundle SHA `e52c86d52428fb7a7c8c76538d1dde04bbeb82636c9d18e3f97b4d46038cb546`、Assets bundle SHA `baf0ac081a39dc262a8dda9b929238fe9be6e2c3589d5ca11b947be8854264bc`、官方主题 CSS SHA `aea270d0715a605274deb91794968516a9e6e7b79ae083c8ac00461091199908`。见 [source-sha](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/source-sha.json>) 与 [formal源清单](<../evidence/shared-official-voice-preview/acceptance-round2-20261004/formal/source-before.json>)。

本轮在 2026-10-04T04:43:06.504Z 独立复算当前文件：formal清单2696项中2694个实际磁盘输入均与采图 SHA 相同，漂移0；另2项 `assets:<stdin>`/`canvas:<stdin>` 为虚拟入口，本轮没有其磁盘文件，不谎称本轮重新校验这2项。QA原轮的2696输入起止零漂移仍是其独立证据。66张实际PNG原文件SHA全部吻合截图清单。

关键源快照与当前值在该时点相同：

| 文件 | 采图/当前全文件 SHA-256 |
|---|---|
| [VoicePickerDialog](<../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/VoicePickerDialog.tsx>) | `bad943e22efec4b42296a79540fde8fdec7fd2b9b786829fd5ddd4eeb5a11c85` |
| [音色CSS所在文件](<../../plugins/omnimux-workflow/src/canvas/theme/components.css>) | `dc734e5769c3c3a0e7705233e7839b062d510442730980e1e27e9107e34ce2be` |
| [CustomModal](<../../plugins/omnimux-workflow/src/canvas/ui/CustomModal.tsx>) | `0c4928b40a11bf859ba00b0b26a59fa91cc7b72f472034462465ab6641124c98` |
| [CustomSelect](<../../plugins/omnimux-workflow/src/canvas/ui/CustomSelect.tsx>) | `0351cbdd8829b1d9b957e67c3a60a4977dc452d907e11f2c18d231a733aca305` |
| [AssetPreviewModal](<../../plugins/omnimux-assets/src/client/AssetPreviewModal.jsx>) | `e2e998d0c72d6150c56f29e104c96975fd55a224b267756a2d298949d6d466ba` |
| [CloudAssetsView](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx>) | `639fb1e19bc20a3513932a981883d6100274edc2ade2acb810f5c6ad5635db79` |
| [locale](<../../plugins/omnimux-assets/src/client/locales.js>) | `81e343cfa096ce0aa1ccb89a519bfb00eb757ccb698ab9008da1b4eb53c0ffd2` |
| [design](<../../design.md>) | `ce1bdf283a12c9831497835757e068660255b5a132308ba7e0b94da89cd7ae86` |
| [局部四件套](<voice-picker-ui-polish-3058.md>) | `025f17db603eeec75d150a40f3103e912dd0508a223f49847f1962dac007109c` |

当前公开 Git diff 已只读核对 CustomSelect、CloudAssetsView、locale、cloud-preview：相对 HEAD 的两条新增失败提示正是原字典批准项，并非字典外追加；相对第二轮截图源快照，本次实际已核查文件没有任何新增 UI 字典变化。不能把相对HEAD已有的功能实现diff称为零改动，也不把本报告落盘导致的文档变动当生产源变更。

**并发 lane 限制：**当前通用 Select 按实际内容宽度钳位与普通卡片保存悬停修复尚未在本核查时点形成新的已验收源码证据。本文先签当前快照限定 review，不能宣称未来最终 sourceSHA 已复用。两 lane 结束后，主理人须补存最终当前全文件SHA及相对本采图快照的公开diff复用说明，证明音色布局/逐字字典不变，且工程/QA已结算具体长内容与保存hover反例；涉及本已签音色菜单的实际几何变更则补该场景真实检查。仅有实施者单测绿不够，不重新开产品规格，不要求用户批准技术token，也不把本签收泛化为通用控件全量PASS。

### 5.1 收尾并发源码变化，限定 review 不改判 FAIL

2026-10-04T04:46:07.025Z 收尾再次读盘，发现两 lane 已开始落盘，因此上表的「当前」明确仅指 04:43:06.504Z 复算时点，不能当最终源码零漂移。新 [CustomSelect](<../../plugins/omnimux-workflow/src/canvas/ui/CustomSelect.tsx>) SHA 为 `cd4fec8415b179a0df1e4043063186cf92ae4265826db1f21603f76a71f786d1`；新 [CloudAssetsView](<../../plugins/omnimux-assets/src/client/CloudAssetsView.jsx>) SHA 为 `a828ead0706f7b1b364119f92fd1c9bd338cc492774dd7e01afacb7fa5503d72`。音色CSS仍 `dc734e5769c3c3a0e7705233e7839b062d510442730980e1e27e9107e34ce2be`。

本轮重新读取两源及公开Git diff：Select 新增按 menuRef 实际宽测量钳位、绘制前 useLayoutEffect 定位与 `Math.min(300, viewport-16)` 上限；CloudAssetsView 将普通保存/会话动作簇从 mousedown/Enter/Space 接管标记中排除。两处均未新增或改写可见字典、SVG、名称来源或 voice 弹窗布局/CSS。官方试听卡本来无保存/会话簇，该新增排除不新增其UI；实际140px菜单按测量定位与原估宽相同仅为源码推断，不冒充新bundle已经浏览器实测。

**签收维持 PM_SIGN_OFF:PASS_SCOPED，限已展示第二轮快照及当前无字典增改的源码审阅。** 两处新SHA尚无本轮PM新渲染证据，旧PNG仍绑定原bundle；当前文件hash变化已显式保留，不能再称全2694文件当前零漂移。主理人后续补最终冻结SHA、完整相对采图源码diff/复用证据，以及新菜单/普通卡工程回归结算；本轮不自签两lane完成或独立OCR通过，不扩写为全量PASS，不新增用户审批。

## Unknowns：范围裁定与保留项

| 未覆盖 | 产品裁定 | 对本次 scope 的影响 |
|---|---|---|
| 操作系统硬件中文IME | 未验证；CDP trusted=false完成事件不能替代OS IME。输入节点、原onChange与组合处理未被本局部样式替换；已测连续输入、节点/焦点与坐标稳定 | 不阻止实际目录视觉/已证实交互的限定签收；完整输入法覆盖仍未知 |
| 显式无选择空value | 原spec确实要求该场景，本次默认广告解说2.0有值且没有无损构造路径。兜底字符串静态符合，真实空value布局不签；不把搜索空态冒充未选择 | 从本次scope明确排除，不删除原要求，不写已测；不强迫清生产参数来凑覆盖 |
| 字体缩放导致真实长名多行增高 | 已测实际目录最长两条在当前字体下完整可读，实际行高48px；未观察缩放后的增高 | 不阻止当前字体实际名录签收；不声称所有缩放环境通过 |
| 通用Select长内容宽度 | [独立审查](<../../.agent-reports/shared-official-voice-preview/final-review-closure-20261004.md#L21-L29>) 的140px最小宽/200px实际宽反例保留；本音色实际menus140px不能撤销它 | 工程Frontend独立收口；不由PM篡改为通过，不扩大当前签收 |
| 普通卡保存悬停 | 本次已签官方试听卡不渲染该按钮，普通卡修复仍在独立lane | 不签普通卡行为，也不阻止官方preview-only实际界面 |
| builder生成目录冲突/独立OCR | 不是本PM视觉和字典审查范围，不以QA UI绿撤销CLI意见 | 整票工程门仍由主理人协调 |
| 故障/断网全矩阵、124全部音色实际播放、音质/版本身份 | 本轮只采纳正式代表路径与已有核定文案，不承诺全量持续可播 | 不扩为整票或全音色承诺；124是资格数，不是实际播放数 |

## Not covered：本轮操作边界

只进行了只读规格/源码/证据检查、display_file真实PNG复检、SHA与公开diff校核，并新增本签收文档。未改CSS、业务源码、runner、design、目录数据、测试；未构建、启动server、创建/切换/finish浏览器空间、reload已关闭端口、操作App/Dev、调用TTS/R2/费用、下载样音另存、Git add/commit/push/merge或发布。当前独立技术lane修改不归本轮产出。

## Confidence 与交付路由

本scope信心高：新真实PNG、实际DOM/Range/computed、原生媒体与完整停止窗相互印证，当前实际磁盘渲染输入与截图快照相同；源码白名单逐项核对而非根据测试摘要自签。最弱处是本scope外的OS IME、空value与字体缩放未覆盖，以及并发lane最终新SHA尚需补存复用证据。

**终验完成，PM_SIGN_OFF: PASS_SCOPED。** 主理人可直接据本文采用已签范围，继续收集独立lane最终SHA/diff与工程关闭证据。本scope没有新的用户产品歧义，不回抛用户作中间技术验收。全量PASS、整票放行、合入与部署均未由本文宣布或执行。
