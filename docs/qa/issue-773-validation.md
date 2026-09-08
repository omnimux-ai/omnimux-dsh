# #773/#775 T03 第一轮独立 QA

## 结论

**IS_PASS: NO（仅 T03 离线验证器）；Route: Engineer。**

独立源码/库边界审计及真实恶意 fixture 发现一个入口准入缺陷族，分为两项可复现问题：SAB拒绝可绕过、ZIP真实输入20MiB硬上限可绕过。最终4个失败测试在Node25.8.0与Node22.22.2均复现。生产源码、工程原测试、规格、package/lock均未改；没有因尚未接线而判失败。

本次是首次独立QA委派，内部执行两轮（初跑→QA自修→最后回归），已达两轮上限；未进入第三轮，也未联系工程或其他成员。下一责任为主理人安排Engineer按本报告修复，再安排独立复验。当前不可关闭T03，更不代表完整#773/#775关闭。

## 基线、交付与范围

- base = HEAD：`580234923268673562cacb5cd01aebdb780339e1`；审计目标为本树未提交增量，未fetch，不冒称远端最新tip。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- 手写交付仅本文、`plugins/omnimux-market/src/tests/install-validation.qa.test.ts`（73项）、`plugins/omnimux-market/src/tests/install-validation-qa-fixture.ts`。本包正式build生成对应lib，不手改生成JS。
- 独立fixture writer不调用工程writer或生产parser/CRC；bitwise CRC有`123456789→cbf43926`已知向量对照。所有正文为合成QA文本，包只驻内存；证据与cache位于`.task-tmp/validation/`。
- 未安装/清理依赖、未改外仓/共享配置/用户数据、未执行包内scripts/hooks、未联网上传、未启动App/L2/模型、未提交/push。

## 已读输入

完整读取工程交付`docs/implementation/issue-773-validation.md`172行、依赖决策`issue-773-validation-dependency-decision.md`153行；全部七个`src/install-validation*.ts`模块；原`install-validation.test.ts`235行/128项及fixture67行；正式architecture §4.2（含相关安全/门槛上下文）、PRD §9.2/§12.1、acceptance169行、revision-notes83行；Market package/tsconfig/build脚本、THIRD_PARTY_NOTICES与真实lock差异；证据目录及安装布局/锁镜像/保护快照。

库侧实际读取yauzl3.4.0的fromBuffer、EOCD、entry、local header、raw stream实现；yaml2.9.0的parseAllDocuments/parseDocument和compose资源耗尽处理。未借库文档的默认值代替当前消费路径核验。

## 测试报告

| 阶段 | 实际结果 | 路由/证据 |
|---|---|---|
| 初跑Node25定向strict | exit0，0诊断 | `qa-strict-round1.log` |
| 初跑Node25正式全包test（含build） | exit1；550项543通过7失败；7 suites，0skip/cancel/todo | `qa-formal25-round1.log` |
| QA自修后定向strict | exit0，0诊断 | `qa-strict-round2.log` |
| 最后Node25正式全包test（含build） | exit1；553项549通过4失败；7 suites，0skip/cancel/todo | `qa-formal25-round2.log` |
| 同轮Node22.22.2完整验证器影响面（原128+QA73） | exit1；201项197通过4失败；0skip/cancel/todo | `qa-target22-round2.log` |
| Node22全包noEmit | exit0，0诊断 | `qa-noemit22-round2.log` |
| 依赖/lock闭包、工程历史保护证据核验 | exit0 | `qa-dependency-audit.json`、原`verification.log` |
| 当前保护文件/共享指纹复核 | 3174文件与工程after快照一致；35703共享项、18原包项和3外kit文件复核一致 | `qa-protected-final.json`及下文时点解释 |
| `git diff --check` | exit0 | HEAD未变；新文件另直接全文检查 |

最后全包553 = 原480 + QA73；原480本轮全部通过（其中工程T03 128），不能再把query84重复相加。新增QA最终69通过4失败。Node22原全包480/480历史工程证据可复用，本次只实际重跑201项影响面，不称再次全包553。未测覆盖率百分比，不编造估计值。

### 初跑失败与QA自修（不掩盖）

