# Issue #760 独立 QA：第一轮与第二轮

> 最新结论见文末「第二轮最终本地 QA」：源码 Routing Decision **NoOne**，离线检查通过；**整体仍 BLOCKED，不是交付 PASS**。第一轮记录保留为历史证据。

## 结论

- **Routing Decision: Engineer**（经主理人回传）；**源码验收 FAIL，整体不放行**。
- **L2 / ego-browser / verify:live: BLOCKED**，与源码失败分别记录。不得合入、部署或关闭 Issue。
- 完整 Stage 门禁独立通过：**10 Stage components / 8 registered sidebar targets，exit 0**，包含 market。
- 本轮定向测试：**68 tests / 2 suites，66 passed / 2 failed / 0 cancelled / 0 skipped，exit 1**。其中新增独立 QA 4 项，2 通过、2 失败；既有相关回归 64/64 通过。
- 不计算覆盖率：未运行 coverage instrumentation；不得把 68 项或历史全包数字当作 UI 验收覆盖率。
- 本轮只运行一次定向测试轮次，未修源码、未进入工程修复后的第二轮。

## 身份与边界

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760`。
- 分支：`agent/workflow-slot-mention-menu-issue-760`。
- 指定且本地复核的 fetched base / origin/main：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。
- 目标 HEAD（起止一致）：`ca83e4579fbb8e47b9d4170b46faa05be8f57c83`。
- 两个真实提交：`10568d418d31e20eaf49909a1c40d0e092179c1f`（实现），`ca83e4579fbb8e47b9d4170b46faa05be8f57c83`（音频计数整合回归与实现说明）。本轮未 fetch，没有声称这是审查时最新远端 tip。
- 审查起始 tracked/untracked clean，ahead 2；18 个变更文件。审查了实现提交的运行代码、测试和后续提交的实际 diff，而非仅复述工程报告。
- 已完整读取前序 `docs/implementation/issue-760-slot-mention-menu.md`。加载 repo workflow、plugin-dev、code-review、engineering-workflow、worktree-ops、ego-browser skills，以及 AGENTS、plugin-qa、node-input-submission、Git/PR、design、UI guidelines。最初读取的主工作区五份合同/设计文档，已以字节比较确认与任务树对应文件相同。
- 未修改源码、合同、脚本、manifest、lock、依赖链接目标或 profile；没有 install、push、commit、merge、deploy、模型调用、L2 重启或 ego 空空间创建。
- 本轮新增文件仅本 QA 说明和 `plugins/omnimux-workflow/src/canvas/editor/components/PromptTokenEditor/issue760.qa.test.mjs`。既有 Stage 脚本生成本任务树忽略的 `plugins/omnimux-market/lib/client.js`。

## 独立发现与重现

### QA-760-01 / P2：insertToken 使用旧输入光标覆盖当前有效光标

**位置**：`plugins/omnimux-workflow/src/canvas/editor/components/PromptTokenEditor/PromptTokenEditor.tsx:271,300–302`，`insertTokenImpl`。

**重现（公开组件 API，真实实现加载到 JSDOM）**：
1. 编辑器内输入 `abcdef`，触发 input，光标在 offset 6。
2. 不产生新 input、不 blur，使用鼠标/方向键对应的 Selection 改变把实际光标移动至 offset 2。
3. 调用已公开的 `ref.insertToken(referenceToken('image', 'image.png', 'image'))`。
4. 期望提交：`ab@ref[image:-2:image.png] cdef`；实际提交：`abcdef@ref[image:-2:image.png] `。

**原因**：`caretRangeRef` 仅由 input/blur 刷新，插入时 saved 优先于仍处于编辑器内的 active Selection。新增缓存使公开插入 API 在光标移动后回到旧位置。菜单的 query Range 应保持优先，但非菜单插入应优先有效 active Selection，只有焦点已离开才用保存位置。

**证据边界**：这是确定的组件 API 错位，不声称所有鼠标点击槽都失败。新增对照测试验证了 blur 后保存正确光标的路径通过；浏览器原生 click/focus 时序仍待 L2。测试 `slot insertion uses current caret after keyboard or mouse relocation without new input` 失败，`slot insertion after blur preserves the last actual editor caret` 通过。

### QA-760-02 / P2：右边缘预览按错误宽度避让，脱离锚点垂直通路

**位置**：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotHoverPreview.tsx:29,52`；共享计算器 `cfg/viewportPositioner.ts:69–76`。MentionPopover 根菜单也使用相同“先 360 定位再缩 280”的模式，工程师应一并评估，但本轮失败断言仅针对预览。

