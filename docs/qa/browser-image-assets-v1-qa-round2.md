---
title: "V1 #3052 浏览器图片入库 · 独立 QA 第2轮（后端限定）"
id: "qa-browser-image-assets-v1-round2"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 #3052 独立 QA 第2轮 · 严过关

## 结论

**backend 整改 QA PASS（NoOne / Pass，仅限本报告已执行的后端行为）。Q1–Q5、OCR sourceKey trim、提交期间取消回执、外部取消先行归因均已独立验证。不是 V1 完整验收通过，不解除 V2 的全部前置阻塞。**

未改的首轮真实探针独立重跑 **18 PASS / 0 FAIL、exit 0**；新增边界探针 **9 PASS / 0 FAIL、exit 0**。后端冻结源码与指定测试指纹在验收开始和结束一致，且与[整改报告](../implementation/browser-image-assets-v1-backend-fixes.md#源码指纹冻结时-sha-256)公布的全部十项指纹一致。

全量 browser 回归仍 exit 1：**299 pass / 1 fail / 6 skip、2 收集失败**，与整改前已知问题同类。Q6 旧 caps 断言路由 QA / 主理人授权处理；缺 workspace / playwright-core 为运行环境缺项。本岗不改断言、不补依赖、不启动 Playwright。第2轮结束，遗留项列为 Known Issues，不自动进入第3轮修复循环。

真实扩展点击、功能专属截图、Chrome/Firefox 闭环、前端批准目标绑定与文案/无障碍终验、OCR CLI 复审、PM_SIGN_OFF 均不由本报告签收。报告 frontmatter 的 accepted 表示本证据记录被接受，**不表示产品验收或 TDD 历史通过**。

## 身份、范围与约束

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`；分支 `agent/cross-browser-image-assets-issue-3051`；HEAD `d95764912e36da01d879ab65d6340469b48a4625`。实现为未提交工作树快照。
- 先读[首轮 QA](browser-image-assets-v1-qa.md)与[后端整改报告](../implementation/browser-image-assets-v1-backend-fixes.md)，再读[V1 票](../implementation/browser-image-assets-v1-ticket.md)、[wire 合同](../implementation/browser-image-assets-wire-contract.md)、[OCR 首轮](browser-image-assets-v1-ocr.md)、[CONTEXT](../../CONTEXT.md)与[design](../../design.md)。
- 本轮只写本报告、`docs/evidence/browser-image-assets-v1/qa-round2*` 与新增 `.tmp/qa3052-round2-boundaries*` 探针/本轮 tsc 缓存；未改任何业务源码、既有测试断言、首轮探针或首轮报告。
- 直接 node，Bash 均显式 workdir，Git 均 `git -C`。不 pnpm exec、不安装/prepare、不 commit/push/merge、关票或物化。
- 所有库写入限隔离 QA HOME/DSH_HOME；token 为探针临时生成。没有读取真实用户库/凭据、重启桌面应用、调用付费服务或生产操作。
- 未操作主理人的 ego 空间133、未新开空间、未开新浏览器。前端 job32 是否返回不作为 backend 检验条件；本轮不签前端冻源终验。

## 可复现命令与测试概况

原探针 SHA256：`51d65b096c5de1c4e6e2ea76162d037b9391779c58e7c0a6da37050b21a8a4f7`；未改。运行命令为 `node --experimental-transform-types .tmp/qa3052-real.mjs`，独立运行目录 [.tmp/qa3052-real-run-gEApKh/results.json](../../.tmp/qa3052-real-run-gEApKh/results.json)，完整 stdout/stderr 与真实退出码保存在[原探针日志](../evidence/browser-image-assets-v1/qa-round2-real.log)。

新增探针复用原探针前53行真实装配，仅增加边界，不删除/弱化原探针的任何断言。命令 `node --experimental-transform-types .tmp/qa3052-round2-boundaries.mjs`；SHA256 `15982e390902133fa5cfca3412f26bc9c128fa80ee1be4460154bf801371a484`；[探针源码](../../.tmp/qa3052-round2-boundaries.mjs)、[补充日志](../evidence/browser-image-assets-v1/qa-round2-boundaries.log)、[结构化结果](../evidence/browser-image-assets-v1/qa-round2-boundaries-results.json)。

| 验证层 | 独立实际结果 | exit | 证据 |
|---|---|---:|---|
| 原样真实 Cordis / Host / library 探针 | 18 PASS / 0 FAIL | 0 | [完整日志](../evidence/browser-image-assets-v1/qa-round2-real.log)、[结果](../evidence/browser-image-assets-v1/qa-round2-real-results.json) |
| 追加真实装配边界 | 9 PASS / 0 FAIL | 0 | [完整日志](../evidence/browser-image-assets-v1/qa-round2-boundaries.log)、[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries-results.json) |
| assets 全部 src 测试 | 270 pass / 0 fail / 0 skip | 0 | [assets 回归](../evidence/browser-image-assets-v1/qa-round2-assets-all.log#L415-L423) |
| browser `tests/` 全量 | 299 pass / 1 fail / 6 skip、2收集失败 | 1 | [browser 回归](../evidence/browser-image-assets-v1/qa-round2-browser-all.log#L157-L218) |
| browser tsc | PASS | 0 | [tsc](../evidence/browser-image-assets-v1/qa-round2-tsc.log) |
| plugin boundaries | PASS / 3882源码文件 | 0 | [边界检查](../evidence/browser-image-assets-v1/qa-round2-plugin-boundaries.log) |
| git diff --check | PASS | 0 | [差异检查](../evidence/browser-image-assets-v1/qa-round2-diff-check.log) |
| design 存在性 | 存在；本轮无 UI 实现变更 | — | [design](../../design.md) |
| SaaS 极简文案与视觉终验 | 本轮未测前端，不沿用首轮静态结果签终验 | — | 前端/真实浏览器仍待统一验收 |

命令另为工作树根 `node --test plugins/omnimux-assets/src/*.test.js`、browser包 `node node_modules/vitest/vitest.mjs run tests/`、browser包 `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --tsBuildInfoFile ../../.tmp/qa3052-round2-browser.tsbuildinfo`、根 `node scripts/verify-plugin-boundaries.mjs`。每次先重定向完整日志，再保存实际 `$?`；未以管道尾部退出码推断成功。各层有重叠，不简单累加冒充独立覆盖总数。

## 真实主链证明与替身边界

复用真实 Cordis4.0.2 `Context.plugin`、assets apply/service registry、browser Host RPC、WebServer、SystemPrompt/Tools/Agents、真实 dsh-attachment-local0.1.5-rc.3 像素解码、同一 LibraryStore、受管文件/账本、changed、HTTP list/preview、dispose/remount。未替身 decoder、list、preview、registry 或 library 提交。

原探针公网主链依旧实际下载 W3C PNG `https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.png`，回执 `saved / ast_7f99b898 / fil_15f18a11 / lrev2`。list 恰1资产，preview200/image/png，读回字节由真实 decoder 再验证，changed ID/revision 与回执一致。错误 token 实际4002，不写库；真实临时配对只领取一次token；私网 literal 与额外path拒绝。完整 PNG 通过，短头和错 MIME 实际解码拒绝。

边界案例图片由 sharp 产生完整 PNG/JPEG，在原来已批准的外部下载 seam 注入；不是短头伪图。remote gateway/connection 仍为“调用即失败”的无关设施边界；没有把它冒充图片保存。额外外部 abort/timeout 时间归因两项明确替身 transport，只证明编排归因，不声称真实socket超时矩阵。

## Q1–Q5与OCR行为逐项复验

### Q1 · 根及片 symlink：PASS

首轮规格原句：「每次操作独占暂存区并负责清理…不得删除用户原文件」。原探针在隔离fixture把 stage根 symlink 到外部，当前返回 storage-failed（底层path-denied），外部 `old-slice/outside-sentinel.txt` 保留，symlink本身保留，未再saved；[日志:51–64](../evidence/browser-image-assets-v1/qa-round2-real.log#L51-L64)。

追加片级边界：只固定时间/随机数以命中生产生成的合法scope名，提前建立该片 symlink（根为真实目录）。调用真实 assets 服务，当前 `lstat` 拒绝为path-denied；库/list/revision/事件无变，symlink片和外部sentinel原样，外部无新增文件；[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L3)。这证明预存片拒绝与finally不跟随清理，不声称覆盖攻击者在每个syscall间替换路径的完整TOCTOU竞态。

### Q2 · 旧记录保留及第三次duplicate：PASS

规格原句：「文件缺失的既有记录不能作为成功证据」「账本、内存 revision 和受管文件失败一致性」。原探针真实ledger被临时目录占位导致rename/EISDIR，回storage-failed；旧记录保留、revision10→10，[日志:37–50](../evidence/browser-image-assets-v1/qa-round2-real.log#L37-L50)。

追加成功路径：first保存 `ast_582e3b96`，只删其QA受管文件；second保存 `ast_e6a566c2`，旧原始ledger记录所有元信息与assetId保持deepEqual，list如实显示missing_file_count1，新条目另建。第三次同源回duplicate，精确命中新assetId/fileId，revision3和事件均不再前进，HTTP preview200且字节相等；[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L4)。不把缺文件旧记录当假成功，也不借清残骸销毁记录。

### Q3 · 不同source并发同名提交一致性：PASS

规格原句：「不同图同名递增而不覆盖」。原探针两并发名称为 `race title` / `race title (2)`，均saved，handle不二义，[日志:34–35](../evidence/browser-image-assets-v1/qa-round2-real.log#L34-L35)。

追加6来源并发（交替完整PNG/JPEG）得到 `cross-source` 至 `cross-source (6)`，6唯一assetId/handle、6唯一提交revision；list增6、ledger.revision=list.lrev=9、changed增6，每回执ID/revision与对应事件相等。逐项核对ledger相对路径、实际文件字节与HTTP preview再解码，全部一致且stage清空；[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L5)。覆盖同活跃服务内并发，不扩成未承诺的跨进程锁保证。

### Q4 · 40字后缀和控制字符：PASS

规格原句：「显示名最长40字」「不同图同名递增」。原探针两来源40字标题均saved；当前实现为后缀预留长度，assets全量包含相应断言。追加真实decoder/服务保存 `a\u0001b-c` 后可列表名精确 `a b-c`，普通连字符保留、控制字符消失；[原探针](../evidence/browser-image-assets-v1/qa-round2-real.log#L36)、[新增边界](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L8)。

### Q5 · attachments后挂载：PASS

原探针browser先挂、真实attachments后挂，当前provider已发现，原RPC由永久unavailable恢复为invalid-url输入校验分支，[日志:80–81](../evidence/browser-image-assets-v1/qa-round2-real.log#L80-L81)。assetLibrary缺失→后挂服务也PASS。此处证明能力恢复，不把非法URL分支冒充晚挂载后的公网保存闭环。

### OCR · sourceKey trim：PASS

使用完整PNG经真实decoder验证，再调用真实服务传入带空白的64位key；raw ledger源精确为 `browser-image:`+规范key。随后无空白key回duplicate，assetId相同、list/revision/事件不变；[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L6)。

### OCR · 提交期间取消：PASS（公共seam实际提交，非真实断连接）

只在服务公共入口加观察包装：await真实服务完成磁盘/账本提交后abort，再返回原始真实回执。adapter返回cancelled；已提交 `ast_21fbe451 / fil_7c4024f9 / lrev11` 保留，changed1次，HTTP preview字节完整；新存活请求重试同源回duplicate，revision/事件不再前进。[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L7)。没有假ingest成功或回滚已落库资产。真实WebSocket连接代次断开时序、丢回执恢复仍未测。

### OCR · 外部取消早于timer：PASS（明确transport fixture）

外部先abort、transport60ms后reject、内部20ms预算先已到期，返回failed而非timeout；只有内部10ms预算时仍返回timeout。使用当前真实fetchMediaBytes函数，但transport为时间控制fixture；[结果](../evidence/browser-image-assets-v1/qa-round2-boundaries.log#L14-L15)。默认9秒、8MiB、5跳各真实网络组合未增加证据。

## 指纹核对

[开始manifest](../evidence/browser-image-assets-v1/qa-round2-fingerprints-before.json)与[结束manifest](../evidence/browser-image-assets-v1/qa-round2-fingerprints-after.json)涵盖原探针、整改报告全部十项源码/测试及额外assets/index；`changed=[]`。整改报告给出的每个完整SHA均与当前对应文件一致。核心摘要：

| 源码 | 当前SHA256（开始=结束=整改冻结值） |
|---|---|
| [image-ingest.js](../../plugins/omnimux-assets/src/image-ingest.js) | da9f049a4f4dd269f4a1faed2e2141a56bea5d374b82176e4fb1c4f5fbb6d717 |
| [browser/index.ts](../../plugins/omnimux-browser/src/index.ts) | 4ae9ce0f13dc525eab99fa580921f2b9d507e56da1b8c461e96d6a0ad74535e8 |
| [image-assets.ts](../../plugins/omnimux-browser/src/image-assets.ts) | ad57095adeca555d9a10b87036ca0491f5dc8584e8f62e82e9d9a97ca159bf8f |
| [media-fetch.ts](../../plugins/omnimux-browser/src/media-fetch.ts) | 101c7e4849a4c6e564e55cdb66281999048ae498cb6cfceb65f086798054416b |

## TDD整改原件核验：当前绿灯不补造历史

合同原句：「仅预约定接缝上先单个失败行为测试跑红再最小实现跑绿」。已逐份实际读取整改原日志，20份历史原件字节复制留存于 `qa-round2-tdd-*`，来源/指纹在[保全manifest](../evidence/browser-image-assets-v1/qa-round2-tdd-preserved-manifest.json)。**这些原日志未记录shell真实退出码/完整命令/切片源码快照，QA不事后写入推算exit，也不编造时序。**下面数字仅为日志runner输出。

| 整改 | 原日志观察 | 判定 |
|---|---|---|
| Q1 | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-q1-red.log) 1fail，末端ENOENT/lstat(stage已消失)；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-q1-green.log)1pass | 有单项红绿runner结果；red本身不直接证明“sentinel被删”，首轮真实probe独立证明高危。原shell exit未录 |
| Q2 | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-q2-red.log)2fail（1≠2/0≠1）；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-q2-green.log)2pass | 行为缺陷可见，但两项同跑，不能称逐单项切片 |
| Q3 | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-q3-red.log)1fail同名重复；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-q3-green.log)1pass | 单项runner红绿成立，缺原命令/exit/源码时序 |
| Q4 | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-q4-red.log)3项1pass2fail（控制字符、name-invalid）；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-q4-green.log)3pass | 两个新行为合跑，不是逐单项 |
| Q5 | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-q5-red.log)函数缺失；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-q5-green.log)仍1fail（fixture没assets）；[green2](../evidence/browser-image-assets-v1/qa-round2-tdd-q5-green2.log)仍1fail（cdn.example.com真实网络错误） | **整改报告把green2当exit0与原件矛盾**；后续[suite](../evidence/browser-image-assets-v1/qa-round2-tdd-q5-suite.log#L119-L125)才62pass。red未跑到业务行为，不作有效行为RED证明 |
| sourceKey | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-srckey-red.log)4项3pass1fail（带空白source）；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-srckey-green.log)4pass | 有目标行为RED，但非单项命令 |
| 提交后abort | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-abort-red.log)2fail：一项saved≠cancelled为业务RED，另一项fixture附带input导致exact断言不符；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-abort-green.log)2pass | 不能把两失败都算业务RED，也不是单项 |
| fetch外部先abort | [red](../evidence/browser-image-assets-v1/qa-round2-tdd-fetch-red.log)1fail timeout≠failed；[green](../evidence/browser-image-assets-v1/qa-round2-tdd-fetch-green.log)1pass | 单目标行为runner红绿；原exit/时序缺项仍保留 |

首轮bulk历史保持原结论：[初始assets RED](../evidence/browser-image-assets-v1/qa-round2-tdd-initial-assets-red.log)存在两有效library行为失败，但ingest模块不存在未执行行为；[初始browser所谓green1](../evidence/browser-image-assets-v1/qa-round2-tdd-initial-browser-green1.log)实际57pass4fail，含对象形状、Buffer断言和取消5秒超时，且已有实现。整改当前通过不倒推首次符合TDD。**过程证据仍 PARTIAL / 不合规历史保留**；后验新增QA探针不算实施TDD。整改报告的日志描述失实路由Engineer纠正报告，QA本岗不修改它。

## 第2轮 Known Issues与路由

1. **QA / 主理人授权**：Q6 [composition.spec.ts:322](../../plugins/omnimux-browser/tests/composition.spec.ts#L322) exact caps缺合法imageAssetSave:true；独立全量同样fail。保留既有断言，未经授权不改。整套回归不称全绿。
2. **环境 / 主理人**：[session-purge](../../plugins/omnimux-browser/tests/session-purge.spec.ts#L14)缺@deepseek-ai/dsh-workspace；[bridge-extension.e2e](../../plugins/omnimux-browser/tests/e2e/bridge-extension.e2e.spec.ts#L14)缺playwright-core，收集即失败，未开浏览器。未用旧版本伪装或新安装掩盖。
3. **Engineer（报告证据）**：Q5 green2实际fail，多项合跑及历史命令/exit/源码时序缺项；须按原件纠正整改报告，不能声明完整逐单项TDD。旧[image-ingest.js:12–13](../../plugins/omnimux-assets/src/image-ingest.js#L12-L13)注释仍称“移除残骸”，与当前保留旧记录行为不符，属文档遗留，不改变本次实际业务PASS。
4. **Frontend / 主理人后续终验**：本轮未测前端，首轮批准URL/token绑定与unknown/title四渠道待冻源证实；不以backend RPC通过或先前字典静态结果替代design、极简文案、无障碍/视觉终验。

## 未知、未覆盖与置信度

未知与有意未覆盖：真实Chrome/Firefox扩展点击、批准中切换目标/跨profile、worker回收/CORS/Origin完整运行、真实断连与丢回执、全部安全下载真实socket攻击/预算组合、实际功能截图、人眼复检、产品签收、当前分支提交/交付。实际同服务并发和隔离profile验证不扩成共享HOME多进程事务保证。

置信度：Q1–Q5与sourceKey/提交后abort的本报告限定行为为高（未改原探针、新独立隔离库、真实服务/decoder/list/preview、冻结指纹一致）；stage slice覆盖预存symlink而非完整主动竞态；external abort归因只对明确transport时间fixture。对真实扩展闭环与前端终验无本轮证据，置信度不评级为通过。

后续第一步：主理人读取本报告的Known Issues与TDD原件核验，将backend整改QA PASS和前端/浏览器/截图/OCR复审/PM未测项分轨；由实施者更正整改证据描述。**本岗本轮结束，不开新空间、不修实现、不做第3轮。V1完整交付与V2全部准入仍未获本报告批准。**
