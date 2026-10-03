# Issue #3043 native/helper 独立 QA（第 2 轮，只读验收）

## Conclusion｜结论

**正式显式 bridge 的原生评论行为：PASS_SCOPED。B3/B4 环境装配修订及 B5 独立漂移报告：PASS_SCOPED。完整异常清理保证：FAIL / Known Issues（环境工程）。生产入口命名：FAIL / Known Issues（Frontend）。不签无条件总 PASS。**

指定正式运行确为 **1/1 通过，fail=0、cancelled=0、skip=0**；不将成功事实改写为失败。全文、坐标、空正文、真实原生发送和模型请求前外层拒绝均有同次证据。私有 staging 复用正式 builder，不再覆盖工作树公共 lib；manifest 包含 builder、产物和 bridge hash；显式代码包输入不等于复制用户 profile/凭据。正常收尾已观察到宿主退出及 temp 删除，但 SIGKILL 后无期限等待的旧异常保证缺口仍存在，第二轮停止修复循环并列为已知问题。

本轮只读 native 测试、helper、其正式 builder/seed 与证据，并创建本报告。未修改源码、未构建、未安装依赖、未运行原生 E2E、未启动/重启/操作应用、未读取用户 profile 或凭据、未调用生成服务。generation 不在本轮范围；原始 [第一轮报告](<qa-review.md>) 保留不覆盖。

## Evidence｜规格、命令与正式证据