初跑7失败中：

1. QA自身4项：`denied()`的reason正则`[A-Z_]`误拒正确的`ZIP64`/`INVALID_UTF8`。改为`[A-Z0-9_]`后全部通过；不是工程异常泄漏。
2. QA自身1项：2000层合法YAML仍处有限字节预算、解析可正常结束，规格没有固定YAML深度数值，不能自造阈值要求拒绝。改为30000层、仍小于64KiB的真实资源耗尽样本（最终拒绝）；另保留2000层“合法有限投影或资源拒绝”的对照，不把其接受判漏洞。
3. 工程真实2项：SAB属性遮蔽、输入accessor换源，均返回validated。最后回归增加同根因实际20MiB+1对照后，最终工程4失败，QA误报0。

历史工程首轮多文档漏拒绝同样保留：原`targeted.log`114项113过1失败；`parseDocument`在`logLevel:silent`下忽略后续文档，工程改为`parseAllDocuments`。本次重审库`dist/public-api.js:40–51`确认该条件，原测试与QA多文档样本均通过拒绝；不能将历史写成一次全绿。

## Known Issues / Engineer修复项

### QA-VAL-01 — P2 / Medium：可遮蔽属性及重复读取绕过SAB拒绝

- **源码**：`plugins/omnimux-market/src/install-validation.ts:13–16`，`validateInstallPackage()`。
- **失败用例**：QA测试149–159行：`QA SAB backing cannot be disguised by shadowing public buffer property`、`QA input accessor cannot substitute SAB after byte admission`。
- **复现A**：创建真实`new Uint8Array(new SharedArrayBuffer(82))`写入合成合法MD；给实例定义自有`buffer: new ArrayBuffer(82)`。`instanceof Uint8Array`仍成立，`.buffer instanceof ArrayBuffer`检查只看到遮蔽值；`copy.set()`实际从共享底层读取。
- **复现B**：`input.bytes` getter前两次返回普通MD Buffer，之后返回真实SAB view。第13行的类型/来源检查与第14–16行的测量/复制不是同一个快照。
- **预期**：实际共享backing不能进入复制/worker；不可验证或可重入换源输入fail-closed，或一次性捕获可信普通view并只处理该快照。
- **实际**：两Node均`ok:true, stage:'validated', inputBytes:82`。不需要真实并发写即可证明SAB拒绝契约已被绕过；本次没有用并发撕裂概率冒充确定性证明。
- **影响限定**：需要同进程JS调用者/适配层构造对象；普通上传ZIP/MD字节本身不能设置这些getter，不夸大为远程代码执行。共享源可在复制时并发修改，违反入口明确不接SAB的设计保证。
- **建议**：一次性读取input字段，使用TypedArray内建getter提取真实backing/offset/length；避免信任自有可覆盖属性。若选择“一次捕获合法快照”而不是拒绝accessor，则复验时将accessor测试改为核对捕获快照hash/长度，并保留真正共享backing拒绝测试；不能仅改断言放行当前换源行为。

### QA-VAL-02 — P2 / Medium：真实ZIP输入20MiB硬上限可绕过

- **源码**：`install-validation.ts:14–19`；`install-validation-worker.ts:8–14`（ZIP worker无原始zipBytes二次检查）；`install-validation-zip.ts:46–50`。
- **失败用例**：QA测试160–174行：`QA accessor cannot substitute a valid over-20MiB ZIP after admission`、`QA intrinsic byte length cannot be shadowed to bypass ZIP input budget`。
- **真实包**：20971521字节合法STORE ZIP，SKILL82字节、资源a10485760字节、b10485409字节，其他预算均合法；独立writer生成，不是全零假zip或mock。
- **复现A**：`input.bytes`前三次返回小合法包，之后返回上述大包；第14行检查小包，第15/16行分配并复制大包。
- **复现B**：同一个真实大Buffer的自有`byteLength` getter第一次返回1，之后返回真实长度。固有底层长度未变，准入检查却被覆盖值骗过。
- **预期**：超20971520字节实际输入在分配/worker前返回`PACKAGE_LIMIT/INPUT_BYTES`；若捕获安全小包则结果只能绑定那个小包，不能validated大包。
- **实际**：两Node都接受20971521字节，返回`inputBytes:20971521`、`contentHash:e2937a062f4dba9e318199ef74bf076d6014d122a8012bb8a9a2c9b7d01b3acc`。
- **影响限定**：同进程构造条件；绕过发生在主线程copy之前，不能靠下游流式resource/total限额声称入口有界。未分配更大危险样本，仅用+1证明失效。
- **建议**：基于单次捕获view的intrinsic真实长度限额并复制；worker对传入自有ArrayBuffer按format复核实际zipBytes/skillBytes/total预算作为纵深，不通过放宽公开limits解决。

