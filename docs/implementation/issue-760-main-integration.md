# Issue #760：最新主干整合与离线验证

## 最终同步与重验身份（15:24 +08:00，覆盖下方历史身份）

- 最后一次主动 fetch 获取 **base `0fe89ef047c687d156204fa48a177d92d590c6a4`**，新增 #780 / #782 STT 修复：8 文件（+496/-55），hub 公网 URL-first/本地文件 fallback 及其测试、workflow CHANNEL_UNAVAILABLE → 503 与一项回归。完整审查运行 diff；任务相对 base 的 hub diff 为零，没有覆盖并行修复。
- 第三次从 clean `732c53bf79903921f4d1317b1f91a87d44604d83` rebase，同样无冲突；六项 range-diff 全部等价，最终被测 HEAD **`9ceccf5fbfabd7c940d0b727da0d8dd43d50bed3`**，源码 tree **`4d1488a42ba57442647d8a6b856fde15220888bd`**，ahead 6 / behind 0、clean。最终交付再追加本节 docs commit，运行源码 tree 不变。
- 旧四项任务提交最终对应 `1fad905bc37364224ed67fc3e6481078388c803d`、`5c769f400effe174e09763eb265f4f5115b831da`、`aaf368c33010ff65645a50a2e68816bca8fcaf4d`、`f3e2894d9c7baf429007f3a764ba8022707d786e`；两项整合报告提交对应 `42e5a12490f96bfc652e7a05279f4dfaad6c6940`、`9ceccf5fbfabd7c940d0b727da0d8dd43d50bed3`。
- 源码身份已变化，因此 15:24 **重新执行**原 build、双 tsc、完整 workflow test、i18n、完整 Stage、边界与 diff 检查，全部 exit 0。原命令和 TMPDIR 不变，仍无 Node 权限包装。最终全包 **1290 tests / 79 suites / 1290 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**，5622.070791ms；新增加的 STT 503 测试在全包内。完整 Stage **10 / 8**，i18n **8 / 12**，边界 **2126 source files**。
- 最新日志为 workflow `dist/issue-760-final-{build,typecheck,tests,i18n,stages,boundaries}.log`；全包计数位于 tests.log:1788–1795。下方 168 项定向是首轮实跑子集，相关引用/音频面板测试在最终全包再次执行，不额外累加计数。未运行 hub 全包或真实 STT 请求，不借其他任务运行证据冒充本轮实测。
- 最新 host 产物 1475194 bytes，SHA-256 `b1f01ea3b12b8f03de44c4115748ed3639e88a1fa94fab08bfbddb966cb0b08a`；client 129883 bytes 与 canvas 2087641 bytes，hash 与下方首轮产物相同。原三个 build、最终双 tsc 均重新通过。
- **IS_PASS: YES（主干整合与离线），待独立 QA；runtime 仍未验收。** 只读依赖、唯一任务树写入、不碰 #778、不 push/PR/merge/部署等边界完全保持。主干可继续并行前进；本报告只对上述明确 fetch tip 与被测源码身份负责。

## 第二次同步身份（15:22 +08:00，历史）

- 收尾 fetch 又获取 `537e80e5eb79b2d4344522047917f5cc36c4bb9e`（#779 / #781）。完整审查实际 diff：仅 `scripts/guard-worktree.mjs`、其测试、`scripts/simulate-multi-agent-lifecycle.test.mjs` 与 #779 两份报告，共 5 文件（+425/-34）；无 #760 交集，无 #778 实现。
- 第二次 rebase 从 clean 的 `060369d32e46a4472d0ce5f73644415a7bb484f5` 到新 base，一次成功、无冲突；结果 `f4cc54d6a7406edbb87812d458cd3989e1a54a60`，ahead 5 / behind 0、clean。`range-diff` 五项全部等价：`befdfda → 57d40a8`、`bedc22d → 3ebc4d6`、`cc532a0 → 75597fa`、`3128642 → 8cf72d6`、`060369d → f4cc54d`。
- **最终 base：`537e80e5eb79b2d4344522047917f5cc36c4bb9e`**；最终交付在 `f4cc54d` 上另加本节的 docs commit，准确 SHA 由 `git rev-parse HEAD` 获取。
- 最终 workflow `src` tree 仍为 `35561612ea544fac5b9584e777d614f349223e22`，workflow 配置、构建、Stage/i18n/边界脚本均无变化。下文 `5802349 → 3128642` 是本轮实际执行的完整离线证据，最终按相同源码与环境复用，不声称重跑于最终 commit。新 base 到 HEAD 的 `git diff --check` 再次通过。
- 未修改或部署同步引入的既有主干 guard 修复，未把 #779 报告内历史测试计成本任务新实跑；不因无关 guard 同步无条件重复 workflow 全包与 Stage 验证。独立 QA 应绑定最终交付 SHA 和上述最终 base。

