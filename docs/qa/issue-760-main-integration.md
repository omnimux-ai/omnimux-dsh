# Issue #760 主干整合独立 QA

## 结论

- **代码整合：PASS；源码 Routing Decision：NoOne。** 固定 base 到 HEAD 的真实 diff、三次 rebase 的补丁等价性、原 QA 修复与新主干共存经独立核对，未发现本次整合引入的未决源码缺陷。
- **Overall：BLOCKED，not ready to merge / close。** L2 受管 seed 恢复由 #778 工程负责；当前任务没有重新启动 L2、调查或修改 #778、写 Dev、运行浏览器或冒充 runtime 验收。
- 本轮是主干整合独立审查，**不是原功能 QA 的第三轮修复**。只进行一次最小定向运行：**23 tests / 1 suite / 23 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo，exit 0**。未改源码或测试断言，没有修复循环。
- 复用工程最终完整 workflow 证据：**1290/1290，79 suites，0 fail/skip/cancel/todo**；独立读取原始日志、核对测试与构建身份，未声称本轮重新运行全包。23 与工程首轮定向 168 都是全包子集，不能相加。
- 未运行 coverage instrumentation，不提供估算覆盖率。JSDOM、源代码合同与 Stage 静态检查不是真实浏览器几何、hover、Selection/IME、音频播放或持久化验收。

## 身份与审查范围

审查时间：2026-09-08 15:28–15:35 +08:00。固定本地 SHA 审查，未 fetch、不声称实时远端最新 tip。

