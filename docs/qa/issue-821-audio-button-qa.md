# Issue #821 音频按钮独立 QA 报告

## 结论

- **整体状态：BLOCKED，不能关闭 Issue 或标记 qa:pass。**
- **Routing Decision：Known Issues / 环境工程依赖**，保留正式 L2 验收。2026-09-09 续验已获得任务凭据初始化及私有环境兼容依赖消费授权；剩余阻塞是当前受管工具不支持已安装 viewer 的版本/payload 升级，不再是缺少凭据授权。未发现本次三处音频实现差异的确定性源码缺陷，不向音频实现工程师发出返修要求。`NoOne` 不适用，因为必需的真实界面证据尚缺。
- 独立离线检查通过：第一轮全包 **1363 tests / 1363 pass / 0 fail / 0 skip**；补充两项行为边界后第二轮专项 **28 tests / 28 pass / 0 fail / 0 skip**。专项与全包重叠，不相加为独立用例总数。
- 覆盖率：未采集百分比。覆盖实际 React 组件、媒体状态、seek、错误重试、取消与会话生命周期；JSDOM 不覆盖真实 CSS 布局、浏览器解码、指针拖拽及系统文件操作。
- 仅新增 QA 测试与本报告，未修改产品实现、主树、其他任务、官方 DSH、共享 Dev/Prod；未 push、PR、merge、部署或委派其他代理。

## 精确版本与范围

| 项目 | 本次核验值 |
| --- | --- |
| Worktree | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-button-visual-821` |
| Base | `867b192ecf6aa35be4e1639db7351a89bea782c7` |
| 源码 commit | `4734326b816c1d2831c8f628217ebd8f86aa3435` |
| 被审 HEAD | `fad7d7fb0a3da2d8e2b33aa1e461ba94e5c7306b` |
| 分支 | `agent/workflow-audio-button-visual-issue-821` |
| 初始工作树 | clean |
| 时间 | 2026-09-09，Asia/Shanghai |

首先完整读取 `docs/implementation/issue-821-audio-button-engineering.md`。固定 base/head 范围优先，不重新 fetch 改变审查基线。`git diff 4734326b HEAD -- plugins` 为空；工程报告提交未改变源码。

加载 ui、ego-browser、dsh-plugin-dev、omnimux-repo-workflow；读取 design.md、UI guidelines、plugin-qa、dev-pipeline、plugin-git-pr。UI guidelines 中旧的生产物化 checklist 不扩展当前授权，本次不部署。

## 独立代码结论

1. `components.css:635-706` 删除音频局部七个蓝灰变量，继承 `.wf-canvas-root` 主题。浅色来自宿主语义变量，深色来自 workbench-theme.css 的既有中性色值；这是源码级确认，不是运行时主题验收。
2. 按钮基类明确 `box-sizing: border-box; height: 32px; border-radius: 8px; font-size: 13px`。播放/保存保留 Secondary 填充，辅助 action/replace/retry 使用 Ghost，16px SVG 与图标按钮32px统一。
3. hover、active、focus-visible、disabled、reduced-motion 选择器存在且顺序合理。实际 matched CSS、computed style、缩放与长文本裁剪仍需 L2。
4. AudioPreview 实现 diff 仅涉及 SVG 尺寸与重试类名，未变更播放、暂停、解码、seek、保存、替换、open/reveal 或事件隔离。MediaPreview:93 以 workspace+source 作为 key，替换时重挂媒体状态。
5. canvas index 的诊断 useCanvasStore 导出已删除；client 搜索仅剩 lifecycle 测试直接导入内部 store。没有发现生产 client 依赖该诊断出口。完整构建与 bridge lifecycle 测试通过。
6. CSS 保留44px波形区、两行布局和拖拽区域。源码不能证明真实鼠标拖拽成功；旧 #827 的截图或 store 位移不作为本次依据。旧截图圆角与当时源码50%的冲突原因仍未确认，不归因于缓存。

## 本次新增 QA 测试

文件：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.qa.test.mjs`。

- `QA821 playback, save and replacement controls isolate pointer and click events`：真实组件离线挂载，分别触发三个控件的 pointerdown/click，验证事件不冒泡至 document，播放、保存、替换各自只触发对应动作。
- `QA821 waveform retry is isolated and retries decoding without replacing or opening media`：制造离线波形读取失败，再点击重试，验证重新请求、事件隔离且不调用替换/播放。

测试使用 mock 媒体与离线失败源；没有把测试 URL 当作 L2 有效素材，没有新增仅复述 CSS 数字的静态测试，也没有放宽原断言。

## 实际执行与证据

以下命令均在本任务树；包命令工作目录为 `plugins/omnimux-workflow`。