两个问题同属入口信任边界，应一并处理；可合并为一个工程修复，不必新增通用框架。

## 其他重点审计与实际证据

| 边界 | 独立结论/限制 |
|---|---|
| metadata预扫描 | `structure.ts:14–42` EOCD搜索最多65558个候选位置、count先≤1000，中央记录长度由16bit字段且被输入边界约束；yauzl lazy reader后才顺序local核验，先全部路径/结构再inflate。QA用首项坏inflate+末项unsafe path，得到UNSAFE_PATH证明顺序。除入口绕过外，没有发现ZIP字节独立引发无界metadata扫描。 |
| EOCD/central/local/descriptor | 唯一EOCD/comment终点、ZIP64 sentinel/locator/extra、多卷字段、local签名/flags/method/version/CRC/尺寸/名字一致性，排序区间从0到central无洞/无重叠。独立正确STORE/DEFLATE×无/签名/无签名descriptor及合法comment均通过；local非零合法descriptor字段对照通过。 |
| flags/extra/hardlink | 方法0/8、flag白名单、Unix特殊mode、Unix/ASI链接extra、NTFS长度与重复extra拒绝。新增local-only hardlink与ASI真实CRC样本拒绝；合法local时间extra与central差异可接受，未机械要求全部extra字节相等。未知extra只当惰性数据，不用于未来安装属性。不能据有限清单保证所有第三方扩展绝对安全。 |
| CP437/Unicode/fullfold | raw CP437不能以Unicode extra掩盖不安全路径，UTF8与extra冲突、local/central编码冲突拒绝；NFC+固定15.1 C/F后NFC。新增ligature/long-s/Cherokee/Deseret、隐式目录、非Turkic与Unicode16新增字符对照通过。非ASCII合法Unicode覆盖可代表不同字面名称，最终只输出严格规范化manifest；未来落点必须消费同一映射。 |
| ratio/实际量 | 自持inflater.bytesWritten与delivered/声明相等才放行；padding/第二stream新增大尾部样本拒绝，目录不贡献分母，真实1201/12越100拒绝。原实际1/10/100MiB、1000entry、depth、frontmatter边界重新全量通过。新增合法ZIP精确20MiB成功，+1普通输入拒绝，与QA-VAL-02调用对象绕过严格区分。 |
| YAML/MD | 原始字节frontmatter先限64KiB，严格fatal UTF8、trim非空body、AST全遍历拒alias/tag/复杂key/重复key、多文档；不toJS，白名单元数据无授权字段。新增嵌套alias/tag/duplicate、合法folded description/end marker、3种非法UTF8通过。解析耗尽被库转error且worker可终止；没有自称固定深度策略。 |
| worker取消/超时 | 代码仅exit事件resolve，terminate后等待退出；monotonic deadline，成功/error同样结束worker；copy普通Buffer不transfer调用者。新增成功/失败/setImmediate取消的真实WORKER destroy证据通过，原1ms真实timeout通过。未等待整30s实跑；async_hooks在await后一轮检查destroy，不冒称记录了所有原生线程资源。 |
| 错误与输出 | 所有负向结果只含ok/code/reason，库异常映射固定原因；恶意正文/合成私有路径不出现在结果。合法metadata描述允许原文本，属于显示数据而非净化HTML承诺；详情渲染尚未接线，不能算本次已安全渲染。 |
| 执行/网络 | 七模块没有fs安装、child_process、fetch/http、shell/hook/模型接线；scripts/hooks/nested.zip只返回manifest/hash，嵌套不解包。未真实执行哨兵文件、未网络抓包或模型服务计数，结论限定离线源码/fixture边界。 |

