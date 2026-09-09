# Issue #821 音频按钮视觉修复工程报告

## 结论与状态

- 工程自查 `IS_PASS: YES`，限代码一致性、离线回归、类型检查及构建；不是独立 QA、真实视觉或 L2 放行。
- 用户要求的本地最小修复已完成，交主理人审核并另派独立 QA。未 push、创建 PR、merge、共享 Dev/Prod 物化或跨工作区修改。
- 风险：R2，单插件非破坏性视觉修复及移除明确诊断导出。沿用 #821 的修复上下文；#827 是历史已合并 PR，不代表本次发布。

## 精确版本与隔离

- 主仓：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`
- Worktree：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-button-visual-821`
- Branch：`agent/workflow-audio-button-visual-issue-821`
- 本次 fetch 后 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`
- 已验证源码 commit：`4734326b816c1d2831c8f628217ebd8f86aa3435`
- 报告提交后的最终 HEAD 由交付消息给出；报告不改变已验证源码。
- 主树原有 `videoCompositionStatus.ts`、`videoCompositionStatus.test.mjs` 两个改动保持原样，没有 stash/reset/切分支。
- `scripts/git-wt.sh` 第167行仍创建仓外兄弟目录，与当前严格内聚规则冲突，因此使用 `git fetch origin main`、`git check-ignore .worktrees/audio-button-visual-821`、`git worktree add -b agent/workflow-audio-button-visual-issue-821 .worktrees/audio-button-visual-821 origin/main`。没有修改脚本或规范。
- 仅在任务树创建 node_modules 软链接，消费主仓已有依赖；没有安装、清除、升级共享依赖。生成文件保持忽略、不提交。

## 代码变更

1. `plugins/omnimux-workflow/src/canvas/theme/components.css`
   - 删除 `.wf-audio` 局部7个 surface/border/text 蓝灰覆盖，继承 `workbench-theme.css` 的主题层。
   - 保留透明外壳、两行布局、44px真实波形区、拖拽相关 pointer-events、所有状态文案。
   - 播放及保存使用中性 Secondary 填充；替换、本地 open/reveal、重试使用 Ghost 图标按钮。
   - 同场景控件统一32px高、8px圆角，图标按钮32px宽；删除36px圆形黑阴影及28px/6px局部覆盖。
   - 统一13px按钮字阶、120ms background/border/color/transform 过渡；保留focus-visible、disabled、reduced-motion，补全 hover 边框/文字及 active 填充。
2. `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx`
   - 所有音频操作SVG统一16px；重试复用同一按钮类获得一致几何和状态。
   - 未改播放暂停、真实波形解码、seek/键盘、保存、open/reveal、替换、错误与取消逻辑，未移除事件隔离。
3. `plugins/omnimux-workflow/src/canvas/index.tsx`
   - 删除 `export { useCanvasStore }`，保留正式 mount/update/unmount 和既有 useTextStageStore。
   - `git show c5d1bf3ee` 证实该导出由 #827 新增；仓内搜索没有生产消费者，内部组件仍正常直接导入 store；CanvasBridge lifecycle 测试通过。

## CSS 冲突调查与证据界限

- 基线 `.wf-audio__button` radius=6px，随后同特异性 `.wf-audio__play` radius=50%，播放源码自然级联应为50%；actions更高特异性的28px/6px规则只匹配第二行按钮，不匹配transport内播放。
- `injectStyles.ts` 顺序为xyflow、workbench theme、components、table、text-stage、prompt editor。工作树中搜索音频选择器无第二套定义。
- 检查到的8px `!important` 是 Ant 下拉条目和hub登录/会话专属选择器，不匹配音频播放按钮。没有发现可解释旧截图圆角方形的仓内匹配覆盖。
- 因此旧截图与源码的冲突原因保持未确认，不能猜缓存或声称已定位运行时CSS来源。本补丁使源码显式符合32px/8px；独立QA须在正式L2读取真实加载脚本、匹配样式与computed style完成闭环。

## 实际执行记录

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pwd` | 0 | 授权项目主仓 |
| `git fetch origin main`及隔离建树 | 0 | base如上 |
| `pnpm --filter omnimux-workflow test` | 1 | pnpm自动install触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，未执行测试；没有启用purge |
| `pnpm verify:stages` | 1 | 同一pnpm bootstrap问题，未执行门禁 |
| 插件目录 `npm test` | 0 | 1363 tests，1363 pass，0 fail，0 skip；使用package.json完全相同node test脚本 |
| 插件目录 `npm run typecheck` | 0 | canvas与host两份tsconfig |
| 插件目录 `npm run build` | 0 | host 1489308 bytes、client 172861 bytes、canvas 2109962 bytes；均任务树内生成 |
| 根目录 `node scripts/verify-stage-contracts.mjs` 首次 | 1 | market缺少本树node_modules导致无法解析dsh-ui-kit；未改产品代码 |
| 同命令，链接现有包依赖后 | 0 | 10 Stage components，8 registered sidebar targets |
| 下列专项 `node --test` | 0 | 26 pass、0 fail、0 skip；lifecycle测试有React同步unmount warning，未隐藏 |
| `git diff --check` | 0 | 源码与报告阶段复核 |
| 完整三文件diff与主树状态复核 | 0 | 无ConfigPanel及无关源码改动 |