## 首轮结论与授权范围

- **IS_PASS: YES，仅指本次主干整合、工程全局一致性与离线验证。** 无文本冲突，无新增运行源码或测试修改；四个既有任务提交已完整 rebase。
- **待独立 QA；整体仍 not ready to merge / close。** L2 / ego-browser / verify:live 未执行；正式受管 seed 的恢复归属 #778，本任务明确不重试、不实现纳管、不把 DOM/Stage 测试冒充 runtime 验收。
- 唯一工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760`；分支：`agent/workflow-slot-mention-menu-issue-760`。
- 本轮只执行获准的 fetch、任务分支 rebase、本地 commit 与离线验证；未 push、建 PR、merge、部署、安装依赖、修改 Dev/Prod/profile/官方源码，未触碰 `.worktrees/managed-tarball-778`，未编辑或清理主 checkout 的 Market/Hub 他人改动。
- 已先完整读取 [原实现说明](issue-760-slot-mention-menu.md)（195 行）与 [原独立 QA 报告](../qa/issue-760-slot-mention-menu.md)（249 行）；原报告保持历史证据，未改写。

## 精确 Git 身份

| 身份 | SHA / 结果 |
| --- | --- |
| 起始 HEAD | `ff048e9303e5e63333e5e8fcd307eb198efd6451` |
| 起始功能修复 HEAD | `308389388931fe6398654fe1b1c73a816e639bb7` |
| 旧 base | `5485c25875cb9f71d7cb78a6aa69d07e07fffbab` |
| 本轮 `git fetch origin main` 获取的 base | `580234923268673562cacb5cd01aebdb780339e1` |
| rebase 后完整离线验证 HEAD | `3128642db505931e3875bab46d1c3a2a70567997` |
| 被测 workflow `src` Git tree | `35561612ea544fac5b9584e777d614f349223e22` |
| rebase 前状态 | tracked/untracked clean；ahead 4 / behind 2 |
| rebase 后、写本报告前状态 | tracked/untracked clean；ahead 4 / behind 0 |

本报告以一个独立 docs commit 收尾，提交的父节点就是上述被测 HEAD；最终交付 commit 通过 `git rev-parse HEAD` 获取，运行源码 tree 与上表相同。该身份区分避免在文档中声称测试运行于尚未产生的自引用 commit。

四个任务提交映射（`git range-diff 5485c258..ff048e9 5802349..3128642` 四项全部 `=`）：

| 原提交 | rebase 后提交 | 内容 |
| --- | --- | --- |
| `10568d418d31e20eaf49909a1c40d0e092179c1f` | `befdfda7fd64e3d5d2f21a7fe336b0b18e546f9f` | 固定槽、Portal 与引用菜单 |
| `ca83e4579fbb8e47b9d4170b46faa05be8f57c83` | `bedc22dfa0b098424ca5a4d3effbf0f39ad9a280` | 音频计数共存测试与报告 |
| `308389388931fe6398654fe1b1c73a816e639bb7` | `cc532a01f5d27562b38e28658420009d7feaf8a9` | 实时光标、实际宽度定位修复与 QA 证据 |
| `ff048e9303e5e63333e5e8fcd307eb198efd6451` | `3128642db505931e3875bab46d1c3a2a70567997` | Dev seed 阻断证据 |

## 新增主干实际差异与共存审查

最新主干比旧 base 新增两个提交，共 18 文件、293 行新增、597 行删除：

1. `8e54e8f`（#763 / #767）：音频非 ASR 常驻 `reference_audio` 槽，移除 `AudioTriggerBar` / `AudioParamPopover` 及其状态、类型和摘要写路径；有任意音色选项即显示 VoiceTrigger；更新槽布局表、词条及对应回归。
2. `5802349`（#771 / #772）：VoicePickerDialog 使用官方 CDN 样音与原生 Audio，保留播放/暂停、关闭/卸载清理、失败提示与播放态 CSS，更新试听契约测试。

**冲突处理：无文本冲突，未调用冲突解决操作，未选择整文件 ours/theirs。** `git rebase origin/main` 一次成功。PromptTokenEditor 本身不在本次新增主干 diff 中；不能依据旧描述虚构该文件冲突。实际同文件交集为 ConfigPanel/index.tsx、dict.zh/en.ts、components.css，自动合并后逐项复核。

| 面 | 保留结果与证据 |
| --- | --- |
| ConfigPanel | 相对新主干仅添加引用候选 import、onCommitReference 与 onHistoryStep 接线；`countOverride` / 10000 上限仍属于单一 PromptTokenEditor；非 ASR 音频槽兜底、VoiceTrigger 与 VoicePickerDialog 保持主干代码 |
| 音频模型 | 本任务没有改主干模型 policy；原 `seed-audio-1.0` 允许列表/默认值及零兼容候选提示保持 |
| 音色试听 | `audioParams/` 相对新主干零 diff，未恢复被删的音频参数组件；播放态 CSS 与 #760 槽位 CSS 位于不同块并保留 |
| 固定槽与 Portal | 填槽/空槽 44×44 border-box、媒体 contain、大图与替换按钮独立布局行、body Portal、180ms 离开延迟、rAF 跟踪、Esc/外点关闭保持；延迟不是几何 hover bridge |
| 两级 @ 菜单 | 真实上游当前引用、全画布图片/文本分类、待就绪/非法拓扑提示与键盘交互保持；没有新增音频分类等范围外能力 |
| 光标与定位 | 插入优先合法 query Range → 实时 Selection → blur 缓存 → 尾部；两端点校验保持。定位器可选 preferredWidth 默认 360，预览 240、根菜单 280 用同一返回宽度定位与渲染 |
| 图事务与撤销 | 新边 + prompt patch 仍经共享 applyCanvasInputMutation 原子提交；已有边不重复；拒绝不落盘；force history 保持 token/edge 一起撤销 |
| Feed/Slot 消费 | Slot 消费集来自共享解析，token 不追加媒体、不扩容 First-N、不借旧 slotState 缓存恢复未消费素材；文本组合语义保持。主干 slotLayoutTable 相对新 base 零 diff |

附加等价性证据：`git diff 5485c258 5802349 | git patch-id --stable` 与 `git diff ff048e9 3128642 | git patch-id --stable` 均为 `0c92596d218581a13373e24420a5a29b0b54dd05`。结合四个任务补丁 range-diff 等价，证明 rebase 引入的实际树差异就是这批新增主干，而不是功能被整文件覆盖。

## 本轮新执行的验证

运行时间：2026-09-08 15:09–15:11 +08:00。Node `v25.8.0`，npm `11.17.0`。使用包内原脚本，未安装/更新依赖；`npm --logs-max=0` 仅限制 npm 日志保留。`NODE_OPTIONS` 为空，**无 Node 权限包装、无 registerHooks**。TMPDIR 为已存在的任务树 `plugins/omnimux-workflow/dist/qa2-tmp`；标准 symlink 夹具能正常运行。

| 检查 | 实际结果 | 忽略日志（相对 workflow 包） |
| --- | --- | --- |
| 原三段 build | exit 0，host/client/canvas 均重新构建 | `dist/issue-760-main-build.log` |
| 原双 tsc --noEmit | canvas + host；exit 0 | `dist/issue-760-main-typecheck.log` |
| workflow 完整原 test | **1289 tests / 79 suites；1289 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo；exit 0**；4871.009042ms | `dist/issue-760-main-tests.log:1786–1793` |
| 引用/定位/FeedSlot + 音频/生成面板联合定向 | **168 tests / 15 suites；168 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo；exit 0**；840.901417ms | `dist/issue-760-main-targeted.log:205–212` |
| lint:i18n | 8 locale files / 12 manifests；exit 0 | `dist/issue-760-main-i18n.log` |
| 完整 verify:stages | 10 Stage components / 8 registered sidebar targets（含 market）；exit 0 | `dist/issue-760-main-stages.log` |
| check:boundaries | 2125 source files；exit 0 | `dist/issue-760-main-boundaries.log` |
| git diff --check | 新 base 到被测 HEAD 及文档工作树检查通过 | Git 命令输出 |

168 是全包子集，不与 1289 相加。旧 QA 为 1289 tests / 80 suites、2127 files；本次主干删除两个运行组件及相关测试、增加音频卡槽回归，总 tests 恰好相同，suites 与 source files 已变化，不能沿用旧数字或旧 QA 身份。

本轮全包日志确认原 QA 两个缺陷与新增边界通过（475–506 行）、#763 卡槽及移除参数入口通过（162–166、1035–1036 行）、#771 试听源码契约通过（170 行）。唯一字数统计 0/10000/10001 及引用菜单共存、自动连边/失败原子拒绝/undo、Slot First-N 与合成请求边界均由现有相关测试重新执行。试听检查属于源码契约，不是 CDN 播放实测。

### 可复现命令

在任务树 `plugins/omnimux-workflow` 执行（日志管道均设置 `set -o pipefail`，各阶段检查真实退出码）：

```sh
export TMPDIR="$PWD/dist/qa2-tmp"
npm --logs-max=0 run build
npm --logs-max=0 run typecheck
npm --logs-max=0 run test
node --test \
  src/canvas/editor/components/PromptTokenEditor/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/viewportPositioner.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/viewportPositioner.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/audioParams/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/generationUi.render.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParamsIntegration.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs src/canvas/i18n/*.test.mjs
```

在任务根执行：

```sh
export TMPDIR="$PWD/plugins/omnimux-workflow/dist/qa2-tmp"
npm --logs-max=0 run lint:i18n
npm --logs-max=0 run verify:stages
npm --logs-max=0 run check:boundaries
git diff --check origin/main HEAD
git diff --check
```

未改门禁/合同/manifest/registry/model contracts，未运行根 `test:all`、其他业务包全测或 `test:gates`，未调用真实模型探测。完整 workflow 测试与相关 Stage/边界门禁是本次适用离线范围。

## 写入边界与构建身份

根、workflow、hub、market 的现有 node_modules 链接指向主 checkout 依赖，只读使用。未 install/prepare、未写链接目标。已完整读取 workflow 三段构建、Stage 检查/装配及 market concat 脚本；内存 esbuild 使用 write:false，落盘产物限于本任务树 workflow dist/lib 与 market lib。上述目录 realpath 都在本任务树，`git check-ignore` 确认产物和日志忽略。

| 产物（相对任务根） | 真实 bytes | SHA-256 |
| --- | ---: | --- |
| `plugins/omnimux-workflow/dist/index.js` | 1475026 | `866a532d217dbe7f0125a51be05d767992c9258cdefae81d2d09ee3cd0289f03` |
| `plugins/omnimux-workflow/lib/client.js` | 129883 | `ae94b996be79902c55f29cae13b20f1a93e8557f7ef89bf50e9650b9df81fa08` |
| `plugins/omnimux-workflow/lib/canvas.js` | 2087641 | `54975a2948358bfb827b3fab894bcb778ccc7306ad939492d15fbada8576d403` |
| `plugins/omnimux-market/lib/client.js` | 217813 | `37d25f81ec30a79ad515458f0ab5500aa5d66fcb13f098119cb757b30f686847` |

原 build 日志将 JavaScript 字符串 length 标记为 bytes；上表为实际文件字节长度与内容散列，区别不代表构建失败。构建指纹仅绑定本地生成物，不证明浏览器已加载。

## 全局一致性与交接

- 对新旧补丁、ConfigPanel 调用链、编辑器 token/Range、Portal 定位、store mutation/history、执行消费边界完成全局交叉检查；接口、import 与数据流一致。最小方案为无冲突 rebase，不新增重复实现或为同步机械增加测试。**IS_PASS: YES（工程离线范围）。**
- 本轮新增唯一 tracked 文件为本报告；原四个 #760 提交仍保存所有实现、测试、原 QA 报告及 seed 调查。所有后台 jobs 已收集结束。
- 下一负责人为主理人：以本报告精确 SHA 与源码 tree 安排独立整合 QA；后续由主理人负责获准的 push/PR 流程。本任务不直接联系其他成员。
- 真实剩余条件不变：#778 正式恢复受管 seed 后，按当前最终版本开展 L2 身份绑定、ego-browser / verify:live / runtime bundle proof / PNG，以及 44×44 contain、替换按钮、正常/慢速 hover、四边/缩放/平移、两级菜单鼠标/IME、原生选区和图撤销重做/刷新持久化验证。未运行 coverage instrumentation，不报告覆盖率；保留未转义 `]` 文件名协议限制，不擅自扩展序列化。