## 依赖、许可与保护集

- `git diff --numstat pnpm-lock.yaml`为**+46/-0**；语义对比base确认仅Market新增4 runtime+1dev，新增恰5 package/snapshot：types/yauzl3.4.0、Unicode2.0.2、buffer-crc32 1.0.0、pend1.2.0、yauzl3.4.0；yaml2.9.0及Node types复用。原非Market importer及原packages/snapshots逐项deepEqual。
- 正式lock与`.task-tmp/validation/metadata/product/omnimux-dsh/pnpm-lock.yaml`逐字相同；工具安装manifest真实pnpm11.7.0，lock.log记录19.7s。QA未再运行lock生成/安装或网络。Market既有packageManager11.17.0未改，本报告不把它改写成11.7.0声明。
- 实际隐藏安装锁8包version/SRI逐项与真实pnpm lock一致。Market node_modules是真实本树目录，旧10个包realpath保持原只读目标、新5项仅指task-local。没有清理运行依赖。
- Unicode通知与task保存1995字节license逐字相含，SHA256`e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96`；npm MIT声明与Unicode V3分开保留。其余安装依赖许可证文件留在各包内，本次未重做法律审计、npm签名/provenance认证或在线CVE查询；完整性/许可证核验不等于绝对安全保证。
- 工程before/after两快照35703共享项/18原包项/3kit及3163保护项逐项重审通过；随后当前共享35703项和18项已有路径的mode、file hash及1468/10条link目标重核一致，3kit file hash/mode一致。此为已记录路径的复核，不宣称额外文件全量枚举或OS层审计。
- 当前任务3175个保护文件对工程after快照重哈希，3174一致；唯一差异是工程报告本身：after时间16:38:45，报告mtime16:42:11（QA开始前）。首个检查因此exit1，调查后明确为工程最终补写时点差异，不是QA修改生产。原七模块hash已保存`qa-protected-audit.json`，源码/原测试/package/lock无QA改动。

## 复现命令与证据绑定

以下cwd固定任务树，所有环境同工程任务内隔离，禁网络与自动依赖生命周期；不触发其他包build：

```sh
V="$PWD/.task-tmp/validation"
export HOME="$V/home" TMPDIR="$V/tmp" DSH_HOME="$V/home/dsh"
export XDG_CACHE_HOME="$V/cache" XDG_CONFIG_HOME="$V/config" XDG_DATA_HOME="$V/home/data"
export npm_config_cache="$V/cache/npm" npm_config_offline=true npm_config_ignore_scripts=true
export npm_config_update_notifier=false NODE_DISABLE_COMPILE_CACHE=1
unset NODE_OPTIONS NODE_PATH
node plugins/omnimux-market/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module Node16 --moduleResolution Node16 --target ES2022 --esModuleInterop plugins/omnimux-market/src/install-validation*.ts plugins/omnimux-market/src/tests/install-validation*.ts
npm --prefix plugins/omnimux-market run test
/Users/x/.nvm/versions/node/v22.22.2/bin/node --test --test-concurrency=1 plugins/omnimux-market/lib/tests/install-validation.test.js plugins/omnimux-market/lib/tests/install-validation.qa.test.js
/Users/x/.nvm/versions/node/v22.22.2/bin/node plugins/omnimux-market/node_modules/typescript/bin/tsc -p plugins/omnimux-market/tsconfig.json --noEmit
```

重点复现可在已build后追加`node --test --test-name-pattern='SAB|accessor|intrinsic byte' plugins/omnimux-market/lib/tests/install-validation.qa.test.js`（供Engineer；本QA未额外第三次执行）。最终Node25日志591–598行为总数、603–679行为失败；Node22日志393/417/441/465为对应not ok、1281–1288为汇总。

日志SHA256：

- 初跑Node25：`97436fe2bb858cc7e86839884a28b2a719cf0936ee596338498cdfdaa88828ee`
- 最后Node25：`b0d5087b65f00b27313cbbbfa6af6314ab10e981cd7377205f6edfada28674a5`
- 最后Node22影响面：`d03e701755977ea07b9ca2461381a2904a34758ffed77b07afbd3efbce391fe8`
- 完整列表：`.task-tmp/validation/qa-evidence-hashes.json`。