**重现（确定坐标输入，实际组件样式输出）**：
1. viewport = 1000×800；槽 rect = left 950 / right 994 / top 600 / bottom 644。
2. 渲染 ready 图片的 hover preview。
3. 定位器按 360px 算出 left 628；组件随后把真实 width 限成 240，最终 footprint 为 **[628,868]**。
4. 与槽 **[950,994]** 完全不重叠，横向空白达 82px。期望使用实际 240px 宽度计算右边界避让（如 left 748 / right 988），在不溢出视口的同时保留与锚点重叠的上方通路。

**影响**：右侧槽上方并非浮层，鼠标必须额外斜向/左移穿过更大的无交互区域；现有只有 180ms 超时，不是几何 hover bridge。破坏靠边布局下“上方替换、跨间隙可达”的设计意图。中心槽对照通过。应让真实宽度参与 positioner，不能只在定位后缩宽。

**证据边界**：测试证明的是组件输出坐标和锚点脱离，不是实测慢速鼠标必然消失，也不冒充截图、computed-style 或浏览器视觉证据。最终 hover 路径、画布缩放/平移及各边界仍必须在 L2 补验。

## 命令与实际结果

### 1. Git 与写入路径

任务根执行：

```sh
git status --short --branch -uall
git rev-parse HEAD
git log --oneline 5485c25875cb9f71d7cb78a6aa69d07e07fffbab..HEAD
git diff --stat 5485c25875cb9f71d7cb78a6aa69d07e07fffbab..HEAD
git diff --check 5485c25875cb9f71d7cb78a6aa69d07e07fffbab..HEAD
```

均正常。Node `fs.realpathSync` 核对根/hub/workflow/market node_modules 指向主工作区依赖，全部只读；`plugins/omnimux-market`、其 `lib`、workflow `dist/lib` 的 realpath 均为本任务树，不是软链。market/client.js 运行前不存在，输出父目录真实位于任务树，`git check-ignore` 确认该产物忽略。

### 2. 完整 Stage 检查（本轮新执行）

完整读取原 `verify-stage-contracts.mjs`、`live-stage-contracts.mjs` 与 market `concat-client.mjs`，确认 bundle write:false、最后仅写任务 market/lib/client.js 后，在任务根执行：

```sh
NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=$PWD/plugins/omnimux-market/lib --allow-child-process --allow-worker --allow-addons" npm --logs-max=0 run verify:stages
```

结果：**exit 0**；`PASS: 10 Stage components; 8 registered sidebar targets and their runtime contracts.`

后台 job `bash-69` 已收集并结束。Node 输出 allow-addons/child-process/worker 的 SecurityWarning；这是 Node 自身提醒，文件权限旗标不等同 OS 沙箱，安全性同时依赖已读取脚本及真实落点审计。没有借 Node native 子进程对外写入的任务操作。

### 3. 本轮定向回归

在 `plugins/omnimux-workflow` 执行：

```sh
node --test \
  src/canvas/editor/components/PromptTokenEditor/issue760.qa.test.mjs \
  src/canvas/editor/components/PromptTokenEditor/referenceCandidates.test.mjs \
  src/canvas/editor/components/PromptTokenEditor/referenceInteraction.dom.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs
```

结果：**68 / 66 pass / 2 fail / 0 skipped / 0 cancelled；exit 1**；duration 571.126208ms。后台 job `bash-75` 已收集并结束。未把失败屏蔽为 todo/skip，未通过改断言迎合错误实现。

已有回归实际通过内容：当前绑定+上游候选、全部图片/文本发现、未就绪/成环标识、已有源不重边、共享 mutation 成功及自连/成环/缺节点原子拒绝、图历史 undo/redo、负数 token 身份、空 prompt/真实 @ 保存、两级键盘/IME 防误选、Delete 原子删除、失败编辑器恢复，以及 First-N、Feed 超量、合成请求仅槽内图像+全部上游文本+本地要求。

