# #3058 第二轮真实验收 · 2026-10-04

## Conclusion

**PASS_SCOPED：正式媒体联合门及实际目录音色弹窗的本轮六配置 UI 回归通过。QA 路由 NoOne / Pass（限下述范围）；不是整票、OCR closure 或 PM_SIGN_OFF。**

首轮 FE-01 顶部错轴/输入漂移、FE-02 关闭失选/焦点丢失、FE-03 本弹窗四维菜单窄屏外溢均在新 bundle 真实回归通过。实际现存目录的两条最长名称无裁切、邻行无 overlap。UI 人眼复检已执行，没有以 paper green 代替截图。

**独立 OCR 仍有未由本轮结算的 finding：CustomSelect 实际内容宽大于最小宽的通用边界 → Frontend。** 本弹窗 actual menus 均为 140px，实测 within viewport，不据此撤销 OCR 指出的其他内容宽情况。builder finding 也不由本轮浏览器结算。PM 可直接使用本文列出的新 PNG 终验；保留唯一 space2/p1 未 finish。

## Evidence

### 真源、命令与新 bundle

实际读取首轮 acceptance-20261004、ui-position-focus-fixes、builder-layout-fixes、design.md、PM polish 附录 §3/§4 与原共享规格 §3.3，以及真实 runner、VoicePickerDialog 和 CSS。业务源码/runner/数据/设计/门禁未修改。仅新增 QA 取证脚本、报告及证据。

任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-official-voice-preview-issue-3058`。

正式命令：`QA_3058_SOURCE_FROZEN=1 QA_3058_SPACE_ID=2 QA_3058_THEME=light QA_3058_THEME_BUNDLE_FILE='/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js' node --test tests/e2e/official-voice-preview.browser.mjs`。日志直接重定向后保存实际退出码，未用管道尾部 exit 冒充。

正式只跑一次：**REAL_EXIT=0；tests1/pass1/fail0/skipped0**，duration 86378.96675ms。实际 runId `2026-10-04T04-19-14.961Z-87f8826e`，dynamic port **49878**，唯一 same2/p1。fresh Canvas bundle SHA `e52c86d52428fb7a7c8c76538d1dde04bbeb82636c9d18e3f97b4d46038cb546`，与首轮不同。资产 bundle SHA `baf0ac081a39dc262a8dda9b929238fe9be6e2c3589d5ca11b947be8854264bc`；官方主题 CSS SHA `aea270d0715a605274deb91794968516a9e6e7b79ae083c8ac00461091199908`。

正式2696输入 before/after漂移0；UI结束对同2696输入再校验漂移0。关键源、数据、规格指纹在 `source-sha.json`。官方主题仅通过 html.dataset.dsThemeSource / body[data-ds-dark-theme] 公开契约切 light/dark，原官方 CSS 不变，无 colorsfake、token 重写或产品 JS 主题补丁。

### 正式媒体 AND 联合门（actual counts）

本次实际读取 **资产34/34、画布22/22、N1 6/6，共62/62记录断言**；不是61，也不是复制旧62，更不是62个 node:test。外层仍为一个完整旅程，A/B/details/local-unmount/N1 联合 AND。

双端林潇2.0、阳光阿辰、Charlie2.0 同 official primary URL 原生起播、时间推进与切换单播；未验证三个代表仍可选且无播放键；试听不写生成 voice URL 或参数。

详情 DOM native audio **实际 id6**，起播前 paused=true/currentTime0；focus+trusted Space（targetAudio=true）后同id原生 play/playing/timeupdate，paused=false/currentTime **0.549411**。没有 JS 正向 play、等新ID或模拟事件。

打开详情停止卡片：1581ms/16真实样本；关闭详情停止并归零：1564ms/16；切本地卸载：1562ms/16；画布播放中关闭：1564ms/16。全部 stopped=true/reasons=[]。N1完整负窗 **1562ms**，stopped=false，16样本 currentTime从0.014516递增至1.575406；restore完整窗1558ms/16，stopped=true。具体原账本在 formal/browser-report.json，摘要在 formal-summary.json。

nonGetRequests=[]，无TTS、生成、R2、样音下载另存或费用调用。124 verified/385未验证未改变；124仍只是元数据资格数，不声称124全部真实播放通过。

### UI 六配置：light/dark × 1280×800、1920×929、390×844

PM原句：§3.1「视口顶部15vh；水平居中」、§3.2「输入框top/left偏移各不超过1 CSS px」。实际全部→单条→空态→全部，**所有六配置 x/y漂移均0px**。1280 modal x399/y120/w482；1920 x719/y139.34375/w482；390 x24/y126.59375/w342。顶锚误差≤0.00625px、水平中心误差0。宽度记录为实际含2px边框外盒，未把外盒当CSS width失败。

全目录509行：真实 wheel 首末可达，完整列表clientHeight320、scrollHeight25448；结果区滚动，搜索/筛选与footer保持可用。全部509行盒子与文字实际测量，无相邻重叠/文字逃出行框；flexShrink实读0。单条list48px，最后行到body底16px；空态110px。所有modal总高≤70vh。

两条真实最长名称：`かずね（和音）/JavierorÁlvaro`、`Kevin McCallister 2.0`，各桌面/紧凑实际搜索、原文字Range边界、行/场景边界均可读无裁切或overlap，footer完整值在modal内。当前字体下自然行高48px，**没有强造长名/缩小容器/改CSS冒充自然换行**；字体缩放到实际换行增高的极端情形未签全量。

关闭路径：各配置菜单Escape只关菜单、第二Escape关modal；X关闭与行本体Enter/Space选择后，actual activeElement均wf-voice-trigger、trigger存在、Canvas selectedNodes=1。Tab依次语言/口音/性别/场景，ShiftTab回性别。试听Enter/Space真实起播，当前params/footer/Check不改变，仅按钮有playing状态；行本体才写voice_type并关闭。

停止补窗每配置最终16真实样本、跨度至少2993ms，paused=true/currentTime0，native readyState仅实读（最终已释放元素实际0），不是填常数。桌面补窗见 ui-supplement-first.json + dark-stop-and-final.json；紧凑见ui-compact.json。

390实际四维portal菜单（两主题一致）：语言x45/right185，口音x141/right281，性别x237/right377，场景x242/right382；实宽140px、top290.59375、最大bottom544.59375，全部within390×844。菜单不透明且全部项原文；四维可横向访问且不折行。**通用长内容菜单边界的OCR意见保留，actual140px不替代200px反例。**

对比度逐祖先alpha合成computed真实背景、WCAG sRGB复算，六配置正文/当前值/输入/筛选/空态最小值：light1280 5.37149、light1920 5.20790、light390 **4.83521**；dark1280 11.28650、dark1920 8.96907、dark390 **7.32676**，均≥4.5。原32px控件与13/18名称、12/16场景保留。

白名单审计：实际组件渲染区/最后snapshot与PM逐字表一致；标题、搜索、四维、全部、原音色名、真实场景、试听/暂停试听、空态/清除、当前音色原样。新增营销Badge/主观副标题/装饰Emoji/重复组标题 **0**。design.md存在，限定实际UI几何/主题/文案合规；不自签通用Select所有情况合规。

### QA 取证纠错，原失败不抹掉

初始采样99 checks：94通过、5未满足取证门，另2窄屏入口错误。四个停止窗在background browser timer节流下只取8–12样本，原样本均paused/zero但不足完整窗，所以不报通过；一次CDP IME组合开始/input trusted=true且焦点保留，compositionend trusted=false，**真实OS中文IME仍未知**。原始 ui-initial.json/log全部保留。

窄屏resize后既有节点失去可见入口；第一次补采误把wheel送到Canvas，viewport平移至y60245，DOM node0但params仍在，不是数据删除。真实ControlOrMeta+1适配视角恢复节点、重新真实选中再开弹窗；无reload/goto或store注入。一次ControlOrMeta+z恢复测试选中值为Charlie，如实记录，未写生产数据。第二补采两主题窄态43/43/error0；完整停止窗补齐，原不足样本断言未改绿。

有效UI结论取初始94已证实项 + 最终紧凑43/43 + 四桌面补停完整窗；不把脚本exit0等同UI PASS，不称自动化所有原始checks全绿。PM七场景中的「无选择」因生产目录默认选中广告解说2.0，本轮未无损构造空值场景；**未选择空值文案不签新真实覆盖**。

### PNG 与人眼复检

66张新真实PNG，每张文件SHA、bundleSha/runId绑定在 screenshot-manifest.json；实际测量+采图时间/viewport/theme在 ui-initial.json 与 ui-compact.json。已display_file复检：浅色/暗色1280单条、两主题390菜单、390真实长名称、正式全表初始图。观察：单条紧凑且横向居中、顶锚稳定；窄态菜单不截边、无暗色黑洞，底栏当前值可读。未用旧PNG、合成图或主页打卡图。

PM可用actual PNG（均相对工作树）：
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/light-1280x800-single.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-1280x800-single.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/light-390x844-final-menu.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-390x844-final-menu.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/light-390x844-final-long-1.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/dark-1920x929-full-last.png`
- `docs/evidence/shared-official-voice-preview/acceptance-round2-20261004/formal/assets-detail-native-playing.png`