工具首次相对路径误落主树导致只读not-found，改绝对任务路径后正常；一个非必需workflow reference路径不存在未执行任何外部脚本。两者不是产品失败或绕权重试。

## 未验与关闭限制

真实生命周期scope、受管staging/提交前hash/no-follow、Registry统一策略/barrier、L2/ego/Electron、认证/Origin新接线、最低Node22.0/22.1均未验；已有22.22.2不等最低22.0。未来显示metadata仍须安全渲染。没有真实安装、库存、会话、模型、App物化或部署证据。

**T03入口问题需Engineer修复；本次两轮后剩余4失败列为Known Issues并停止。源码审查与测试证据可交付，不具备T03通过、合并或完整工坊关闭条件。**

## Round2 — 工程返修后正式独立 QA（2026-09-08）

**IS_PASS: YES（仅 T03 离线验证器）；Route: NoOne。QA-VAL-01 / QA-VAL-02 均关闭，残余失败0。**

本节是工程返修后的正式第二轮；前文首轮内部两次试跑仅处理QA自身误断言，不冒充工程修后Round2。历史结论原样保留，以本节为当前T03离线结论；未进行第三轮修复迭代。完整57 AC、#773/#775、合并与运行验收仍未通过，不由本结论关闭。

### 审计目标与不变性

- base = HEAD仍为 `580234923268673562cacb5cd01aebdb780339e1`，目标为固定 `skill-workshop-773` 任务树本地未提交增量；未fetch，不冒称远端最新。
- 完整读取本报告原133行、工程报告237行、原QA测试194行/73项与独立fixture78行、工程测试367行（原128+新增22）、入口74行、worker29行、contract82行；重核architecture §4.2、Market package/tsconfig和既有保护证据。
- 七模块逐项对首轮 `qa-protected-audit.json` 指纹：**恰入口和worker两处生产差异**，其余五模块不变。工程测试前19427字节仍为原128项，SHA256 `eb3d99ea49aed0ee7e3b5c32c126856d21a16ba8c629c27a236e0ef3313b76cf`。
- 原QA测试SHA256 `12ec9339e89bea0ba402d2c04e9280568e5b883bc360f1868338e0f909537a00`；QA fixture `c28ecff3b87576a9cc7b52d82af460c63d6fb3025596e3c5c4e1710e9149096e`；工程fixture `1ca9baffa453a3a1c5e273c0fdd20f4f817d8368d4a400f695858c216a4b151b`。均与工程返修报告一致，没有调整既有断言。
- 当前入口 `77b0f360ded0c39d9f073c22e2816c8832f36ababd3e25b37ddc572c3ce4d027`、worker `9fe52c5b057a6333b1f6dfc6bc469ef346c56d7837496a7f603c42f033e97986`、工程150项测试 `79b19a41e7cdb873343d5fafab1e37be3800ebe8bc7dac550570bc8c3daea05a`，全部匹配工程最终证据绑定。
- contract、package和lock均匹配工程表中完整SHA256。另对既有after快照中的96个Market源码/脚本/package/tsconfig文件重核，变化仅上述两生产模块及工程测试，与已绑定返修完全一致。该检查不是35703共享项全量盘审计，也不新增供应链认证承诺。
- 唯一手写改动为本文追加Round2；本包正式build生成lib，不手改JS。没有修改源码、依赖、原测试/QA断言、规格或工程报告，没有安装/清理依赖、访问网络/模型、执行其他包/L2/App、跨仓写入或提交推送。任务依赖现场保留。

### 两项关闭依据与兼容性