专项命令，工作目录为本树 `plugins/omnimux-workflow`：

```sh
node --test src/canvas/editor/components/MaterialNode/AudioPreview.test.mjs src/canvas/editor/components/MaterialNode/AudioPreview.qa.test.mjs src/canvas/editor/hooks/useSaveRemoteAudio.test.mjs src/canvas/editor/hooks/useSaveRemoteAudio.qa.test.mjs src/canvas/editor/utils/audioWaveform.test.mjs src/client/CanvasBridge.lifecycle.test.mjs
```

包完整输出保留在本worktree `audio-package-test.log`（忽略的本地文件）。JSDOM与mock媒体只能证明离线组件行为，不是浏览器解码、系统播放器或真实拖拽证明。没有新增只重复CSS数字的脆弱测试，没有改已有测试以获得通过。

## 全局一致性自查

- CSS类和JSX对应，无新增依赖/循环引用/接口变化。
- 更改仅涉及视觉属性与诊断出口，音频功能实现完整保留。
- 保存与替换仍为不同操作，远端保存后本地open/reveal分支不变，错误与重试仍可达。
- 圆角与尺寸由单一基类控制，无私有色板及36/28px按钮覆盖。
- `IS_PASS: YES`，工程可交独立QA；整体产品验收仍未完成。

## 下一步独立 QA 可执行入口

执行者：主理人另派的独立QA。实施者没有互相委派。

1. 在上述worktree复核最终HEAD及源码commit差异。先检查正式受管seed包含兼容viewer及完整bundles；不可禁viewer绕过 `installSettingsSection` 错误，也不可改官方DSH或跨工作区文件。本次没有尝试启动L2，因此不声称该错误当前已复现或已修复。
2. 正式入口（本树根目录执行）：

```sh
bash scripts/dev-env.sh start audio-button-visual-821 omnimux-workflow --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-button-visual-821
```

该入口写入任务profile并可能初始化凭据，执行前由主理人确认相应授权及完整受管seed，不能以“仅本项目”推定跨目录凭据bootstrap权限。不得手造profile/私有harness、杀未知端口或修改共享Dev。读取实际 `.l2-dev.env`，核对SOURCE、COMMIT、URL、PORT、PROFILE_DIR及Host身份；本次未分配端口，不提供猜测URL。

3. 加载ego-browser技能，用 `scripts/ego-live-qa.mjs` 的 `createEgoPage/openL2EgoPage` 进入该任务正式登录入口。以实际池内URL创建请求：

```sh
node scripts/agent-live-qa.mjs workflow --target=l2 --url=<实际L2-URL>
```

同一ego任务/Tab调用 `runPreparedQa` 消费该次请求。pending/exit2不算通过。

4. 通过正式工作流/项目/音频导入入口使用真实可播放的项目文件及有效远端音频，覆盖：
   - 深浅主题、常规与窄视口、中英文长标签；播放/保存/替换 computed height/radius/SVG、默认/hover/active/focus/disabled/reduced-motion。
   - 真正点击播放、暂停、结束、seek鼠标与键盘，时间及真实波形对齐。
   - 保存成功落盘和失败重试，本地open/reveal，替换后源与时间重置，错误/缺失文件状态。
   - 用真实指针从外壳/波形拖动节点，记录前后DOM位置和交互；操作按钮不得误拖节点。
   - 保存/失败状态与重试32px按钮在紧凑行不裁剪、中文不溢出。
5. 真实PNG、matched CSS规则、computed style与runtimeProof绑定同一run/commit/profile。禁止注入 `#qa-canvas-container`、example.com/demo.mp3占位源及store改位置冒充拖拽。

## 未执行与关闭条件

- 独立QA/L2/ego-browser视觉与交互：未执行，按本次分工交主理人另派，不是PASS。
- 远端CI：未触发，没有push/PR权限；没有merge或Dev/Prod物化。
- 本地原生open/reveal完整系统效果需适用的真实平台证据，单元测试只验证请求与错误映射。
- Worktree保留供审核，不清理未合并成果。本次工程交付就绪，整体BugFix待独立真实QA，不能关闭为已验收。