## Unknowns

OS硬件中文IME、显式无选择空值状态、字体缩放导致实际长名换行增高、通用Select长内容菜单、故障/断网全矩阵、所有124音色实际播放、PM_SIGN_OFF及用户满意确认均未由本轮签全量。CDP组合输入不是OS输入法；当前目录默认有值，不伪造未选择。独立 final-review-closure-20261004 的Frontend finding保留给主理人协调。

## Not covered / Cleanup

无App/Dev43120或45120/server替换/restart/生产部署/merge/commit/push/TTS/R2/费用操作。正式server finally已关闭、正式job exit0收集；实际端口49878 ECONNREFUSED。UI补采job exit1完整保留，其余job已收集，无仍运行相关后台任务。追加只操作已加载page，无导航已关端口。

**space2/p1仍Agent-owned，未create任何新space、未finish。** 最终light1280×800/Charlie单条，Canvas selectedNodes1，14个观察native实例均paused=true/time0/实际readyState0。唯一任务空间留PM终验与最终clear；不要reload/goto49878。详情与资产证据可以文件检查，不重建空间。

## Confidence / Route

正式媒体高：同nativeid、trusted input、原生事件、完整样本窗与外层AND。实际UI高：六配置DOM坐标/Range边界/computed对比度与display复检互相印证。完整PM七场景覆盖中等：无选择与OSIME明确未覆盖，不据局部绿宣称全量。

**QA当前路由：NoOne / Pass_SCOPED → PM可终验实际已覆盖界面；整票仍须独立OCR余项及PM/user确认。** 已复验首轮三项在本voice picker actual目录范围通过。额外通用Select宽内容finding → Frontend（裴像素），不是QA自行改生产或新开测试循环。
