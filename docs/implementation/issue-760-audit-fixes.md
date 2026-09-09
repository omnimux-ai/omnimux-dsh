# Issue #760 审计修复工程交接

## 状态与身份

- 三项审计发现均完成实际离线复现及最小源码修复；不是误报。
- 工程定向 IS_PASS: YES；整体合并验收 IS_PASS: NO（全包一项已证实基线失败，L2/真实浏览器未执行）。不得据此关闭 #760 或声明端到端通过。
- Base（本轮 fetch origin main）：`867b192ecf6aa35be4e1639db7351a89bea782c7`。
- Code head：`2ca3e8286dda317be0a6cdf2d5aa6829f2d98450`；后续文档提交不改变源码。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audit-fixes-760`。
- 分支：`agent/workflow-audit-fixes-issue-760`。
- 主树最初两项 videoCompositionStatus.ts/test.mjs 他人修改保持不动。无 stash/reset、push、PR、merge、共享 Dev/Prod 或官方 DSH/外部仓写入；不涉及 managed-tarball。
- 原审计完整读取：`../issue-760-independent-review/docs/qa/issue-760-independent-review.md` 及同目录复现文件。未修改原审计文件；复现副本统一使用 workflow React/renderer，避免 root React18 与 workflow React19 混用。
- 仓库 workflow skill 的旧 git-wt.sh 路径会创建兄弟工作树，故依本次明确仓内约束用 git worktree add；当前 package.json 实际 wt:start 已指向 scripts/worktree.sh。未修改工具或 skill。

## 本地 Issue 修复方案（远端写由主理人处理）

- type: bug；plugin: omnimux-workflow；risk-tier: R2；pre-authorized: false；dependencies: none（代码），L2 正式任务环境及凭据初始化授权（运行验收）。
- Scope：F1 精确 occupant 替换、F2 文本引用与本地要求分离、F3 引用媒体原位刷新。
- Acceptance：替换前/后槽顺序与供给边准确；满槽/未满/未知容量、已有 Feed/新来源/本地文件均原子；重复来源/成环/过时目标拒绝；文本正文只消费一次且真实音频要求拒绝；references 变化不重建编辑器、不丢 selection/IME；最后独立 L2 专项浏览器验收。
- Non-goals：模型能力、新引用协议、hover bridge、纳管脚本、共享环境物化及发布。

## 修改文件与语义

路径均相对 plugins/omnimux-workflow/src：

1. `canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx`、`types.ts`：替换入口携带 replaceEdgeId。
2. `canvas/editor/components/MaterialNode/index.tsx`：完整转发目标身份。
3. `canvas/editor/hooks/useResourcePicker.ts`：replace 模式、最新图提交、替换前 history snapshot 与成功后强制 history，避免 debounce 合并撤销步骤。
4. `canvas/editor/utils/resourcePickerPolicy.ts`：稳定边身份定位当前 named slot；单选及来源验证；新边提前 normalize 获得稳定 ID；一个 mutation 同时带新节点/边与 slotBindings，不写旧 slotState，不删除 Feed；过时身份拒绝。
5. `shared/graph/feedSlot/autoFillSlots.ts`、`shared/graph/canvasSlotRecompute.ts`、`canvas/editor/utils/connectionValidator.ts`：新增 node.data.slotStandbyEdgeIds（可选字符串数组），被替换边仅禁止自动装填，显式绑定优先；图重算与 UI advisory 一致。避免未满槽自动把旧图追加回来。既有 max/角色/去重/结构闸保持。
6. `shared/graph/generationPrompt.ts`：在共享有效输入层剥离文本引用标记（slotIndex=-1），媒体标记保留；真实正文/补充要求不剥离。UI localText 与 executor 冲突检查一致；上游正文按既有顺序消费一次，音频禁止 source labels 和要求进入朗读正文。
7. `canvas/editor/components/PromptTokenEditor/PromptTokenEditor.tsx`：仅改现有 token 的 img src 或 icon/img 子节点；保留原 span、文本节点、删除监听及 Selection。composition 中延迟，compositionend 同步最新 references；没有因 references 变化清空 contentEditable。
8. 新增测试：`canvas/editor/utils/occupantReplacement.test.mjs`、`shared/graph/textReferenceInput.test.mjs`、仓根 `docs/qa/issue-760-independent-repro.test.mjs`。

Standby 字段随 graph JSON/history 持久化，无需迁移；旧数据默认空数组。替换时把该 strip 剩余 occupant pin 住以防内核 pinned-first 重排。此有意的显式顺序保护应由 QA 复核。其他独立槽仍遵循既有自动装填。

## 复现前后及精确测试

环境 Node v25.8.0；共享 root/各相关包 node_modules 仅通过任务内忽略 symlink 只读消费，没有 pnpm/corepack/install。npm run 与 node 直接执行 package.json 同一脚本；构建输出仅任务树 dist/lib。

| 检查 | 实际结果 |
| --- | --- |
| 原复现首次 node --test docs/qa/issue-760-independent-repro.test.mjs | exit1；3 tests/0 pass/3 fail：F1、F2业务失败；F3 React版本夹具错误，不算业务证据 |
| 仅统一 React 解析后同命令，源码未修 | exit1；3/0/3，全部进入业务断言：F1 [a,c] != [c,b]；F2 不能分别表达错误；F3 old.png != new.png |
| 首次源码修复后三项 | exit0；3/3/0 |
| 扩展容量/来源14项 | 首次10pass/4fail，发现未满槽旧图自动回填；加入 standby 后14/14/0 |
| 最终三文件集合（下列命令） | exit0；15 tests/15pass/0fail/0skip，含 JSON 重载/重新选择、混合 pinned 顺序、selection 与模拟 IME |
| 原审计95项+新增及 connectionValidator 定向 | exit0；119 tests/4 suites/119pass/0fail/0skip；targeted-760.log；其后新增一个顺序用例已在最终15项通过 |
| npm --prefix plugins/omnimux-workflow test，未构建 | exit1；1280 tests/1269pass/11fail，10个dist缺失+1个rootOwnership夹具错误 |
| 任务内构建后完整包，两次（最终源同版本） | exit1；1374 tests/1373pass/1fail/0skip，唯一rootOwnership；最后新增的一个测试单独通过，未计入1374 |
| 基线只读 node --test src/canvas/rootOwnership.test.mjs | 在原审计树867b192e同样exit1，1文件失败；mock react/jsx-runtime缺jsxs/Fragment，未改无关基线测试 |
| npm --prefix plugins/omnimux-workflow run typecheck | canvas + host均exit0，最终源码复核通过 |
| npm --prefix plugins/omnimux-workflow run build | host/client/canvas均exit0；build-final-760.log |
| node scripts/verify-stage-contracts.mjs | 初次依赖未链接，dsh-ui-kit解析失败；补任务内相关包只读依赖链接后exit0：10 Stages/8 targets |
| node scripts/verify-plugin-boundaries.mjs | exit0：2210 source files |
| node scripts/verify-slot-contracts.mjs | exit0：1670 files/0 violations |
| node scripts/scan-ui-gates.mjs | exit0：279 views/0 violations |
| git diff --check | exit0 |

最终新增回归（仓根）：

```sh
node --test docs/qa/issue-760-independent-repro.test.mjs \
  plugins/omnimux-workflow/src/canvas/editor/utils/occupantReplacement.test.mjs \
  plugins/omnimux-workflow/src/shared/graph/textReferenceInput.test.mjs