### 4. 复用且明确来源的证据

- 工程师全包日志 `plugins/omnimux-workflow/dist/issue-760-tests.log` 第 1770–1777 行独立读取：**1273 tests / 79 suites / 1273 pass / 0 fail / 0 cancelled / 0 skipped**。这份历史结果发生于本轮 QA 测试加入前，本轮没有重跑全包，也不能覆盖新增失败。
- 工程师报告提供的 workflow 三段构建、双 tsc、i18n（8 locale/12 manifests）、边界（2125 files）exit 0 在运行源码未变化的本地 target 上复用；本轮没有把它们写成自己重新执行的命令。
- workflow 三个已存在产物真实大小与工程报告一致；保留 #759 countOverride / 10000 / 唯一计数器及超限 class，相关整合用例本轮重跑通过。音频 policy 源码未出现在任务 diff。

产物 SHA-256（本轮读取，不代表浏览器加载证明）：

| 任务树相对路径 | bytes | SHA-256 |
| --- | ---: | --- |
| plugins/omnimux-workflow/dist/index.js | 1474842 | c9d202188510cd45bca71729d022fa76a1e88fa1f3dcb4cbb8dcb2a4313d7632 |
| plugins/omnimux-workflow/lib/client.js | 129883 | ae94b996be79902c55f29cae13b20f1a93e8557f7ef89bf50e9650b9df81fa08 |
| plugins/omnimux-workflow/lib/canvas.js | 2091494 | efa0f6d02efd2ad36c5a9d5ec2c213bd2ef4c7de902539ed91b2122f0aa16666 |
| plugins/omnimux-market/lib/client.js | 217813 | 37d25f81ec30a79ad515458f0ab5500aa5d66fcb13f098119cb757b30f686847 |

工具版本：Node v25.8.0 / npm 11.17.0。

## L2 环境阻断与必需未验收项

- 主理人已执行正式 `dev-env start`，受管 seed 校验失败且没有启动 Host；此为前序提供事实，本轮未重复启动。
- 本轮只读确认 `/Users/x/.omnimux-dev/profiles/omnimux/package.json:33` 的 `@crosery/dsh-viewer` 仍是指向外工作区 backup tgz 的绝对 `file:`。不符合 `scripts/dev-env.sh:293–294` 精确受管目录规则。
- 显式 `OMNIMUX_L2_SEED_PROFILE` 未设置，DSH_HOME 为 `/Users/x/.dsh`；只读检查这个历史候选，其 `profiles/omnimux/package.json:5` 起仍为 `file:./node_modules/...`，也不符合规则。因此**在检查过的允许候选中未发现真正受管可用替代 seed**；没有穷举机器或把 Prod 当替代。
- 未读取/修改 Prod；未复制手改 seed、修改脚本绕过验证、安装依赖、读取认证密钥、创建 ego 空空间。前序空间 12 已 done=true 关闭由主理人提供，本轮无新增空间。

以下是必需而非可选剩余验收：

| 面 | 缺失证据 |
| --- | --- |
| L2 身份 | 当前修复后 SHA 的 .l2-dev.env / SOURCE / PORT / PROFILE / Host PID 同次绑定 |
| 实际 Stage | ego-browser 正式 verify:live 同次探针、runtime bundle proof、真实可解码 PNG |
| 槽与预览 | 44×44 computed geometry；横/竖/长图 contain；长文件名无 title 遮挡；替换按钮不裁切；正常/慢速跨间隙；四边、缩放/平移与视口变化 |
| 两级菜单 | 真实鼠标分类到子级路径、滚动、边缘避让；实际输入法 composition；上下左右/Enter/Esc |
| 光标/原子编辑 | 中间插入、选区替换、blur 再插入、连续两次引用、Backspace/Delete |
| 事务与持久化 | UI 选择已有/新增/未就绪来源，拓扑拒绝，无重复边，真实撤销重做、保存关闭再开，参考列表与图一致 |

普通插件 Client/Stage 改动不要求额外 Electron-only 证据；不新增真实模型生成作为此次 UI 验收条件。

