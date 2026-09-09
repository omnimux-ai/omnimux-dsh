# Studio 第2轮独立 QA 报告

## 判定

- **原失败修复回归 PASS：原29项未改，连同工程新增5项，34/34通过。**
- **源码完整回归 FAIL / Known Issues；Send To: Engineer。** 新增独立2项为1通过1失败，公开关闭生命周期存在可复现缺陷，不能将34/34直接扩展为全部源码契约通过。
- **完整运行验收 BLOCKED；IS_PASS: NO；不可合并放行。** 本轮未执行ego、未启动Host、未创建或消费正式live请求，没有真实PNG/runtimeProof，绝不记为通过。
- 第2轮到此结束；没有产品修复、没有第3轮。

## 身份与范围

- 日期：2026-09-09，Asia/Shanghai；Edward，独立QA。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`。
- 固定审查修复base：`b62414c6785f85155798e94c5b48378da7e3466b`。
- 固定target及开始/结束HEAD：`f728537096af205aad793fe9ba9767b569afde77`；指定本地SHA，不fetch。
- 已读首轮`QA-REPORT.md`、`REPAIR-REPORT.md`、相关源码/测试、共享probe及plugin-qa合同。
- 原6份工程测试相对base无差异；原独立测试SHA256仍为`d86717f14a7b22cfac032b30638e5c38dcdc449a066a20922ce6be7b7015d3fa`。首轮报告、失败日志、工程日志原样保留。
- 仅新增QA测试、报告、QA2日志；未修改产品源码、依赖或官方运行时、credential bootstrap、Host、部署、外仓；未push/merge。完整gates只使用测试自建fixture，以TMPDIR限定在本任务树，不操作真实Dev/Prod。

## 首轮7失败逐项复验

执行`node --test plugins/omnimux-studio/tests/*.test.mjs`（新增本轮测试之前）：34 tests /34 pass /0 fail /0 skip，exit0。输出保留于本次工具运行记录；下表非仅引用工程声明。

| 首轮项 | 独立实际结果 |
|---|---|
| QA01 稀疏文档 | PASS：validateDocument拒绝空洞 |
| QA02 引用身份缺字段 | PASS：submit返回false、状态对象不变 |
| QA03 video草稿改成image | PASS：原video mode保留 |
| QA04 cancel同步failed回调 | PASS：余额3463、唯一cancelled终态 |
| QA06 实际bundle依赖未就绪 | PASS：模块求值及等待inject不产生style |
| QA07 稀疏四结果 | PASS：failed、全额退款3463 |
| QA08 未知video submode | PASS：拒绝提交 |

另独立重跑QA05/QA09、完整引用逐字段缺失、abort/订阅者重入/迟到回调、scene store隔离、真实React/jsdom场景chip点击及图片正文确认装配全部通过；未自动提交或扣点。Q5首轮静态发现已由工程的scene-ui测试覆盖。冻结快照、跨cwd/session/repoRoot隔离、100UUID、暂停剩余计时等已有用例通过。

## 打包与全局kit副作用

按`plugins/omnimux-studio/scripts/build-client.mjs`相同配置，在插件cwd内仅内存构建，不覆盖lib：

- 80,148 bytes，与当前`lib/client.js`逐字节相同。
- SHA256：`4e3aa983a667f3fe7c593b6618443fddf7aa47748913503c281bfa66c606226f`。
- esbuild metafile的kit输入数为0，不是把kit换成测试替身；源码消费本地Button。
- 实际`window.__ModuleLoader__.load`包装执行10轮独立factory：求值/缺依赖时Host style节点与HTML字节不变；注入时恰增加一个Studio style，释放后恢复原节点与字节。
- 最初QA内存构建从仓库cwd执行导致esbuild源注释带额外路径，字节比较失败；更正为实际插件cwd后匹配。该次是QA取证配置问题，不是产品构建缺陷。
- 以上是VM/jsdom离线结论，不证明亮暗主题computed style、布局或浏览器视觉无污染。

## 共享probe独立核查

`node --test scripts/live-qa.test.mjs scripts/ego-live-qa.test.mjs scripts/studio-live-qa.test.mjs`：25/25，exit0，0skip，见`QA2-probe.log`。

新增`plugins/omnimux-studio/tests/independent-qa-round2.test.mjs`中的八Stage对抗用例通过：实际capture所有八目标，逐一拒绝缺失/重复entry、无选中/双选中、session/context漂移、无snapshot、未open/未active、无content、loading、visible error。`all`依旧accounts/workflow/assets/products/inspiration/publish/analytics/market；Studio为显式community-tab而非sidebar伪装。

源码差异未修改ego transport、请求一次消费/过期/SHA/身份校验或runtime proof；Studio走相同正式执行路径，依然要求当前session、唯一active/openedTab、非空可见root、无错误、真实可解码PNG。同源CDP加载脚本与bundle唯一注册/指纹仍由`live-runtime-proof.mjs`统一检查。25项测试确认pending不是PASS、认证失败不消费、并发单消费者、拒绝IAB/错误task/无能力和假PNG。

限制：`captureStageContract`仍是controlled Host离线契约，不是真实Host；Studio目标不能替代下面的完整关闭/重开业务验收。共享probe的closePanel是隐藏，不等价于销毁Tab或清空Studio store。

## Known Issue K1 / P2：公开程序关闭Tab未清空Studio scope

- 失败用例：`QA2 public closeTab session-only callback clears closed Studio scope, preserving other sessions`。
- 位置：`plugins/omnimux-studio/src/client/index.js:25`、`scope-registry.js:4-6`。
- 实际锁定`dsh-better-sidebar@0.18.0/lib/client.js:1772-1775`：公开closeTab使用`scope ?? { sessionId }`调用onClose；不保证cwd/repoRoot。
- 共享probe自身`scripts/live-stage-probe.mjs:224-226`也使用`{sessionId}`调用`service.closeTab`清理。
- 复现：真实依赖解析client bundle→inject捕获正式Tab→创建closed/other两session store→调用该Tab的`onClose(tab,{sessionId:'closed'})`。
- 期望closed.disposed=true；实际false。因为scopeKey拒绝缺cwd，registry完全没有收到释放指令。关闭后同scope重开会复用旧草稿/任务/资源，违反页面“关闭后清空”及关闭生命周期要求。
- 证据：`QA2-adversarial.log`，2 tests /1 pass /1 fail /0 skip，exit1；堆栈定位本轮测试:51。
- 这不是跨scope泄漏结论，也未声称普通鼠标关闭一定复现；完整scope鼠标回调的既有测试通过。它是官方公开调用形态下已复现的本插件适配缺口，首轮报告曾列为待确认，本轮补成失败用例。
- 下一Owner：Engineer。在本插件内处理缺cwd但session确定的关闭，并保留其他session/scope，新增官方关闭形态矩阵；不得修改外部sidebar绕过。QA本轮不改源、不启动下一修复轮。

## 门禁与环境差异

独立执行：

| 检查 | 结果 |
|---|---|
| verify-stage-contracts | exit0；11 Stage / 原8 targets |
| verify-plugin-boundaries | exit0；2238 sources |
| scan-ui-gates | exit0；296 views /0违规 |
| git diff --check | exit0；仅tracked工作区diff，不代表历史日志无空白或ignored QA已纳管 |
| 完整npm run test:gates | exit1；133 tests /125pass /8fail /0skip；见QA2-gates.log |

**没有复述工程143/149为本轮独立结果。** 为满足仅任务树写入约束，命令设置`TMPDIR=$PWD/docs/implementation/studio-audit-remediation/qa2-fixtures`。因此与工程结果存在已解释的fixture环境差异：

1. 原6环境失败仍独立复现：4个hoisted/isolated sync-repeat-install场景在离线Corepack获取`pnpm-11.7.0.tgz`失败（Network access disabled）；2个package-files顶层用例因assets声明的`runtime/cpython-3.13.15+20260807-darwin-arm64`、`darwin-x64`缺失失败。不下载、不造空目录。
2. 额外guard-worktree文件初始化失败：其假定非Git的fixture置于任务Git树内，git discovery返回0而非128，17用例未展开而汇总为1文件失败，因此149变133（减16）。这是QA限定TMPDIR引入的fixture适用性问题，不是Studio回归；这17项本轮不得计通过。
3. 额外Alpha policy父用例失败（嵌套2项）：fixture位于Git树内，sync-to-app读到`agent/studio-audit-remediation`并拒绝未合入物化（日志408/428）。未设绕过开关；不将它标为产品Alpha缺陷或通过。

不为追求143/149数字另开第3轮、移到外仓或修改门禁。要复现工程原命令环境，门禁Owner需提供授权范围内真正Git树外的临时fixture位置，或单独修复fixture隔离设计；另外准备受管离线pnpm缓存和真实assets运行时后按范围验证。

## 完整验收剩余阻碍

1. 本树没有`.l2-dev.env`，没有绑定该HEAD的正式L2身份。用户本轮明确排除bootstrap/Host/部署，故未启动、未认证、未探测当前其他GUI充当L2。
2. 首轮记录的dev-env credentials/settings/seed隐式复制风险不在此次修复diff内；本轮没有重新读取凭据或尝试规避。主理人/环境Owner需提供明确授权且受管的任务L2准备路径，再由独立QA校验SHA/profile/PID/启动时间/当前bundle。
3. 未执行ego：无task/Tab所有权证据、无实际runtimeProof、无PNG。缺的不是可用工具推测，而是此目标正式环境与执行证据；本轮未测试ego能力，不声称ego不可用。
4. 仍需真实验证scope切换/关闭清空及重开、十轮依赖卸载、亮暗宿主不变、320/768/1200布局、真实CJK IME/粘贴/选区、主区dock/焦点、媒体错误与下载。离线34/34和25/25不能替代。
5. K1源码缺陷与6个原环境门禁失败独立存在：即便L2权限获批也不能忽略K1；即便K1修复也不能视ego未做为通过。

## 交付与结束状态

新增本报告、`QA2-adversarial.log`、`QA2-probe.log`、`QA2-gates.log`及`plugins/omnimux-studio/tests/independent-qa-round2.test.mjs`。原测试/报告/日志保留。本报告在git status中为untracked；新增测试及QA2日志受忽略规则覆盖，未改exclude或强制纳管；不能仅以git status枚举全部交付。任务专属临时fixture清理后不保留；无运行中后台job、Host或浏览器任务需交接。