| 检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npm test`，Round 1 | 0 | 1363 pass，0 fail，0 skip；`audio-qa-package-test.log` |
| 六文件音频/保存/波形/bridge `node --test`，Round 2 | 0 | 28 pass，0 fail，0 skip；`audio-qa-focused-test.log` |
| `npm run typecheck` | 0 | canvas、host 两份 tsconfig |
| `npm run build` | 0 | host 1489308 bytes；client 172861 bytes；canvas 2109962 bytes |
| `node scripts/verify-stage-contracts.mjs` | 0 | 10 Stage，8 sidebar targets |
| `node scripts/verify-plugin-boundaries.mjs` | 0 | 2208 source files |
| `node scripts/verify-slot-contracts.mjs` | 0 | 1670 client files，0 violations |
| `node scripts/scan-ui-gates.mjs` | 0 | 279 client views，0 violations |
| `node scripts/registry-tool.mjs verify` | 0 | 12 plugins consistent |
| `git diff --check` | 0 | 实现与 QA 修改格式检查 |
| ego `listTaskSpaces()` | 0 | CLI 可用，仅只读列举；没有接管、导航或修改旧 task 70 |

专项命令：

```sh
node --test src/canvas/editor/components/MaterialNode/AudioPreview.test.mjs src/canvas/editor/components/MaterialNode/AudioPreview.qa.test.mjs src/canvas/editor/hooks/useSaveRemoteAudio.test.mjs src/canvas/editor/hooks/useSaveRemoteAudio.qa.test.mjs src/canvas/editor/utils/audioWaveform.test.mjs src/client/CanvasBridge.lifecycle.test.mjs
```

`npm test` 与 package.json 中要求的 pnpm filter 实际调用相同 node test 脚本，避免工程已记录的 pnpm 自动安装/purge。没有重装或更改共享依赖。第二轮新增测试后仅跑匹配的专项，不声称最终新增测试集已再次跑完整包。

保留的 warning：CanvasBridge lifecycle 三次打印 React synchronous unmount warning，测试通过；没有屏蔽，也不把它视为本次视觉补丁新增缺陷。

调查工具失误：一次 grep 空 include 被拒绝，修正 glob 后读取成功；一次 settings 路径手写成不存在的 `packages/host/settings`，得到 ERR_MODULE_NOT_FOUND，不作为环境缺陷证据。随后使用 CLI anchor 的 createRequire.resolve 得到实际路径并完成如下兼容性检查。

## 上轮正式 L2 前置核验与阻塞（历史记录；A 已获授权，当前结论见续验）

### A. 凭据 bootstrap 的委派范围未明确

- `~/.dsh-dev/tasks/audio-button-visual-821/.credentials.yaml` 不存在，公共 `~/.dsh-dev/.credentials.yaml` 存在；仅检查存在性，没有读取秘密内容。
- 新/旧 task profile 均不存在。
- 正式 `scripts/dev-env.sh:673-689` 会先调用 ensure_task_credentials 与 ensure_task_settings，再做 seed 预检；`521-535` 会把公共凭据复制到新任务目录。
- 当前委派说明继承 L2 测试授权，但未提供明确覆盖该新任务凭据 bootstrap 的授权；工程报告也明确要求核对这一点。子代理无法扩大权限，因此未执行 start，也没有设置跳过凭据的环境旁路。
- 这不是 sandbox 拒绝或 Host 启动失败，不能声称正式 start 已运行。

### B. 已独立证实默认 seed 与底座 settings 入口不兼容

只读核验默认受管 seed `/Users/x/.omnimux-dev/profiles/omnimux`：

- 288 个 manifest dependencies；所有顶层 file 依赖与所需受管 package.json 检查无失败，pnpm lock 的 file 路径可重定位。该检查不是全 seed/bundle/runtime 完整性认证。
- CLI anchor `/Users/x/Desktop/Project/Github/deepseek-harness/apps/cli/package.json` 能解析 web-app 与 ui-chat，ui-chat lib 存在。
- viewer 受管版本 `0.1.0`，main `lib/index.js` 存在；其第3行导入 `installSettingsSection, settingsNamespace`，第710行调用前者。
- 从同一 CLI anchor 解析 settings 为 `/Users/x/Desktop/Project/Github/deepseek-harness/packages/settings/settings/lib/index.js`；导出列表不含上述两个名称。
- 通过 Node ESM 对实际解析路径做等价 named import，**exit 1**：`does not provide an export named 'installSettingsSection'`。

这是当前文件与 ESM 入口兼容性证据，不是本任务真实 Host 日志。即使授权补全，当前默认组合仍不能证明完整 L2 可以启动。没有修改 viewer、底座、seed、profile 或从其他 workspace 借用已禁 viewer 的环境。

## L2 证据边界

| 要求 | 状态与缺口 |
| --- | --- |
| 正式 dev-env 完整受管环境 | BLOCKED：上述 A/B；未分配 URL/PORT/PID |
| `.l2-dev.env`、SOURCE/COMMIT/profile/runtimeProof | 未生成，不猜测、不复用旧绑定 |
| 正常工作区会话导入有效任务 WAV | 未执行，未用 canvas/Fiber/store 注入素材 |
| 真实鼠标外壳/波形拖拽与前后 DOM 位置 | 未执行，截图及离线冒泡测试均不能替代 |
| 播放、暂停、结束、解码、鼠标/键盘 seek | 离线覆盖通过；浏览器层 BLOCKED |
| 保存成功落盘、失败重试、替换隔离 | 离线覆盖通过；正常入口 L2 BLOCKED |
| computed style、双主题、窄宽视口、中英文、放大缩小与状态 | 源码审查通过；真实渲染 BLOCKED |
| native open/reveal | 仅离线请求/错误映射，未验证系统效果 |
| 共享 verify:live | 未创建请求：无有效 L2 URL/Host 身份；没有 pending 冒充 PASS |
| 真实 PNG/ego 同次 task-tab 证据 | 无，没有沿用旧 #827 或其他任务证据 |

## 上轮下一步与关闭条件（当前最小动作见续验）

1. 主理人确认现有授权是否明确包含本 task 正式 start 的凭据初始化，并在权限内协调提供与当前官方底座兼容的完整受管 seed。不得要求独立 QA 修改官方包或禁 viewer 绕过。
2. 前置条件解决后，由 QA 在本树执行：

```sh
bash scripts/dev-env.sh start audio-button-visual-821 omnimux-workflow --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-button-visual-821
```

3. 核验实际绑定后，在正式 ego 正常登录、工作区/会话/音频导入入口完成上表；使用真实鼠标拖拽记录轨迹与 DOM 前后位置，按钮交互保持节点位置不变；读取同次主题 computed style 与 matched rules。
4. 在同一 ego task/Tab 用 `scripts/ego-live-qa.mjs` 的 openL2EgoPage/runPreparedQa 消费实际 `node scripts/agent-live-qa.mjs workflow --target=l2 --url=<实际URL>` 请求，保存 runtimeProof 与真实 PNG。
5. 只有全部适用层通过才可转 `NoOne`；当前独立离线审查可交付，产品 QA 不具备关闭条件。没有后台任务或自动继续循环留存。

## 2026-09-09 授权后的依赖续验

### 授权与本轮写集

用户明确批准正式脚本初始化本任务隔离测试凭据，并允许在私有任务环境通过正式受管接口消费经验证的兼容 viewer；禁止修改官方源码、外部仓、共享 seed/Dev/Prod及产品实现。该授权已消除上轮 A，不能继续索要同一授权。本轮仅更新本报告，原有 `AudioPreview.qa.test.mjs` 修改原样保留；固定 HEAD 仍为 `fad7d7fb0a3da2d8e2b33aa1e461ba94e5c7306b`。不重复已完成两轮离线测试，不把前轮结果写成本轮新跑。

### 外部兼容制品：独立只读核验通过

记忆定位后读取 `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-viewer/.worktrees/issue-3-settings-765/docs/issue-3-settings-765-release-qa.md`。外部 HEAD 实测为 `c46ac8c3bd16c16ce580e326d11758cba7e0759a`；source `ccfc0a7c6cfa692aa737f48d9e8c97c41db82950` 至 HEAD 仅工程报告差异。外部 QA 报告为未跟踪文件，未移动、提交或修改。

精确制品：`/Users/x/Desktop/Project/dsh-plugin/personal/dsh-viewer/.worktrees/issue-3-settings-765/crosery-dsh-viewer-0.1.1-omnimux.765.1.tgz`。

| 本轮实际读取 | 结果 |
| --- | --- |
| 包身份、归档成员 | `@crosery/dsh-viewer@0.1.1-omnimux.765.1`，31项 |
| tgz SHA256 | `555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31` |
| 包内 Host SHA256 | `5d734493f85a85b8cffcc445b7de5d02fdeee4a85b14851a5fb81f4afc5e327e` |
| 包内 Client SHA256 | `ef581017c94a3fdee31d20742201c2886458b69218f6c315b95b18be1ef7c548` |

哈希均与独立发布 QA 一致。该外部报告的90项版本断言、两套严格依赖组合及原生 app-boot 通过是继承的依赖资格证据，不是本轮重跑，更不是 #821 L2/浏览器 PASS。报告第74–76行明确受管单包版本升级能力仍待独立工程提供。

### 受管消费能力：BLOCKED

- 当前未设置 `OMNIMUX_L2_SEED_PROFILE`。实际默认 seed `/Users/x/.omnimux-dev/profiles/omnimux` 的 manifest 仍指向 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`；source 与 installed 版本均实测为 `0.1.0`，source Host SHA256 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`。
- 使用 CLI anchor 实际解析并动态读取官方 settings 导出，退出0，`installSettingsSection` 与 `settingsNamespace` 均 `undefined`。这是当前入口能力检查，未把它称为正式 Host 启动日志。
- 正式 `dev-env.sh:684–689` 只从完整受管 seed 克隆；没有本地 viewer tarball 升级参数。已有 node_modules 不重新克隆。显式 seed 参数接受完整 profile，不接受单个 tgz。
- `managed-tarball.mjs:243–245` 接受明确的私有 L2 目标，但 `248/251` 要求任务根和 profile 已存在；`337–339` 要求 installed target 与输入版本及完整 payload 相同；`365` 拒绝不同的既有 managed source。该入口是相同制品转纳管，不是0.1.0→0.1.1升级入口。Dev 的0.1.0硬限不应被误说成task-only的版本硬限；task-only的实际限制是installed/source一致性。

本轮执行只读 request 模式（未执行事务 run）：

```sh
OMNIMUX_ALLOW_UNMERGED_TARGET=/Users/x/.dsh-dev/tasks/audio-button-visual-821 \
node scripts/managed-tarball.mjs request \
  --managed-tarball=/Users/x/Desktop/Project/dsh-plugin/personal/dsh-viewer/.worktrees/issue-3-settings-765/crosery-dsh-viewer-0.1.1-omnimux.765.1.tgz \
  --expect-name=@crosery/dsh-viewer \
  --expect-version=0.1.1-omnimux.765.1 \
  --expect-sha256=555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31 \
  --target=/Users/x/.dsh-dev/tasks/audio-button-visual-821