## 下一动作与关闭条件

1. 主理人将两个源码发现与本测试文件回传工程师；只在原授权任务树修复，勿由 QA 改源码。
2. 修复后进行第二轮独立回归，重跑新增 QA 与必要影响面；禁止以历史 1273/1273 抵消失败。
3. 主理人协调 seed 所属负责方通过正式受管物化解决环境问题（不在本 QA 范围内），再开展正式 L2/ego-browser 全部必需验收。
4. 两项源码问题和 L2 证据都未关闭，当前 **not ready to merge / close**。本轮未提交，两个临时 jobs 均已终止状态，无持续后台任务。

---

## 第二轮最终本地 QA（2026-09-08，测试 07:54–07:58 +08:00）

### 最终结论

- **源码 Routing Decision: NoOne**。首轮 QA-760-01、QA-760-02 已修复；原独立 QA 断言未修改，4/4 通过。四份运行源码修复 diff 及新增 12 项边界测试经独立读取复核，本轮未发现需退工程的未决源码问题。
- **离线状态：通过**。workflow 全包 **1289 tests / 80 suites，1289 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo，exit 0**；扩展定向 **114 tests / 6 suites，114 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo，exit 0**。114 是全包子集，不与 1289 相加。
- **完整 Stage：10 components / 8 registered sidebar targets，exit 0**，含 market，本轮原命令重新执行，无过滤、无替代门禁。
- **整体验收：BLOCKED；not ready to merge / close，不是交付 PASS**。L2 / ego-browser / verify:live 的受管 seed 阻断仍未解除。本轮只完成第二轮最终本地回归，不以本地全绿代替必需 runtime 证据，不进入第三轮 QA。
- 未运行 coverage instrumentation，不提供猜测百分比；DOM 组件测试不等于浏览器原生 Selection/IME、computed geometry 或真实 hover 路径覆盖率。

### 审查身份与改动约束

- 固定 base：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。
- 起止 HEAD：`ca83e4579fbb8e47b9d4170b46faa05be8f57c83`；分支 `agent/workflow-slot-mention-menu-issue-760`，ahead 2。目标为 **该 HEAD 加未提交 diff**，不是 clean HEAD，也不是新获取的远端 tip；本轮没有 fetch。
- 初始及测试后 dirty 清单一致：5 个 tracked 修改（实现说明及四份修复运行源码），3 个 untracked（本 QA 报告、首轮 `issue760.qa.test.mjs`、工程 `referenceBoundaries.dom.test.mjs`）。本轮只更新 QA 报告，其他 tracked/untracked 文件均不修改。
- 四份运行源码未提交 diff 测试前后逐字节 `cmp` 一致；其快照 `plugins/omnimux-workflow/dist/issue-760-qa2-source-before.diff` SHA-256：`8ff1abe878a9a48e0056160998c5345ce14341a610d8e737f8ae7dabcb599281`。
- 首轮 QA 文件 SHA-256 起止相同：`f6476796875e50fb195875d94c0e9d878025db5e7ee27c0c914a347f2d5c8463`；新增工程边界测试起止相同：`77a8acbefef6eac2b165eb385b431ab0ceba943b858be680dd2bef0574cf2bdb`。
- 唯一操作工作树保持本报告所列绝对路径。依赖链接仅只读使用；workflow dist/lib、market lib 和本轮临时目录的 realpath 均在任务树内。未 install、改源码/测试断言/配置/门禁、写其他 workspace/profile、push、commit、merge、deploy 或调用真实模型。

### 两项修复及影响面复核

| 发现 | 第二轮证据 | 状态 |
| --- | --- | --- |
| QA-760-01：旧缓存覆盖当前光标 | `PromptTokenEditor.tsx:300–309` 对 query/live/saved 三候选均验证 Range 起点与终点在编辑器中，并克隆后插入；优先级为合法 query → 合法实时 Selection → 合法保存 Range → 尾部。原 offset 6→2 用例现在提交 `ab@ref[image:-2:image.png] cdef`；blur 对照、非折叠选区、外部/跨编辑器选区、query 优先、composition 生命周期、连续两次插入全部通过 | 已关闭 |
| QA-760-02：右边缘预览实际宽度与避让宽度不同 | `cfg/viewportPositioner.ts` 新可选 `preferredWidth` 默认 360；预览传 240，根菜单传 280，返回同一 width 用于渲染。1000×800、槽 [950,994] 的计算结果为 [748,988]，不再是 [628,868]；两份既有默认宽度定位器测试、预览左/右/窄屏/顶部翻转、根菜单 1000/220px 边界全部通过 | 已关闭 |