| 项目 | 独立复核结论 |
|---|---|
| QA-VAL-01 | 入口18–35行先拒input Proxy，然后从自有data descriptor捕获format/fileName/bytes；不执行accessor。`types.isUint8Array`及TypedArray intrinsic getter取得真实backing，`types.isArrayBuffer`拒真实SAB而不信遮蔽属性。原两项失败双Node均转通过；新增零getter/零Proxy trap及detached前置拒绝用例通过。**关闭。** |
| QA-VAL-02 | 入口36–42行取真实offset/length，先checkLimit再创建source/copy；worker11–17行在hash/parser之前按真实ArrayBuffer长度复核format、zipBytes/skillBytes和MD totalBytes。原两项失败双Node均转通过，真实超限包不得进入worker的工程对照通过。**关闭。** |
| 真实ZIP而非mock | 原QA37–45行的合法精确20MiB包成功，+1普通输入拒绝；160–174行仍实际构造20971521字节有效STORE包，accessor换源与byteLength遮蔽均拒绝。本轮确实执行全部样本，没有用全零假ZIP或mock替代。 |
| 错误语义 | ZIP bytes accessor返回`PACKAGE_LIMIT/INPUT_BYTES_DESCRIPTOR`表示不能在不执行代码的前提下建立输入预算，不声称隐藏字节已测量超限；真实大包返回`PACKAGE_LIMIT/INPUT_BYTES`。该fail-closed策略符合首轮允许的修复选择，不改变合法字节规格。 |
| Buffer/子视图/所有权 | 普通Buffer、Uint8Array、子类和带遮蔽属性子视图精确hash、长度、同步mutation隔离与调用方backing未被transfer均通过；无回归。 |
| 跨realm | 原223项没有直接构造另一vm realm，故另作4个只读内存对照/Node：跨realm MD与ZIP子视图各自精确hash+mutation隔离、跨realm遮蔽SAB拒绝、冻结普通data input接受。两Node各4/4通过，未增加生产特性或要求合法输入额外拒绝。 |
| 取消与limits | 原预取消、真实cancel、下调1ms timeout、QA success/malformed/cancel的WORKER destroy观测均通过；所有提高预算拒绝、各项下调预算、worker纵深预算保持。没有扩大为对任意同进程全局intrinsic篡改或不可信options的隔离沙箱。 |

### 本轮实际执行与复用证据

| 检查 | 结果 | 实际执行/复用 |
|---|---|---|
| Node25.8.0本包正式build | exit0 | 本轮实跑；仅本包 |
| Node25定向strict | exit0，0诊断 | 本轮实跑 |
| Node25完整验证器影响面 | **223/223**；0 fail/cancel/skip/todo；9994.592834ms | 本轮实跑 |
| Node22.22.2完整验证器影响面 | **223/223**；0 fail/cancel/skip/todo；11859.216625ms | 本轮实跑 |
| Node22全包noEmit（tsconfig strict=true） | exit0，0诊断 | 本轮实跑 |
| 两Node跨realm/冻结输入对照 | 各4/4，exit0 | 本轮stdin实跑，独立于223计数 |
| Node25正式全包test含build | 575/575，7 suites，0 fail/cancel/skip/todo | **复用工程已绑定日志，非本轮再跑575** |
| Node22正式全包test含build | 575/575，7 suites，0 fail/cancel/skip/todo | **复用工程已绑定日志，非本轮再跑575** |
| 指纹、HEAD、Markdown及diff核验 | exit0 | 本轮实核 |

223 = 原工程128 + 原QA73 + 工程新增22。575 = 原全包480 + 原QA73 + 工程新增22；query子集不重复相加。跨realm4个对照不混入正式套件数。未测覆盖率百分比，不编造估计值。

独立实跑job为 `bash-347`，已收集completed/exit0，末尾 `ROUND2_ALL_CHECKS_EXIT_ZERO`。完整格式化工具结果：`/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/dsh-spill-EM4TyC/session-4919ccd9a282/a203e9b421c7-job_output.txt`，SHA256 `629ce36c9194228deba74af4e7e1768215af5097cc938b51edaf4de90902bc45`。未额外向项目证据目录写新日志。

复用工程完整575日志路径仍为工程报告218行所列 `dsh-subprocess-75281-170-76623c8cc76c-stdout.log`；本轮实际重哈希为 `84a94ded5794f7d6d9110641fb6a30468b148ca1806b45ceb0ef24173c4374ce`。重读Node版本与汇总：Node25日志1966–1973行575全过/12491.35875ms；Node22日志5486–5494行575全过/14289.279208ms及ALL_CHECKS_EXIT_ZERO。对应源码、测试、package/lock绑定一致，故按本次授权复用完整包证据。