```

实际 **exit2**，`{"schemaVersion":1,"status":"rejected","phase":"request","code":2,"message":"missing path"}`。随后读取 `materialize-graph.mjs:18–25` 及确认任务根/profile不存在，定位为路径前置条件；不是sandbox拒绝，也不是新版本实测事务拒绝。即使先正式 start 创建旧seed副本，后续版本/payload限制仍由已读源码确定存在，因此没有为必然不可消费的组合复制凭据、启动旧viewer或制造事务残留。没有手造profile、预装tarball、改manifest、覆盖source、禁bundles、复用别的任务或改变官方底座。

### 当前分层结果

| 层 | 当前结果 |
| --- | --- |
| 源码/离线 | 继承1363包、最终28专项及类型/构建门禁通过；未新增测试轮 |
| viewer候选身份 | 本轮独立哈希/包身份 PASS；未正式消费 |
| 正式L2 | BLOCKED，未start、未初始化凭据、无URL/PID/运行绑定 |
| 视觉/双主题/状态 | BLOCKED，无本次computed style或PNG |
| drag | BLOCKED，无真实鼠标轨迹及DOM前后位置 |
| play/seek/解码 | 离线通过；正常路由浏览器未执行 |
| save/replace | 离线通过；真实落盘、失败重试与替换未执行 |
| native open/reveal | 未执行，不以web或离线请求代替系统效果 |
| shared verify:live | 未创建/消费请求，无pending或PASS冒充 |
| ego | 只读listTaskSpaces退出0；当前仅其他任务73/76，未接管；旧70不在列表 |

### 最小后续动作与 owner

主理人协调**受管升级工程 owner**，在独立工程范围提供现有入口的 task-only 单包版本/payload 升级能力（或已有正式流程生成的完整兼容受管 seed及确切路径/receipt），输入锁定上述 tgz/name/version/SHA。必须保留完整非目标依赖、viewer激活、私有store、锁图核验及事务恢复；不得靠预装输入骗过同payload检查。无需重做 viewer 源码，也无需等待其Issue关闭或修改共享Dev。

此能力未包含在“只改QA报告/测试”的本次写范围，QA不擅自增强 `scripts/managed-tarball.mjs`。获得可消费入口/receipt后，由QA沿用已有授权正式初始化本任务，再核验 `.l2-dev.env`、正常ego登录/工作区会话音频导入及同次shared probe；现有凭据授权无需再次确认。当前没有本代理后台任务、Host或浏览器任务需要回收；本会话无可用原生调度工具，未宣称已建立自动唤醒。主理人收到工程完成证据后续派QA。整体仍不具备关闭条件。