```

定向命令（plugins/omnimux-workflow）：

```sh
node --test src/canvas/editor/components/PromptTokenEditor/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/viewportPositioner.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs src/shared/graph/feedSlot/feedSlotKernel.test.mjs \
  src/canvas/editor/utils/occupantReplacement.test.mjs src/shared/graph/textReferenceInput.test.mjs \
  src/canvas/editor/utils/connectionValidator.test.mjs
```

本机日志保留于任务树根（*.log被忽略）：workflow-test-760.log、workflow-test-760-built.log、workflow-final-760.log、targeted-760.log、build-final-760.log、typecheck-final-760.log。未执行全仓所有包/模型探测/远端CI：单插件修复不要求无关全仓重建；模型合同未变，无真实调用。

## QA 交接与残余风险

1. 主理人安排独立 QA，先核对上述 code head 与真实 diff；不得只复述通过计数。现有 rootOwnership 全包阻断须单独确认治理，不计本次产品回归，不掩盖为全包PASS。
2. L2/ego-browser专项：NOT RUN。已加载 ego skill并读取正式 QA 合同，但本轮禁止部署，且 scripts/dev-env.sh:521–535/678 会复制共享凭据初始化任务；当前委派无额外 credential bootstrap 授权，不执行也不规避。未创建 ego task、无遗留浏览器空间。主理人处理准确 L2 授权/任务环境，不能改共享seed或官方DSH来排阻。
3. 获得合规 L2 后绑定本树 SOURCE、最终提交、44201–44299 profile与Host，按 scripts/ego-live-qa.mjs 正式登录/共享 verify:live workflow 探针；同一ego task/tab追加专项：A/B strip点击A悬浮替换C（满/未满/Feed/新源），确认[C,B]、A仍Feed；取消与过时占用不改图；撤销/重做还原整事务；保存刷新保持待命；切结果刷新token且真实选择区不移动；真实中文IME期间上游变化不破坏合成。
4. 音频文本引用选择后用合成离线网关捕获正文一次，无真实生成/支付；附加“温柔一点”必须零submit并显示明确拒绝。仅Stage开关/恢复探针不能覆盖该项。
5. 原审计 hover gap、窄屏子层和协议 label `]` 限制未扩修；本次JSDOM证明DOM/模拟composition，不证明原生浏览器IME或computed geometry。
6. 代码、检查、PR/merge、物化和运行验收是不同状态：本次只交本地代码与工程证据；远端写、部署、最终放行均未完成，下一负责人为主理人及其独立QA。