实际命令仍以本任务树为cwd，使用前文105–111行task-local环境（HOME/TMPDIR/DSH_HOME/XDG/npm cache，offline/ignore_scripts，禁compile cache，unset NODE_OPTIONS/NODE_PATH），PATH前置已有Node25.8.0：

```sh
npm --prefix plugins/omnimux-market run build
node plugins/omnimux-market/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module Node16 --moduleResolution Node16 --target ES2022 --esModuleInterop plugins/omnimux-market/src/install-validation*.ts plugins/omnimux-market/src/tests/install-validation*.ts
node --test --test-concurrency=1 plugins/omnimux-market/lib/tests/install-validation.test.js plugins/omnimux-market/lib/tests/install-validation.qa.test.js
/Users/x/.nvm/versions/node/v22.22.2/bin/node --test --test-concurrency=1 plugins/omnimux-market/lib/tests/install-validation.test.js plugins/omnimux-market/lib/tests/install-validation.qa.test.js
/Users/x/.nvm/versions/node/v22.22.2/bin/node plugins/omnimux-market/node_modules/typescript/bin/tsc -p plugins/omnimux-market/tsconfig.json --noEmit
```

跨realm对照复现方式：在同一环境用两个Node分别运行以下stdin脚本（不保存新测试文件；原断言不变）。此代码即本轮执行的4个对照：

```js
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { createHash } = require('node:crypto');
(async () => {
 const { validateInstallPackage: validate } = await import('./plugins/omnimux-market/lib/install-validation.js');
 const { QA_SKILL, qaPackage } = await import('./plugins/omnimux-market/lib/tests/install-validation-qa-fixture.js');
 for (const format of ['markdown', 'zip']) {
  const original = format === 'markdown' ? QA_SKILL : qaPackage();
  const foreign = runInNewContext('const backing = new ArrayBuffer(raw.length + 17); const bytes = new Uint8Array(backing, 9, raw.length); bytes.set(raw); ({format, fileName, bytes})', { raw: [...original], format, fileName: format === 'markdown' ? 'SKILL.md' : 'foreign.zip' });
  assert.equal(foreign.bytes instanceof Uint8Array, false);
  const pending = validate(foreign); foreign.bytes.fill(0);
  const result = await pending;
  assert(result.ok, JSON.stringify(result));
  assert.equal(result.inputBytes, original.length);
  assert.equal(result.contentHash, createHash('sha256').update(original).digest('hex'));
  console.log(process.version, 'PASS foreign-realm', format, 'subview/hash/mutation');
 }
 const shared = runInNewContext('const bytes = new Uint8Array(new SharedArrayBuffer(raw.length)); bytes.set(raw); Object.defineProperty(bytes, "buffer", {value: new ArrayBuffer(raw.length)}); ({format:"markdown",fileName:"SKILL.md",bytes})', {raw: [...QA_SKILL]});
 assert.deepEqual(await validate(shared), {ok:false,code:'PACKAGE_FORMAT',reason:'UNSHARED_BYTES_REQUIRED'});
 console.log(process.version, 'PASS foreign-realm shadowed SAB');
 const frozen = Object.freeze({format:'markdown',fileName:'SKILL.md',bytes:Buffer.from(QA_SKILL)});
 assert((await validate(frozen)).ok);
 console.log(process.version, 'PASS frozen ordinary data input; CONTROLS 4/4');
})().catch(error => { console.error(error); process.exitCode = 1; });
```

### Known Issues与下一责任

**T03本轮无残余失败，QA-VAL-01/02可按离线范围关闭；无需第三轮。** 完整57 AC未验，Registry统一策略/barrier、认证/Origin、实际scope、受管staging/提交前hash/no-follow、真实安装生命周期、Node最低22.0/22.1、30秒实际完整时长、UI/L2/ego/Electron仍未验，原门槛全部保留。源码及两Node离线测试通过不等于App已物化、已合并或完整工坊验收。主理人可接收本轮T03结论并推进后续既定工作；本QA结束，不继续无关检查或部署。
