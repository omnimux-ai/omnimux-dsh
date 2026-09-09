# Issue #760 三项审计修复独立 QA

## 结论

- **修复源码 Route: NoOne（限定本次 F1/F2/F3 离线验证面）**。未发现需产品返修的新缺陷；实际 hook/store 历史、过期 occupant、重复源及模拟 IME 补测通过。
- **整体 Route: Engineer；验收 BLOCKED / 不可关闭或全绿放行。** workflow 全包存在已独立证实的基线测试失败；当前固定提交没有合规 L2 环境与专项 ego-browser 证据。Engineer 负责基线夹具治理；主理人负责运行环境授权与后续独立 L2 QA。
- 未修改产品源码、已有测试或其他 Agent 报告；未 commit/push/merge/部署、未写共享 profile/凭据、未安装依赖、未调用模型。

## 身份与读取范围

- 审查树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audit-fixes-760`。
- Base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；code：`2ca3e8286dda317be0a6cdf2d5aa6829f2d98450`；final/实际 HEAD：`915198ce7592b17511c2c8746bf95f1f980e17ef`。
- 第一条 shell 包含 pwd；起始 Git clean。固定本地 SHA 审查，无 fetch/切分支。code→final 仅 89 行工程报告；base→code 审阅全部产品/测试 diff。
- 完整读取工程报告 `docs/implementation/issue-760-audit-fixes.md` 与主仓 `.worktrees/issue-760-independent-review/docs/qa/issue-760-independent-review.md`。读取适用 AGENTS、node-input-submission、plugin-qa、plugin-git-pr；加载 code-review-expert、omnimux-repo-workflow、ego-browser。workflow 子目录无更具体 AGENTS。
- Node v25.8.0。复用既有 node_modules 软链，不运行 pnpm/corepack/install，不改共享依赖。npm run 调用现有脚本；build 只写本任务 dist/lib。

## 实测精确计数

下列集合重叠，不能把通过数相加当独立总覆盖。未采集 coverage 百分比。

| 检查 | 实际结果 | 证据（相对任务树） |
| --- | --- | --- |
| 工程三文件集合 | exit0；15 tests /15 pass /0 fail /0 skip | `qa-edward-760-core.log` |
| 工程报告所列相关集合 | exit0；120 tests /4 suites /120 pass /0 fail /0 skip | `qa-edward-760-targeted.log` |
| workflow 完整包 | **exit1；1375 tests /79 suites /1374 pass /1 fail /0 skip** | `qa-edward-760-package.log` |
| base 固定树单跑 rootOwnership | **exit1；1 file-test /0 pass /1 fail /0 skip** | 本轮工具输出；base HEAD 同上 |
| 新独立 QA 第一次 | exit1；9 tests /7 pass /2 fail /0 skip；2项为 QA 前提错误，不是产品失败 | `qa-edward-760-boundaries.log` |
| 新独立 QA 第二次 | exit0；9 tests /9 pass /0 fail /0 skip | `qa-edward-760-boundaries-round2.log` |
| canvas + host typecheck | exit0 | `qa-edward-760-typecheck.log` |
| host/client/canvas build | exit0，三 bundle 写入成功 | `qa-edward-760-build.log` |
| Stage | exit0；10 Stages /8 registered targets | `qa-edward-760-verify-stage-contracts.log` |
| plugin boundaries | exit0；2210 source files | `qa-edward-760-verify-plugin-boundaries.log` |
| slot contracts | exit0；1670 files /0 violations | `qa-edward-760-verify-slot-contracts.log` |
| UI gates | exit0；279 views /0 violations | `qa-edward-760-scan-ui-gates.log` |
| git diff --check | exit0 | 本轮工具输出 |
| L2、真实 browser 专项 | **NOT RUN** | 无 run ID/截图，不制造证据 |

计数校正：工程报告已声明最后新增的顺序测试未进入其119及1374计数。因此固定 final 的实际对应数为120及1375，并非突然新增另一项测试回归。修复前“3业务失败”的工程历史：已核对工程报告及原审计的夹具/源码差异，本 QA 未回滚产品或再次执行修复前全三项，不将该历史声明改写为本轮亲测。

复跑命令：

```sh
node --test docs/qa/issue-760-independent-repro.test.mjs plugins/omnimux-workflow/src/canvas/editor/utils/occupantReplacement.test.mjs plugins/omnimux-workflow/src/shared/graph/textReferenceInput.test.mjs
node --test docs/qa/issue-760-edward-boundaries.test.mjs
npm --prefix plugins/omnimux-workflow test
npm --prefix plugins/omnimux-workflow run typecheck
npm --prefix plugins/omnimux-workflow run build
node scripts/verify-stage-contracts.mjs
node scripts/verify-plugin-boundaries.mjs
node scripts/verify-slot-contracts.mjs
node scripts/scan-ui-gates.mjs
```

相关集合在 `plugins/omnimux-workflow` 执行工程报告第70–77行原命令。基线命令在 `.worktrees/issue-760-independent-review/plugins/omnimux-workflow` 执行 `node --test src/canvas/rootOwnership.test.mjs`，仅读源码/现有依赖。

## 三项验证与行号

### F1：occupant 替换、Feed 与独立历史

- `SlotWells/SlotWells.tsx:183` 发出 replaceEdgeId；`MaterialNode/index.tsx:870` 转发；`hooks/useResourcePicker.ts:82,124,136–148` 采用 replace 模式、提交时最新 store、替换前 snapshot、成功后强制历史。
- `utils/resourcePickerPolicy.ts:683–722` 按当前 named binding 的 edgeId 定位，拒绝消失身份/多选/重复来源；保持 strip 顺序、旧供给边与待命列表。
- `shared/graph/feedSlot/autoFillSlots.ts:16,22–52`：显式装填仍优先，只有自动填槽排除 standby；`canvasSlotRecompute.ts:53`、`connectionValidator.ts:49–51` 消费同一字段。
- 15项现有测试覆盖容量2/3/null×已连/新源、JSON重载和重选旧源、自动occupant顺序、本地文件原子加入、循环原子拒绝、过期与重复拒绝。
- 新增独立测试使用**实际 useResourcePicker + 实际 canvasStore**（仅 presentation toast/i18n stub），6项覆盖已满/未满/未知容量×Feed/新源，验证连续两次替换在debounce内分别 undo/redo，完整 nodes+edges 精确快照复原，包括 standby、prompt、Feed边。
- 另外2项验证 duplicate 与删除occupant后零图/历史写入，以及取消后保留的旧 callback 无效。
- QA首轮两失败原因：对未满/未知容量，hydrateGraph 正常把普通已连 C 自动入槽，违反测试“C只是Feed待命”前提；产品正确拒绝重复occupant。仅修 QA fixture 为显式 standby C，第二轮9/9通过。没有降低业务断言或改产品。

### F2：文本 token 不变成真实本地要求

- `shared/graph/generationPrompt.ts:6–10` 仅剥离 slotIndex=-1 的文本 token，保留真正本地文字与媒体标记。
- 现有实跑断言核对 UI localText 空、有效正文就绪、重复文本引用不复制正文，两份上游按顺序为“第一句\n\n第二句”；追加“温柔一点”明确拒绝且 submit 计数不增加。单文本的真实 executor 合成网关捕获也通过。
- 这是离线请求组装证据，不是 live TTS 或真实浏览器提交证据。label 含 `]` 的既有协议限制不扩修。

### F3：未改 prompt 的媒体刷新与 composition

- `PromptTokenEditor.tsx:248–265` 原位更新 media；`:430` compositionend 处理输入并同步最新引用；原token span、文字节点及删除事件不被重建。
- 现有实跑用例验证 old→new、image→icon→image、collapsed selection 与模拟composition延迟。
- 新独立第9项同时保留2个token，composition期间模拟输入“中文”并连续两次更新references；结束只采用latest媒体，序列化保留中文、同一text/span、非折叠选区2..5保持；媒体更新后点击旧删除按钮仍有效。
- JSDOM证明事件及DOM对象行为；**不证明真实中文IME、原生浏览器selection、真实hover/窄屏geometry**。

## 已知失败与未完成项

### K1：基线 rootOwnership 夹具构建失败，不是本次产品回归

- `plugins/omnimux-workflow/src/canvas/rootOwnership.test.mjs:15` mock仅export jsx，而实际 @xyflow/react 导入jsxs、Fragment。
- final日志第877–895行：`No matching export in "test:react/jsx-runtime" for import "jsxs" / "Fragment"`。
- 固定base同命令同2项export错误、1个file-test失败；该测试base→final零diff。业务test未进入，不能叫产品ownership行为失败。
- 不修改他人既有测试。Route Engineer治理该baseline夹具后重新过完整包；不掩盖为全包PASS。

### K2：没有本任务合规 L2，可复用旧环境核查结果为否

- 只读 `ego-browser listTaskSpaces()` 成功，返回70/71/73/76/79，均非本任务；未claim、未新建任务、未操作其页面。
- 本审查树不存在 `.l2-dev.env`；全仓该文件搜索仅找到其他任务assets-storage-766，不能借用其SOURCE/profile证明当前提交。
- 发现旧 `~/.dsh-dev/tasks/slot-mention-menu-760`：只含旧settings/凭据文件与**空profiles目录**。仅列目录/元数据，未读凭据内容；不是已启动、绑定本树final SHA的运行环境，不能因名字相同而复用认证。
- `scripts/dev-env.sh:521–537,678` 启动路径包含任务凭据初始化；本轮明确无新增凭据初始化/部署授权，未调用start，不移除viewer，不改seed，不开私有harness，不创建pending probe假装通过。
- 最小前置：由主理人取得并下发**准确本任务隔离L2启动及必要凭据初始化授权**，或提供已合规初始化且绑定本树final的 `.l2-dev.env`/profile/Host；保留viewer与正式受管依赖。端口44201–44299，最多一个在研workflow link，SOURCE/COMMIT/Host身份严格一致。
- 后续独立QA按正式ego登录模块与共享verify:live同一task/tab执行，再补真实strip替换/撤销/重做/保存刷新、未改prompt媒体更新/原生中文IME、离线合成请求捕获和真实要求零submit。不得真实生成/付费。当前无需要等待的后台任务。

## 交付状态

仅新增 `docs/qa/issue-760-edward-boundaries.test.mjs` 与本报告；原工程/审计报告及产品源码未改。产品返修0轮；新增QA夹具运行2轮，未进入第3轮。最终全部后台build/test/typecheck已收集。代码离线审查完成，整体运行验收与baseline门禁仍未完成。