本轮同时通过候选来源/未就绪/成环原因、原子连边及 prompt patch、已有源不重边、失败回滚、token 身份、历史 undo/redo、First-N Slot 容量及执行请求内容回归。音频权威计数 0/10000/10001、唯一计数器和超限态测试保持通过。保留 180ms 离开延迟不是新增几何 hover bridge，不能据坐标通过宣称慢速鼠标已验收。

### 标准测试与文件写入边界

- 完整读取 `executionMediaSource.test.mjs`：`fixture()` 以 `mkdtempSync(join(tmpdir(), 'media-source-'))` 建根，`outside.png` 和 `media/escape.png` 的 symlink 均在此根内，结束时清理。
- 完整核对 `m2-fixes.test.mjs` symlink 路径及宿主：`makeHarness()` 以 `mkdtempSync(join(tmpdir(), 'omnimux-workflow-m2-'))` 建根，`secret-outside.txt`、`media/escape.txt`、`media/alias.svg` 和真实目标都在此根内。`outside` 只相对于测试 media 根，不是其他 workspace 文件。
- 本轮 `TMPDIR` 为任务树 `plugins/omnimux-workflow/dist/qa2-tmp`；没有使用 `--permission`、`--allow-fs-*`、registerHooks 或人工 Node 权限包装，启动环境 `NODE_OPTIONS` 为空。允许原测试正常创建自身夹具及其 symlink，不经过依赖链接写目标。
- 两项原工程失败现在均进入断言并通过：`media traversal, symlink escape and unknown previews fail closed`（全包日志 1403 行）、`QA③ media route resolves symlinks (realpath) -> escape refused`（1543 行）。工程此前 `ERR_ACCESS_DENIED: fs.symlink API requires full fs.read and fs.write permissions` 是自加 Node 权限模式造成，**不是本轮真实 sandbox 阻断，也不再是未决测试问题**。
- Stage 脚本完整读取：其内存 bundle 为 `write:false`，market 真实 concat 仅写任务树 `plugins/omnimux-market/lib/client.js`，属于本轮获准忽略产物。

### 实际命令、计数与退出码

以下所有命令在指定任务树执行。Node **v25.8.0** / npm **11.17.0**；`npm --logs-max=0` 只禁止 npm 全局日志保留，不改变 package 脚本或测试权限。日志管道均设置 `set -o pipefail`，退出码不是 `tee` 掩盖的结果。

workflow 包目录：

```sh
set -o pipefail
TMPDIR="$PWD/dist/qa2-tmp" npm --logs-max=0 run test 2>&1 | tee dist/issue-760-qa2-tests.log
TMPDIR="$PWD/dist/qa2-tmp" node --test \
  src/canvas/editor/components/PromptTokenEditor/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/viewportPositioner.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/viewportPositioner.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs \
  src/canvas/i18n/*.test.mjs 2>&1 | tee dist/issue-760-qa2-targeted.log
TMPDIR="$PWD/dist/qa2-tmp" npm --logs-max=0 run typecheck 2>&1 | tee dist/issue-760-qa2-typecheck.log
```

任务根：

```sh
set -o pipefail
TMPDIR="$PWD/plugins/omnimux-workflow/dist/qa2-tmp" npm --logs-max=0 run verify:stages 2>&1 | tee plugins/omnimux-workflow/dist/issue-760-qa2-stages.log
npm --logs-max=0 run lint:i18n 2>&1 | tee plugins/omnimux-workflow/dist/issue-760-qa2-i18n.log
npm --logs-max=0 run check:boundaries 2>&1 | tee plugins/omnimux-workflow/dist/issue-760-qa2-boundaries.log
git diff --check 5485c25875cb9f71d7cb78a6aa69d07e07fffbab
```