| 项目 | 独立核对结果 |
| --- | --- |
| 唯一任务树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760` |
| 分支 | `agent/workflow-slot-mention-menu-issue-760` |
| base / 本地 origin/main | `0fe89ef047c687d156204fa48a177d92d590c6a4` |
| 起止 HEAD | `04f4ac085bc8075e9c5e5444855547cd6f480f1c` |
| workflow src tree | `4d1488a42ba57442647d8a6b856fde15220888bd` |
| 工程最终被测父提交 | `9ceccf5fbfabd7c940d0b727da0d8dd43d50bed3`，src tree 与 HEAD 相同 |
| 提交关系 | base 是祖先，ahead 7 / behind 0；7 个任务提交 |
| 起始工作树 | tracked/untracked clean |
| base → HEAD | 24 文件，+1712/-468；运行变化仅在 workflow，另外四份 #760 文档 |
| 本轮交付 | 新增本报告及任务树内忽略的定向日志；运行代码、既有测试与历史报告均不修改 |

已完整读取 [整合实现报告](../implementation/issue-760-main-integration.md)（148 行）、[原 QA](issue-760-slot-mention-menu.md)（249 行）、[原实现说明](../implementation/issue-760-slot-mention-menu.md)（195 行）；另核对节点输入提交、plugin QA 与 Git/PR 合同。历史记忆仅作发现入口，不代替当前 Git 和测试证据。

## 独立 Git 整合核对

### 1. 三次 range-diff

以下在任务根独立执行，全部 exit 0：

```sh
git range-diff 5485c258..ff048e9 5802349..3128642
git range-diff 5802349..060369d 537e80e..f4cc54d
git range-diff 537e80e..732c53b 0fe89ef..9ceccf5
```

结果分别 **4/4、5/5、6/6 全部 `=`**。前三个功能/测试提交最终对应 `1fad905`、`5c769f4`、`aaf368c`，seed 文档对应 `f3e2894`，前两份整合 docs 对应 `42e5a12`、`9ceccf5`。HEAD `04f4ac0` 仅更新整合文档（+11/-1），相对父提交的 plugins、scripts、package 与 lock diff 为零。

只读 reflog 显示三次 start → pick → finish 链，未出现本轮三次 rebase 的 continue/冲突解决步骤；结合全部补丁等价，与工程“无冲突”陈述一致。更早的首次功能 rebase 确有 continue 记录，不把它与本轮三次主干整合混淆。

额外双向核对：

```sh
git diff 5485c258 0fe89ef -- plugins/omnimux-workflow/src | git patch-id --stable
git diff ff048e9 HEAD -- plugins/omnimux-workflow/src | git patch-id --stable
```

两者均为 **`2497a347fcaca6dc60cf0ff64625764752642f27`**。这与任务 range-diff 一起证明 workflow 源码增量来自对应主干增量，而不是整合期间悄然重写既有任务补丁。

### 2. 真实交集，而非根据报告推测冲突

旧 base `5485c258` → 固定新 base 共 4 个提交、31 个文件：#763/#767、#771/#772、#779/#781、#780/#782。与 base → HEAD 任务文件的交集**恰好四份**：

- `ConfigPanel/index.tsx`：相对新 base 仅引用候选 import 与 `onCommitReference` / `onHistoryStep` 接线；保留 #763 非 ASR `reference_audio` 兜底、任何非空音色目录入口，以及 countOverride/10000。
- `dict.en.ts`、`dict.zh.ts`：主干新增 `panel.slot.reference_audio`，任务增加 mention 词条，互不覆盖。
- `components.css`：主干新增试听 playing 状态块；任务修改槽与 hover 块，保留主干播放态。

以下相对新 base **零 diff**：整个 hub、scripts、ConfigPanel/audioParams、共享 `slotLayoutTable.ts`、workflow `speechToText` 与 `speechToTextRoutes.test.mjs`。因此 #779 guard、#780 STT 修复及 #771 试听实现未被 #760 覆盖；删除的 AudioTriggerBar/AudioParamPopover 未恢复。不把这一零 diff 核对扩张成对 hub/STT/guard 的全面独立验收。

## 关键行为与源码证据

下表源码路径均相对 `plugins/omnimux-workflow/src/`；通过源码读取、实际 diff、既有测试断言与原始结果交叉核对。

| 行为 | 独立核对与证据边界 |
| --- | --- |
| 固定 44 槽、contain | `canvas/theme/components.css` 槽基础/filled 44×44、border-box；media 100%/contain；`SlotWells.tsx` 去掉 onLoad/aspectRatio。未用旧 36–96 自适应断言冒充新规格。真实 computed geometry 尚未验收。 |
| Portal 替换预览 | `SlotHoverPreview.tsx:20–59` body Portal、rAF rect 更新、180ms 离开延迟、Esc/外点、媒体和按钮独立布局；事件停止传播，不把替换点击当槽插入。180ms 是宽限时间，不是几何 hover bridge；慢速跨间隙仍待 L2。 |
| 实际 width | 共享 `cfg/viewportPositioner.ts` 可选 preferredWidth 默认 360；预览传 240，根菜单传 280，同一返回 width 定位及渲染。旧预览右缘 [628,868] 问题未恢复，现为 [748,988]；窄屏/顶部翻转组件回归通过。 |
| 两级 @ 图文 | `referenceCandidates.ts:20–42` 以绑定和真实 Feed 生成当前引用，全画布只添加图片/文本分类，保留 waiting/拓扑原因；`MentionPopover.tsx:57–120` 子级避让、鼠标分类、键盘/IME guard、body Portal 在位。真实鼠标与 IME 仍待 L2。 |
| 实时 Selection | `PromptTokenEditor.tsx:300–309` 同时验证两个 Range 端点，query → live → blur cache → 尾部；原独立失败断言未修改。非折叠/跨编辑器/连续插入的边界仍通过。 |
| 原子连边/token/undo | `ConfigPanel/index.tsx:749–764` 一份 referenceMutation 提交边+prompt，成功才 force history；`canvasStore.ts:166–184` rejected 不 set，allowed 一次 set nodes/edges；`:360–411` force 快照及图 undo/redo 保留。既有测试核对重复边、cycle/missing/self 原子拒绝、快速打字下边与 token 同撤销。 |
| Feed/Slot 与执行内容 | `materialGatewayExecutor.ts:71–128` 使用 collectMaterialSlotInputs 结果；token 编译只接已消费 media、禁用旧 slotState、无 compiled refs 追加。`:169–176` TTS 不发送参考媒体；`:79–82` 音频正文/要求不可分离时继续拒绝。`referenceCandidates.test.mjs:81–102` 合成请求只含槽内图、全部上游正文与本地要求，Feed 不扩容、不切 model/operation；全包日志 :504 通过。 |
| 唯一计数 | `ConfigPanel/index.tsx:765–768` 权威 countOverride 与上限；`PromptTokenEditor.tsx:203–205,434–442` 唯一计数及超限态。0/10000/10001 与菜单插入共存，本轮定向实际通过。 |
| 音色 preview 保留 | `audioParams/VoicePickerDialog.tsx:69–116` 原生 Audio、停止旧实例、关闭/卸载清理、CDN 样音及失败提示；与新 base 字节一致，playing CSS 未覆盖。全包 :170 只证明源码合同，不证明真实 CDN 播放、浏览器声音或全部事件时序。 |

额外逐字节检查：`3083893` → HEAD 的整个 PromptTokenEditor、SlotWells、cfg 目录零 diff。旧独立 QA 文件 SHA-256 仍为 `f6476796875e50fb195875d94c0e9d878025db5e7ee27c0c914a347f2d5c8463`；工程边界测试仍为 `77a8acbefef6eac2b165eb385b431ab0ceba943b858be680dd2bef0574cf2bdb`。QA-760-01/02 修复与原断言均未被整合覆盖。

## 验证结果：新执行与复用分开

### 本轮新执行

为排除交互组件加载/选择区与计数共存的局部疑点，复用现有三份测试，不新增重复测试。在 workflow 包运行：

```sh
set -o pipefail
TMPDIR="$PWD/dist/qa2-tmp" node --test \
  src/canvas/editor/components/PromptTokenEditor/issue760.qa.test.mjs \
  src/canvas/editor/components/PromptTokenEditor/referenceBoundaries.dom.test.mjs \
  src/canvas/editor/components/PromptTokenEditor/referenceInteraction.dom.test.mjs \
  2>&1 | tee dist/issue-760-integration-qa-targeted.log
