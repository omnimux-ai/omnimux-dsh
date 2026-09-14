# Sidebar fullscreen entry — #1765

## 1. Objective（目标）
用户已批准：左导航保持原样，右工作台直接平滑铺满余区，进出相同节奏，不经过整页全屏。先在独立页面装配实际原生组件及插件生产桥接，展示修正，不触碰当前运行页面。

### 19:22 补验约束
新增 1024 宽度组合，与 1440×900、1200×800 一同覆盖导航两态。必须从动画结束且几何稳定开始，反向为真实指针输入，click 事件实测 isTrusted=true；HTMLElement.click、强制点击及虚拟时钟不得代签。额外记录关闭重开及内容滚动位置保持。完整矩阵、录制演示、响应全程均为必需项；任一失败/缺项则总体 false。
失败必须在释放页面前保存候选按钮属性、祖先 inert/hidden、命中遮挡、几何及截图；记录原始错误，清理失败不能遮盖原错。空间、证据目录显式传入且每轮目录独立，原结果不可覆盖。仅确认原因调整后重试一次；不得无限采样或伪造帧。阶段 A 经父代理复核后才启动唯一补验页。

### 精确验收
桌面视口 1440×900、1200×800，各从左栏展开和折叠两态开始，实际点击已观察到的原生全屏按钮，再点击退出。
1. 每帧记录 frame/left/center/panel 的 rect、grid-template-columns、position、transform、transition 属性/时长/缓动、根 collapsed 属性、panel mode、store width/layout；捕获点击前后、MutationObserver、rAF 和动画事件时间线。
2. 展开导航全过程 x/width/right 与初始值偏差 ≤1 CSS px，collapsed 属性不变；折叠导航保持折叠，不意外展开。面板左边界始终 ≥导航右边界−1，不出现全视口覆盖导航再缩回。
3. 进入终态 panel.left=导航右边界±1，panel.right=视口宽±1；退出恢复初始分栏宽±1。中间帧边界介于起终值之间，无越界回跳；进入左边界单调非增/宽度非减，退出相反，单帧误差容差 1 px、累计反向行程 ≤2 px；每次用户反向点击重新分段，以点击时实测值作为新起点。有至少两个不同的中间几何样本，证明非瞬跳。
4. 进入/退出的 computed transition 属性集合、duration、timing-function 相同并来自原生动画参数；记录原生 token 的源码/实际样式来源。比较各自 10%→90% 归一化进度的运动持续时长，而非绝对停止时刻；差值容差为 max(2 个实测帧周期, 较长时长的 20%)。每次采样覆盖终态稳定后 500ms（包含原有 320ms settle 回写窗口），总上限 2s，采样空洞不补造。
5. 快速反向：进入后运动过程中点击退出，再反向进入，最终状态与最后点击一致，左导航不变，无残留过渡/错宽。避免固定超时控制生产行为；测试以活动动画/实测几何进度作为触发依据。
6. prefers-reduced-motion:reduce 下次帧到稳定目标，无非必要动画；重开普通模式后行为恢复。
7. 全过程同一内容 DOM 节点保持 connected，navigation entry/页面实例标识不变；可见且可交互的全屏按钮数量=1，无重复按钮；内容正面积、不出现未覆盖空黑区。截图覆盖初态、中间帧、终态与退出态，JSON 与 PNG 绑定同一运行和代码身份。
未取得上述真实浏览器证据不得宣布修复完成；源码嫌疑不等于用户现场根因。

## 2. Commands（命令）
在本任务工作树根执行：
- `git diff --check`
- `node --test plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`
- `pnpm --filter omnimux test`
- `pnpm --filter omnimux build`
- `pnpm verify:stages`
- `ego-browser nodejs`：真实源装配服务由任务报告记录精确启动命令、动态端口、PID 和 URL；同次最终调用的 finally 尾部 `await task.finish({ keep: [] })` 并确认关闭；空间丢失/用户接管时按浏览器生命周期约束停止，不声称已取得 finish 回执。
完整输出保存 `.agent-reports/sidebar-fullscreen-entry/`。不执行 sync、push、merge。

## 3. Project Structure（项目结构）
- `plugins/omnimux/src/client/sidebar-toggle-topbar.js`：现有按钮捕获监听和全屏样式。
- `plugins/omnimux/src/client/workbench/{split-layout,rail-sync,geometry}.js`：实际聚焦、分栏记忆与几何。
- `plugins/omnimux/src/client/{conversation-collapse,conversation-box}.js`：实际会话折叠与网格。
- `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`：既有相关测试；最小回归在观察后落地。
- `docs/superpowers/specs/2026-09-14-sidebar-fullscreen-entry-design.md`：获批设计。
- `docs/superpowers/plans/2026-09-14-sidebar-fullscreen-entry.md`：细粒度计划。
- `.agent-reports/sidebar-fullscreen-entry/`：独立源装配、截图、逐帧 JSON、构建/测试结果及 implementation.md。
桌面 fork 的 AdvancedFrame、DesktopLayoutState、原生 sidebar-right 组件与 CSS 只读导入；不得复制后修改官方源。现有简单 qa-pane 或 CSS empty loader 不作为动画验收。

## 4. Code Style（代码风格）
保持仓库 ESM、单引号和无分号风格，复用原生 token、既有安装器和 disposer；不创建平行按钮/布局状态机。现有真实代码模式：
```js
const record = updateFocusRecord(mode, sessionId, effectiveTabId)
syncConversationCollapsedForFocus(mode, sessionId)
store.reduce((current) => resolveNextFocusState(current, options))
```
该样例仅说明代码风格，不预先承诺保留其写入顺序。先由真实 DOM 确定最小修改。

## 5. Testing Strategy（测试策略）
先真实原生 DOM 无修正复现并持久化失败断言；再最少生产修改；复测红转绿后固化正式回归。正式 E2E 定位只使用真实 snapshot 得到的语义/稳定属性，不提前猜测。实际桥接必须运行生产 setFocus/install，不能由测试接缝替写预期状态。单测验证意图/宽度记忆，真实浏览器验证几何/运动/节点保留，全量插件测试与构建验证集成。每条验收记录 PASS/FAIL/BLOCKED 和证据，不以未运行或零用例充当通过。

## 6. Boundaries（边界）
总是：先规格提交；记录基线/文件哈希/运行身份；只修改自己的隔离树；使用原生缓动；保存五区报告和精确清理回执。最新 AGENTS 的隔离 Web 验收优先于技能中的旧共享 Dev 要求。
先问：需要修改官方源/桌面 fork、改依赖版本、扩展目标或共享环境操作时停止受影响动作并报父代理。
绝不：主仓写源码/镜像规格、改 #1761 树、push/merge/物化、改守卫、用 timeout 掩盖、手造 CSS 假页面、自造桥接冒充产品、把旧自动折叠根因当本轮实证。

## 文档影响及自审
新增设计、规格、计划和任务证据，既有公共产品契约无行为授权扩展。六区齐全，验收可测，旧报告事实与推断明确分开；用户已直接批准设计及本地实施，不重复请求批准。
