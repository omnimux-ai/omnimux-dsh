---
title: "V1 浏览器图片入库 · 独立 QA 首轮"
id: "qa-browser-image-assets-v1-first"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 #3052 独立 QA · 严过关

## 结论

**FAIL / Engineer（后端工程师寇豆码），不是单纯环境阻断。V1 尚不可验收，V2 的「Blocked by V1」解除条件不成立。**

真实最小 Host/library 主链已证明：真实 Cordis 插件挂载、真实 assets 服务注册、真实 browser Host RPC、真实 loopback 配对/认证 WebSocket、公网安全下载、真实栅格解码、既有资产库单实例文件/账本/revision/changed、现有 HTTP 列表/预览及插件重建。后端旧报告的缺 loader/session 结论不能继续作为这些接缝无法验证的理由。

但是实际边界复现出 stage symlink 越界清扫、缺文件旧记录失败时被删除、并发同名冲突、最长名称第二张失败，以及 attachments 后挂载仍不可用。真实浏览器、前端冻结终验、两宿主真实扩展投送仍待主理人统一完成；此报告不冒充 Chrome/Firefox 端到端交付、不替代 OCR 或 PM_SIGN_OFF。

## 验收范围与身份

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`。
- branch：`agent/cross-browser-image-assets-issue-3051`；HEAD/base：`d95764912e36da01d879ab65d6340469b48a4625`；实现为未提交工作树快照。
- 已读 [技术规格](../../specs/browser-image-assets.spec.md)、[V1 票](../implementation/browser-image-assets-v1-ticket.md)、[wire 合同](../implementation/browser-image-assets-wire-contract.md)、[后端报告](../implementation/browser-image-assets-v1-backend-report.md)、[plan-notes](../implementation/browser-image-assets-plan-notes.md)、[产品 UI-Spec](../product/browser-image-assets/UI-Spec.md)、[design](../../design.md)，并只读检查前端当前快照和后来形成的[前端报告](../implementation/browser-image-assets-v1-frontend-report.md)。
- QA 仅写本报告与 evidence 下 `qa-*`；新增探针仅 [.tmp/qa3052-real.mjs](../../.tmp/qa3052-real.mjs)。未修业务、未改既有断言、未创建产品第二 Store。
- 未读取真实凭据；采用临时生成的测试 token、隔离 HOME/DSH_HOME。未重启 App、未调用付费服务、未修改公共 Dev/Prod、未开浏览器/space/Playwright launch、未 commit/push/关闭票。

## 证据与可复现性

持久证据：[结构化结果](../evidence/browser-image-assets-v1/qa-host-library-results.json)、[观察与原日志定位](../evidence/browser-image-assets-v1/qa-observed-trace.txt)。后者明确是摘录而非完整 stdout；不把实施者摘要日志当完整原件。

主要运行命令（均明确 bash workdir；Git 均 `git -C <上述工作树>`）：

1. 工作树根：`node --experimental-transform-types .tmp/qa3052-real.mjs`，真实退出码 1；最后原日志 [.tmp/qa3052-real-expanded.txt](../../.tmp/qa3052-real-expanded.txt)，完整结果 [.tmp/qa3052-real-run-aqly63/results.json](../../.tmp/qa3052-real-run-aqly63/results.json)。探针 SHA256 `51d65b096c5de1c4e6e2ea76162d037b9391779c58e7c0a6da37050b21a8a4f7`。
2. browser 包：直接 `node node_modules/vitest/vitest.mjs run`，先指定安全/新增八文件，再 `tests/*.spec.ts`；未使用 pnpm exec。
3. 工作树根：`node --test` 指定 library/cloud/http/generation/image-ingest/library-image-transaction 六文件。
4. extension 包：直接 `node node_modules/vitest/vitest.mjs run` 指定新增/background/media-actions/media-brand-icon/media-trigger/lifecycle；匹配六文件。
5. browser 包：`node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --tsBuildInfoFile ../../.tmp/qa3052-browser.tsbuildinfo`。
6. 工作树根：`node scripts/verify-plugin-boundaries.mjs` 与 `git -C <工作树> diff --check`。

### 真实装配边界

真实 `@deepseek-ai/cordis@4.0.2 Context.plugin` 挂载当前 assets/browser 源码，以及已安装 `dsh-host-webserver/dsh-system-prompt/dsh-tools/dsh-agent/dsh-attachment-local@0.1.5-rc.3`。`ctx.reflect.props.assetLibrary.type === 'service'`，`ctx.get('assetLibrary')` 读取活跃 provider，卸载后消失、重挂后从 ledger 重建；因此**本机当前 Cordis 版本中 `ctx.provide` 不是假属性，Service 基类不是必需条件**。不接受旧 fake ctx 测试作为该项依据。

真实 remote Gateway/Connection 不参与图片保存，本探针用明确失败的外部设施边界占位，其调用会报错；`hubEvents` 为事件观察器。未替身 registry、assets apply、decoder、library/list/preview。在错误/并发案例中只替身已批准的外部下载接缝，输入由 sharp 生成的完整 PNG/JPEG，不使用短头伪图。公网主链不替身下载器。

依赖准备仅使用当前工作树已有 `.pnpm` 包和 ignored 包级 `node_modules` 链接，无安装/prepare、无根 manifest/lock 改动。早期 Node strip-only 无法处理参数属性，后用 Node 原生 `--experimental-transform-types`；QA 探针的 syntax/API/生命周期句柄错误已修正，属于 QA 自身准备问题，不计业务缺陷、不消耗修实现回归轮次。

## 测试与合规概况

| 验证层 | 结果 | 真实退出码 | 解释 |
|---|---:|---:|---|
| 真实 Host/library 探针 | 18 项：13 PASS / 5 FAIL | 1 | 首轮独立验收；不是浏览器 E2E |
| assets 六文件 | 132 PASS / 0 FAIL / 0 skip | 0 | 单元/文件系统回归 |
| Host 安全/新增八文件 | 205 PASS / 0 FAIL | 0 | 大部分网络/解码用替身，只证明局部 |
| Host 全部顶层 spec | 293 PASS / 1 FAIL；另 1 收集失败 | 1 | caps 旧测试断言与 workspace 缺包分开列 |
| extension 当前六个匹配文件 | 97 PASS / 0 FAIL | 0 | 前端未冻结，临时快照，不签终验 |
| Host tsc | PASS | 0 | 实跑 |
| plugin boundaries | PASS，3882 文件 | 0 | 实跑 |
| diff --check | PASS | 0 | 实跑 |
| design 存在性/静态继承 | 存在；未见新增主题/几何/装饰岛 | — | 视觉/无障碍终验未执行 |
| SaaS 极简文案审计 | 新增中英文图片字典对齐白名单；无新增营销文案/徽章/Emoji | — | pairing、unknown aria 与 title 渠道仍待冻源纠正/核验 |
| 真实浏览器专属功能截图 | 待统一 | — | #47 保留主理人，QA 未占用 |

上述测试重叠，不将各层数字简单相加冒充独立总覆盖。未执行修实现后的第二轮；本报告不是 Known Issues 容忍签收。

## 主链通过的实际证据

生产 Host RPC 下载公共 W3C PNG：`https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.png`。真实配对 request/approve/status，精确 loopback Origin 批准，一次领取 token 后状态 unknown；错误测试 token close4002 且不写库。

回执 `saved / ast_dc7e6eda / fil_70ae0bf0 / lrev2`；受管文件 897 bytes，SHA256 `2b77bd4345f8db03932c3d002e0f52fa9e7989deb4e85a7c12f7f5f8c81cfe89`。ledger 保留 `data/files/ast_dc7e6eda/image-2b77bd4345f8db03.png` 相对路径及 source digest。真实 HTTP library 可列表，preview200/image/png、读回字节可再次真实解码，changed 事件 id/revision 与回执一致。assets dispose/remount 后仍可读回，不新建 Store。

真实 decoder 独立补验接受 PNG/JPEG/WebP/GIF；一个截断 PNG 仍可读 header metadata(width100)，但 `validateImage` 实际像素解码拒绝为 INVALID_IMAGE，证明不是 header 检查。JPEG 声明 PNG 拒为 IMAGE_TYPE_MISMATCH，短头/空/未知 MIME 不入库；校验不创建 attachment 持久副本。

同源8并发（不同 fragment）只得一资产、一revision、一changed；串行 duplicate 不抬 revision/事件。不同来源同名串行 `same title`/`same title (2)` 可保存且文件分离。新记录普通 persist失败能保持既有 list/revision/ledger；两隔离 home 的服务捕获原 paths，不因随后改变环境变量而串写另一库。缺 assets→后挂真实 assets 的 RPC 从 unavailable 变为正常输入校验分支。

## 失败详情与路由

### Q1 高危：stage 根 symlink 越界写入/清扫删除（Engineer，做错）

位置：[image-ingest.js:126–150](../../plugins/omnimux-assets/src/image-ingest.js#L126-L150)、[197–228](../../plugins/omnimux-assets/src/image-ingest.js#L197-L228)；[isInsideDir:89–93](../../plugins/omnimux-assets/src/ingest.js#L89-L93) 只做 lexical resolve。

规格原句：「每次操作独占暂存区并负责清理…不得删除用户原文件」；plan明确「拒绝 symlink 逃逸，不清整个资产根」。在 QA home 把 vault `.image-ingest` symlink 到 vault 外 `external-stage`，外部预建合法命名过期 `old-slice/outside-sentinel.txt`。实际保存回 `saved`，sweep 沿根 symlink 删除外部过期目录，`EXTERNAL_SENTINEL_REMAINS=false`，stage symlink 最后也被移除。scope名模式和字符串包含检查不能替代 realpath/lstat 根安全。**阻断 V1/V2**。此操作仅在 QA fixture，自有测试文件，未触及真实用户数据。

### Q2 高：缺文件重复路径先删除记录，后续失败破坏一致性（Engineer，超范围/做错）

位置：[image-ingest.js:161–181](../../plugins/omnimux-assets/src/image-ingest.js#L161-L181)、[209–212](../../plugins/omnimux-assets/src/image-ingest.js#L209-L212)、[library.remove:609–616](../../plugins/omnimux-assets/src/library.js#L609-L616)。

规格原句：「文件缺失的既有记录不能作为成功证据」「账本、内存 revision 和受管文件失败一致性」。记录缺文件不授权先销毁它；`rollbackAddedAsset(staleId)` 实际对旧记录调用 destructive remove，并吞 remove persist失败。QA 删除本 fixture 受管文件，再把 ledger 路径暂时变为目录令真实 rename失败。重试返回 storage-failed，但旧记录从内存/list消失且revision前进；最后成功的原账本与内存不同。成功重试也会丢旧assetId/元数据。不能靠「清残骸」声明无偏离。**阻断 V1/V2**，须由存储拥有者保证替换事务/诚实失败而非静默删除。

### Q3 中：不同 source 并发同名不递增，handle 二义（Engineer，做错）

位置：[uniqueDisplayName:184–190](../../plugins/omnimux-assets/src/image-ingest.js#L184-L190)、[add:528–553](../../plugins/omnimux-assets/src/library.js#L528-L553)。

规格原句：「不同图同名递增而不覆盖」。不同source的两张完整图并行保存，均返回saved、不同assetId/fileId，但ledger两个 `name=handle='race title'`。name检查发生于异步copy前，同source Map不覆盖不同source名称竞争。文件未相互覆盖，但句柄检索二义且不满足递增。**阻断本验收**。

### Q4 中：40 字名称追加后缀越限，第二来源保存失败（Engineer，做错）

位置：[sanitizeDisplayName:58–68](../../plugins/omnimux-assets/src/image-ingest.js#L58-L68)、[uniqueDisplayName:184–190](../../plugins/omnimux-assets/src/image-ingest.js#L184-L190)、[normalizeName:67–71](../../plugins/omnimux-assets/src/library.js#L67-L71)。

规格原句：「显示名最长40字」「不同图同名递增」。首图标题40字符可保存；第二来源同标题被追加 ` (2)` 后触发 `name-invalid`，Host返回storage-failed。应为后缀预留长度而非使合法输入失败。另源码实测 `sanitizeDisplayName('a\u0001b-c')='a\u0001b c'`：普通连字符被清掉而控制字符未清；控制字符随后触发storage-failed。此补充为同模块真实边界缺项，不计18项之外的新测试数字。

### Q5 中：attachments 后挂载仍永久 unavailable（Engineer，缺实现）

位置：[browser index:288–305](../../plugins/omnimux-browser/src/index.ts#L288-L305)。

后端报告声称「两者resolved per call…mounted-later」。实际只对assetLibrary调用时解析；attachments在mount时捕获。QA先启 browser，后挂真实dsh-attachment-local，`ctx.get('attachments')` 已存在，但原RPC仍unavailable；对非法URL也无法进入invalid-url分支。缺能力报错本身是诚实的，不是假成功；问题是已恢复的真实能力不可发现/HMR可能持有旧provider。应注明真实部署顺序约束或实现调用时获取/正确inject lifecycle，不能继续声称支持两者后挂载。

### Q6 旧测试合同红灯（QA/需主理人授权，非产品bug）

依赖准备后真实Loader composition可运行4项，其中3通过；一项只因 [composition.spec.ts:322](../../plugins/omnimux-browser/tests/composition.spec.ts#L322) exact hello caps旧期望遗漏合法新增imageAssetSave:true失败。产品能力位符合wire，**路由QA测试合同更新**，但本任务不改既有测试，留待授权。后端以缺loader跳过隐藏了该红灯，不得声称全套回归通过。

### 前端待冻源项（Frontend，观察而非最终判退）

- [background index:1622–1624](../../plugins/omnimux-browser/extension/src/background/index.ts#L1622-L1624) 配对只保存token后重新startBridge，未把批准port完整URL同token绑定；[1650–1654](../../plugins/omnimux-browser/extension/src/background/index.ts#L1650-L1654) 换port保留旧token。前端报告称已绑定与已读实现不符。规格/V1票明确「配对成功须绑定所批准目标地址」「不能跨profile」。图片新增relay只看当前connected/caps，没有local-target/approvedURL事实；Host loopback拒绝能防远程磁盘写，但不能证明批准目标不串写另一本机profile。需要冻结后真实双目标/审批中切换验证，不用模拟hello成功背书。
- [capsule labelFor:308–315](../../plugins/omnimux-browser/extension/src/content/media-hover/capsule.ts#L308-L315) unknown仍aria「加入灵感库」，overlay hint却typeUnknown，不满足UI-Spec unknown四渠道；title未找到设置。未新增营销/徽章/Emoji，字典逐字通过；不能因此宣布全部无障碍/视觉合规。
- 视频静态封面work语义已按票粒度交V2，本报告不将角标/V2未实现当V1临时最终失败；但V2必须承担真实两入口语义验收。

## 下载安全策略：能证明与仍缺项

已只读确认图片 adapter默认复用真实fetchMediaBytes→fetchPublicMedia；8MiB、9秒、最多5跳、逐跳校验、固定DNS到socket、解压后限量，未新增弱fetch兜底。公网成功及私网literal拒绝经真实RPC；MIME错误/损坏实际decoder验证。既有205项覆盖DNS混合、fake-IP代理兼容、gzip/deflate/br、跳转、超限、超时/取消，但其transport request和DNS为替身，**不能声称本次所有攻击/预算条件均真实socket实测**。无借真恶意地址拨私网，无网站凭据转发。

仍缺：真实受控public→private跳转不拨私网的socket证据、默认9秒/8MiB/5跳所有组合实际网络验证、提交边界断连与回执丢失恢复、真实跨profile审批中切换、实际扩展CORS/Origin/worker回收。共享home多进程锁是规格未承诺的既有约束，未扩范围新造数据库。

## TDD核验：不接受整批红绿冒充逐切片循证

规格/合同原句：「每个垂直切片先失败测试跑红，再最小实现跑绿」「先单个失败行为测试跑红再最小实现跑绿」。实施者自报整批先测再实现属于tdd skill明确禁止的horizontal slicing，**过程不合规**；不以当前绿灯倒推其遵循TDD。

已实际读取机器原件 [/tmp/3052-assets-red.log](/tmp/3052-assets-red.log)、[/tmp/3052-browser-green1.log](/tmp/3052-browser-green1.log)：assets有两个有效library行为RED（幽灵记录/revision），但ingest首跑只是模块不存在，未执行其行为；browser所谓首跑RED时堆栈已有image-assets实现，61项57pass/4fail，其中三项属测试对象形状/Buffer严格类型差别，一项外部取消5s超时。没有证据显示browser每一切片先red，报告中的「实现缺口+tsc边界」也不能代表这四失败原因。

缺项客观列为：逐切片单项RED命令及stdout、对应最小实现时序/源码指纹、每项GREEN及真实exit；当前已有原日志支持哪些行为错误必须如实保留，不编造历史TDD。QA后验新增探针并非实施TDD证据。

## 环境阻断、未知、不覆盖与置信度

真正环境阻断仅剩Host全顶层session-purge收集缺 `@deepseek-ai/dsh-workspace`（本地仅旧0.1.1-rc.2，不把它伪装0.1.5-rc.3），以及本次明确不授权的真实浏览器空间操作；均不掩盖Q1–Q5的实际实现失败。核心Cordis/decoder装配已用合法入口完成，无需根依赖变更或App重启。

前端source未冻结；没有新截图、真实扩展点击、Firefox运行、用户演示批准、PM_SIGN_OFF或当前分支实现提交，本票交付条件未完成。不检查真实用户库、不读秘密、不覆盖视频灵感旧逻辑重构/跨进程锁/生产发布。

置信度：Q1–Q4在两个独立新QA home、真实decoder/service/library复现，Q5由真实composition证实；高。前端pairing为静态缺口，真实跨profile结果未证明，中。网络安全策略的全部真实socket组合与视觉合规尚缺证据，不能给通过。

## 后续与 V2 准入

先由后端处理Q1–Q5，尤其先封堵symlink越界和旧记录删除；附真实服务/decoder/事务回归证据。QA只在修复快照明确后执行**第2轮回归**；若仍失败，停止循环标Known Issues，不自动修实现。主理人授权测试合同更新处理Q6。前端冻结后核查批准URL/token目标绑定、unknown/title四渠道，再由主理人在保留#47执行真实扩展功能路径、专属截图、资产列表/预览/持久读回。

**可准备V2实现设计/共享接缝适配，不可宣告V1通过或解除V2阻塞。具体准入阻断：Q1–Q4核心安全/一致性失败、Q5装配生命周期缺口、前端配对目标绑定尚未证明、真实胶囊浏览器闭环/截图与产品签收缺项。**