```

- Node `v25.8.0`，NODE_OPTIONS 为空，无人工权限包装或 registerHooks；esbuild `write:false`，不安装依赖。
- **23 tests / 1 suite / 23 pass / 0 fail/cancel/skip/todo，exit 0，748.413917ms**；只有这一次测试运行，无需第二轮。
- 已核对 dist/lib/TMPDIR realpath 在唯一任务树；node_modules 指向主 checkout，仅读取。新增日志由 `git check-ignore` 确认忽略。
- Git range-diff、精确路径 `git diff --exit-code`、base → HEAD `git diff --check` 独立通过。Git 源码路径核对以任务根执行结果为准，不采用包目录下无匹配路径的空输出作为证据。

### 复用工程最终证据

独立读取 `plugins/omnimux-workflow/dist/issue-760-final-*.log`，父提交到 HEAD 仅 docs 改动，源码 tree、构建输入和环境未变化，因此本轮不机械重复全包/build/tsc/Stage。

| 检查 | 原始日志核对 | 归属/限制 |
| --- | --- | --- |
| workflow 完整 test | tests.log:1788–1795：1290/1290，79 suites，0 fail/cancel/skip/todo，5622.070791ms | 工程实跑，非本轮重跑；不与定向累加 |
| 三段 build | build.log:2–7：host/client/canvas 均产出 | 工程报告 exit 0；本轮重新 hash 产物 |
| 双 tsc | typecheck.log:2–4：canvas && host --noEmit，无诊断 | 工程提供 exit 0，日志不含独立退出码签名；本轮未重跑 |
| i18n | i18n.log:7：8 locale files / 12 manifests PASS | 工程实跑证据复用 |
| 完整 Stage | stages.log:5–6：10 components / 8 sidebar targets PASS | 含 market；不是 runtime probe |
| 边界 | boundaries.log:5：2126 source files verified | 工程实跑证据复用 |

已核对相关断言实际出现在最终全包：原 QA/边界 :475–496；history/原子变更/执行内容 :498–504；计数/菜单 :505–511；#763 :162–168、:1035–1036；#771 :170；#780 CHANNEL_UNAVAILABLE → 503 :1632。源码中的预期负向错误日志不等于测试失败。

本轮只读产物指纹：

| workflow 包内路径 | 实际 bytes | SHA-256 |
| --- | ---: | --- |
| dist/index.js | 1475194 | `b1f01ea3b12b8f03de44c4115748ed3639e88a1fa94fab08bfbddb966cb0b08a` |
| lib/client.js | 129883 | `ae94b996be79902c55f29cae13b20f1a93e8557f7ef89bf50e9650b9df81fa08` |
| lib/canvas.js | 2087641 | `54975a2948358bfb827b3fab894bcb778ccc7306ad939492d15fbada8576d403` |

与工程最终报告一致。build 日志的字符串 length 与文件 bytes 不同，不视为失败；这些 hash 不证明浏览器已加载。未运行 hub 全包、其他业务包、根全测、真实 STT/TTS/模型请求、构建或部署。

## Known Issues、阻断与下一步

- **本轮未发现整合引入的确定源码失败。** 不扩大 PASS 到所有历史功能、未测试主干行为或 runtime。
- 保留已披露的未转义 `]` 文件名序列化限制；本轮未扩展协议。
- **必须补齐的 runtime 验收仍 BLOCKED**：当前交付身份绑定的 L2 `.l2-dev.env`/SOURCE/COMMIT/PROFILE/Host；同次 ego-browser `verify:live`、runtime bundle proof、可解码 PNG；44×44/横竖长图 contain、替换按钮、正常/慢速 hover、四边/缩放/平移/resize；鼠标两级菜单、原生输入法/选区、图撤销重做、保存刷新持久化。
- seed 阻断及 #778 正在工程属于当前任务给定事实；本轮未重新读取共享 profile、启动 L2、检查或改动 #778。不能因主干新功能与离线全绿推断 seed 已修复。
- **下一负责人：主理人。** 接收本报告；待 #778 正式完成受管 seed 后，另行安排绑定当时最终版本的 L2/ego 验收。本 QA 不与成员通信，不 commit/push/PR/merge/deploy，不写 Dev/Prod 或官方源码。
- 本轮无后台 job、无持续运行任务；报告与忽略日志保留在唯一任务树。**代码整合已可交接；Issue 仍不具备合入或关闭条件。**