### 范围与规格对照

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-host-e2e-issue-3043`。
- [环境规格](<../../../specs/host-e2e-environment-3043.spec.md#L3-L24>) 原句：“不得新增 skip 掩盖失败、削弱有效断言或用仿制组件冒充生产页面”；“不复制用户凭据/profile”；“完整原生验收须显式传 OMNIMUX_E2E_SIDEBAR 指向已验证的正式桥接代码包并记录版本/内容 hash”；“动态端口与测试进程在 finally 清理”。
- [命名 AC-4](<../../../specs/canvas-naming-unification.spec.md#L38-L42>) 原句：“卡片 title 为「点击进入图像生成」”。现状不符合，不以 class 导航绕过后宣称产品文案合规。
- [design.md](<../../../design.md#L18-L55>) 存在；此次环境改动不新增生产样式、胶囊、营销文案或装饰图标。已预览同次 ready/removed 场景，确认真实分栏、图片、评论附件与移除后空输入状态可见；不签全量设计、深浅主题或所有几何规范 PASS。

### 正式运行（Lead 提供，本轮不重跑）

正式命令：`OMNIMUX_E2E_SIDEBAR=/Users/x/.omnimux-dev/profiles/omnimux/.materialize-snapshots/plugins/dsh-better-sidebar node --test plugins/omnimux/src/client/comment-native.e2e.test.js`。

[正式日志](<../../../.tmp/host-e2e-3043/native-explicit-bridge.log#L1-L9>)：`tests 1 / pass 1 / fail 0 / cancelled 0 / skipped 0`，用例约 28.29 秒。日志没有单独的 shell 退出码字段，故本轮独立确认 TAP 汇总，不冒称独立重测 exit=0。

同次 runId 为 `comment-native-e2e-OwSRTO`，原始 [assertions](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/assertions.json>) 和 [cleanup](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/cleanup.json>) 与 [正式汇总](<native-final-result.json>) 两对应字段逐项 JSON 相等。

- [browser](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/browser.json#L3-L9>) 四项均记录，`closed=true`：草稿不能发送；空正文 ready；精确 session 外层拒绝注册；移除清空并禁用空发送。
- [上传内容](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/uploaded-comment.json>)：精确 session，单张图片、单条完整原文，`xPercent=50 / yPercent=50`。
- [pre-step 决策](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/comment-pre-step-decision.json#L5-L25>)：真实上传文件及完整追加 text 同属该 user 消息；图片标识、编号、全文及 `50.0%` 坐标与上传内容一致。
- [journal](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/journal.jsonl#L10-L13>)：真实 user inbox 插入后以 `blocked` 结束；后续无 `request/`、`assistant/attempt` 或 `step/start`。seed 的旧静态历史 step 在此前，不误算为实际发送后的模型调用。
- 已通过 display_file 预览同次 [ready 截图](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/ready.png>) 与 [removed 截图](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-OwSRTO/removed.png>)。ready 原生输入框正文空、评论 JSON 附件可见；removed 无该附件且评论栏回到“添加评论”。不是通用首页截图。

## B3/B4/B5 与保真回归

### B3｜私有真实 source 构建：关闭原阻断 / PASS_SCOPED

[helper:218–272](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L218-L272>) 将 Hub/viewer 所需真实 src/assets/scripts/manifest 等复制到每次独有 staging；依赖逐入口链接、兄弟插件与 packages 仅作解析输入，没有 install。调用的是复制的正式脚本，不是替代组件或复制构建逻辑。

[Hub builder:6–8,50–54](<../../../plugins/omnimux/scripts/build-client.mjs#L6-L54>) 从自身 import.meta.url 计算 lib 路径；[viewer builder:18–19,63–93](<../../../plugins/omnimux-viewer/scripts/build.mjs#L18-L93>) 同样绑定 staging 根（tsc cwd 也是 staging）。[native:54–75](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L54-L75>) 在 staging 构建后安装该两包。native 的构建子进程 cwd 为工作树，但这两个正式 builder 的实际输出不依赖该 cwd。

正式 manifest 的 staging 在 `.tmp/comment-native-e2e-OwSRTO/staging`；包含两个 builder hash 与三项运行产物 hash。本轮只读重算正式 builder hash，均与 manifest 一致：

- Hub：`sha256:e47d904cba609483dc39007a82950ceead37dfc5ec30a33233242ba714cb0475`。
- viewer：`sha256:9c897e1ac2d0bfbcc7f0a4b53a20a22b28ddd78be112a0a1f3c0f162cd2ea685`。

产物随 temp 删除，未重建，故产物 hash 仅为同次 manifest 记录，不宣称本轮重新读取已删产物。共享依赖/兄弟源码不是不可变 snapshot，亦未做并发故障压测；关闭的是“写公共 lib”具体缺陷，不签全输入并发冻结保证。

### B4｜显式宿主/bridge 与声明解析：关闭原阻断 / PASS_SCOPED

[helper:71–103](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L71-L103>) 验证宿主可执行、CLI archive 可读，记录公开 app 版本 2.0.9，提供显式路径覆盖；不是凭安装时间推定兼容，也无默认 profile 搜索。

[helper:121–179](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L121-L179>) 显式 bridge 校验正式包名并记 tree hash；默认扫描仓库声明及只读依赖链接。`createRequire` 已在 30 行导入，并在 146 行以 `manifestPath` 初始化，原未初始化 require 问题已修。

本轮在内存 Node 脚本调用 `resolveSidebarBridge(root,{})`，不启动任何子进程、不写盘；实际解析到 [Studio 声明](<../../../plugins/omnimux-studio/package.json#L38-L44>) 的 `0.18.0`，`declaredBy=plugins/omnimux-studio@0.18.0`、`source=declared-dependency`，hash 为 `sha256:bef2e9a750fb0b24c5303ad76dd0aabd6905dfda8df302f965e98ebf666b0ca1`。只读验证命令 `REAL_EXIT=0`。

正式成功 manifest 明确 `source=env / version=0.19.1`，bridge hash 为 `sha256:84bfaacd6e0aa69d66760ef488051afbc2e758c899466e637922f4689c1ababc`。它取自用户显式指定的正式插件代码包；当前安装循环只 add 该 package dir，不复制 profile 根、settings 或凭据。QA 本轮未访问该显式外部目录，不声称独立重算了它的 hash。

**默认声明 0.18 布局不兼容仍是 Known Issue，不冒称默认无配置运行通过。** 已读默认运行 [QLTHV5 browser](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-QLTHV5/browser.json>) / [cleanup](<../../../.agent-reports/comment-only-send/formal/comment-native-e2e-QLTHV5/cleanup.json>)，其输入确为 0.18.0，浏览器失败于隐藏的 Exit fullscreen。该旧失败还受修复前二次点击影响；不单靠此日志推导当前纯版本因果。用户确认及当前环境规格已明确真实布局不兼容前置，本轮只验证该限制如实声明，不再跑默认入口。

### B5｜独立命名结果：关闭“未报告”阻断；产品命名仍 FAIL

[native:108–112,179–194](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L108-L194>) 保留真实 class 点击并独立记录 observed/expected/compliant；正式输出为 `entryNamingCompliant=false`、title“点击进入画布”、text“画布”、ariaLabel=null。行为通过未掩盖命名失败，不要求此环境票修生产字符串。

**观察范围限制**：当前 compliant 谓词是 title/ariaLabel/text 的 OR，且 text 用 includes；它不是 AC-4 全字段逐字合规检查。本次 observed 全部为旧名，所以不影响真实 false 结论；后续不能用该字段 true 代签完整命名规格。

### 原生有效断言：保留 / PASS_SCOPED

[native:125–144](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L125-L144>) 点击真实原生 Send message，空正文及附件 ready/移除后禁用未被覆写；没有 setDraft 占位、disabled/CSS 覆写或直接填内部 state。[native:151–178](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L151-L178>) 保留完整字符串精确相等、实际上传坐标与中心点击容差、精确 session 和发送后 journal 外层拒绝验证；[seed](<../../../plugins/omnimux/test-support/comment-native-seed.mjs#L35-L49>) 在生产 pre-step 后读实际文件并外层 reject，不向真实模型请求。

两处 Exit fullscreen 均受实际可见性检查，不再无条件二次点击；正式成功截图为分栏。第二处 timeout/click catch 并不单独证明每次分栏，后续真实评论按钮可见及同次截图才是本次最终交互证据。

## Known Issues｜二轮截断后的遗留与路由

### KI-N1｜P2｜宿主异常终止仍缺最终 deadline；完整清理保证 FAIL / Engineer

**缺实现**：[helper:315–331](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L315-L331>) 的 SIGTERM 等待有界，但 328 行在 SIGKILL 后再次 `await once(host,'exit')`，无最终 timeout。若 exit 不到，调用不会返回；[native:195–205](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L195-L205>) 的 rm 位于该 await 之后，无法保证执行。外层 node:test timeout 也不等于取消该异步清理。

本轮只用 EventEmitter 内存模型验证（没有真实 spawn、kill 或文件写入）：`termWaitMs=5`，假 host 接收 SIGTERM/SIGKILL 均不发 exit，30ms 后 `unsettledAfterEscalation=true`；补发合成 exit 才 `settledAfterSyntheticExit=true`，验证命令 `REAL_EXIT=0`。这证明控制流缺最终有界收敛，不证明正式运行曾泄漏进程。

此外 [boundedCommand:288–295](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L288-L295>) 超时发 SIGTERM 后立即 reject、SIGKILL 在 grace 后调度；caller 可以先进入 temp 删除而孩子尚未 close。只管直系 owned PID，未证明 builder 的 tsc 孙进程或 ego taskSpace 被完整回收。浏览器 finally 的 `task.finish` 也不是硬取消保障。本轮没有异常故障注入真实宿主，因此不给完整“失败无残留” PASS。

**已关闭的部分**：temp 建好后的资源获取现在在外层 try 内；清理证据写失败不会跳过最后 rm；正常记录 `hostStopped=true / exitCode=0`，本轮 access 实证正式 temp 为 ENOENT。保留这些改善，不泛化为异常全覆盖。

**路由**：Known Issues / 环境工程负责人。此为上一轮异常清理问题的未闭合部分；二轮到此停止，不开启第三轮修复。后续独立授权才可补最终 deadline、等待 owned child close 与 task 清理失败证据。

### KI-N2｜生产入口命名 FAIL / Frontend

规格期望“点击进入图像生成”，实际“点击进入画布”。B5 报告机制修订通过不等于命名修复通过；另案处理，不在本轮改源码，不替代 PM_SIGN_OFF。compliant OR 谓词限制如上保留。

### KI-N3｜默认 0.18 与当前宿主不兼容 / 环境兼容性

显式 0.19.1 正式代码包运行通过；默认 0.18 不签 PASS。不得默认搜索 profile，也不得把显式代码路径包装成干净机器开箱即用。此限制已进入环境规格及 manifest，保持可见。

### KI-N4｜原生原规格的既有覆盖不足 / QA

[原生规格:7–10](<../../../specs/comment-only-send.spec.md#L7-L10>) 要求“至少四条评论”、busy/锁定/upload/error、切会话及保留其他附件/正文。当前正式测试仍只一条评论；本次没有删除原有有效断言，但 1/1 只签当前主链路，不签 #1756 全规格。继续沿用第一轮已知覆盖边界，不发散实现。

## Unknowns｜未独立证实

- 正式汇总不含 native/helper 自身 source hash；本轮 snapshot 为 native `sha256:9eaeb2bce8443b0b33cd5b1be7787dec554b2c0e7e2b170a8f88af95c374faf8`、helper `sha256:6c5433852b0a09313a54dea1501f93c25350dd15f76cdd7cceeee1d7661ae883`。builder hash 一致不等于自动证明所有 harness 字节是同次不可变快照。
- 不重建已删除 staging，不独立重算外部显式 bridge，不查询用户进程或端口。正式正常关闭是证据结论，不是全机残留检查。
- 未执行真实异常终止、并发装配压力、缺驱动路径；既有 `skip: !hasEgoBrowser` 未新增，本次实际 skip=0，但缺驱动仍非 fail-closed。

## Not covered｜边界

不审核或修改 generation 新改动、不重复 B1/B2 验收、不审核供应商真实生成、不跑全仓测试/CI、不构建/安装/物化/部署、不提交/推送/合并、不替代 OCR 或 PM_SIGN_OFF。QA 本轮只创建本文件；git native diff 与 scoped diff --check 为只读，后者成功。

## Confidence｜置信度与最终路由

**当前正式原生主流程及 B3/B4/B5 修订：高置信 PASS_SCOPED。异常保证未闭合：高置信 Known Issues / Engineer。命名：高置信 FAIL / Frontend。** 正式日志、实际上传全文/journal、同次截图及 source 控制流相互支持；当前版本与运行字节完整对应、异常子进程回收未有完整证据，已明确限制。二轮结束，不发起进一步工程循环；由 Lead 接收范围验收及遗留台账决定是否接受显式前置交付。