| 检查 | 本轮结果 | 证据 |
| --- | --- | --- |
| workflow 全包原 test 脚本 | 1289/1289，80 suites；exit 0；13243.341333ms | `dist/issue-760-qa2-tests.log:1788–1795` |
| 定向原 QA + 工程 12 项 + 相关回归 | 114/114，6 suites；exit 0；7515.72125ms | `dist/issue-760-qa2-targeted.log` |
| 完整 verify:stages | 10 components / 8 targets；exit 0 | `dist/issue-760-qa2-stages.log` |
| 双 tsc --noEmit | canvas + host；exit 0 | `dist/issue-760-qa2-typecheck.log` |
| lint:i18n | 8 locale files / 12 manifests；exit 0 | `dist/issue-760-qa2-i18n.log` |
| check:boundaries | 2127 source files；exit 0 | `dist/issue-760-qa2-boundaries.log` |
| base 到当前 tracked diff --check | exit 0 | QA 前后执行；本报告额外核对无尾随空白及无失效本地链接 |

表中 dist 路径均相对于 `plugins/omnimux-workflow/`。全包指 **workflow package 的全部测试**，不是根目录 `test:all` 或其他业务包全测。

### 构建证据复用

本轮没有重新构建；复用工程反馈修复后原 host/client/canvas `npm --logs-max=0 run build` exit 0。独立核对三个产物 mtime 均为 2026-09-08 07:49:59 +08:00，晚于四份修复源码（07:46–07:47）；本轮未改源码，双 tsc 新执行通过。mtime/文件指纹用于本地证据绑定，不代表浏览器已加载。

| 任务树产物 | bytes | 本轮 SHA-256 |
| --- | ---: | --- |
| plugins/omnimux-workflow/dist/index.js | 1474842 | c9d202188510cd45bca71729d022fa76a1e88fa1f3dcb4cbb8dcb2a4313d7632 |
| plugins/omnimux-workflow/lib/client.js | 129883 | ae94b996be79902c55f29cae13b20f1a93e8557f7ef89bf50e9650b9df81fa08 |
| plugins/omnimux-workflow/lib/canvas.js | 2091544 | 5f8f86a08182240ab85f27d118424b352190de360ea610b5ebd8df2735ca134e |
| plugins/omnimux-market/lib/client.js | 217813 | 37d25f81ec30a79ad515458f0ab5500aa5d66fcb13f098119cb757b30f686847 |

canvas 指纹不同于首轮，正确对应修复后产物；host/client 未受本次修复影响。

### Known Issues、runtime 差距与下一负责人

- **本轮未决源码 bug：无新增，首轮两项已关闭。** 兼容边界仍保留实现说明披露的未转义 `]` 文件名序列化限制；本轮没有扩展协议，也不宣称所有任意文件名均可无损引用。
- **真实整体阻断：受管 L2 seed 不可用**。前序已确认 Dev viewer 是指向外工作区 backup tarball 的绝对 `file:`，不符合正式 seed 规则。本轮按明确边界未重复启动、未重新探查/改写共享 profile、未 Dev 物化、未建立替代 seed、未创建 ego 空空间。
- 缺失项仍是第一轮 runtime 表的全部适用证据：当前修复身份绑定的 `.l2-dev.env`/Host/profile、正式 ego `verify:live`/runtime bundle proof/可解码 PNG、44×44 与 contain 实际几何、替换按钮和正常/慢速 hover 跨间隙、四边/缩放/平移/resize、真实鼠标两级菜单及输入法、原生选区/原子编辑、真实图撤销重做与刷新持久化。离线对应回归通过不消除这些缺口。
- 下一负责人为主理人：完成本地准备，向用户准确说明缺失环境授权，由 seed 所属负责方在正式边界内解决受管环境后，另行安排必需 L2/ego 验收。本轮不请求扩大子代理权限，不自行工程修补或进入第三轮测试循环。
- 本轮后台 jobs `bash-104`、`bash-105`、`bash-106`、`bash-107`、`bash-108` 全部收集，均终止且 exit 0；没有持续后台任务。忽略日志、diff 身份快照及 `dist/qa2-tmp` 内少量测试遗留/Node compile cache 保留在任务树，未清理其他任务文件。未提交。
