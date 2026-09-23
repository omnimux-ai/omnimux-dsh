# Issue #2592 — 输入框内视频配置与单行自适应

## 目标 / Objective
用户已通过 exit_plan_mode 批准本规格中的完整方案。仅实施、真实工作树浏览器预验证、自检和交独立审查/QA；禁止合并部署。风险 R1（输入区壳层布局）。基线 origin/main 5b64e389f0c467a9a0aa27cfa50ffff2070e8bf7。

四个快捷入口保留输入框外。仅 clone/selling 的视频模型与参数进入现有 conversation.input.left 底部扩展座、位于技能后。取消/切换会话恢复原显示规则，不串会话。复用 MediaConfigControls、session.js/store.js；参数不因 resize 重置，不新增配置源、不改发送内容或模型路由。删除视频模型按钮旁重复同名摘要 showModelSummary。

所有会话右侧文本模型默认仅现有窄栏模型图标，不显示长名称、effort、chevron。保留原菜单、悬停及无障碍完整名称；避免双图标和误伤其它按钮。

## 已批准完整实现方案 / Plan
1. 审计底部扩展座注册顺序、QuickShortcutModelControls、共享媒体配置与会话存储，确认复用 seam 后再改代码。外部四入口布局不变；内外订阅同一既有状态，不复制配置。条件挂载视频控制区，按 sessionKey 保持正确身份。
2. 在既有 composer 紧凑布局/观察机制中测量当前输入框的正常文字宽度、固定控件区、间距与内边距。目标宽度 = min(当前会话可用宽度, max(原输入框宽度, 控件所需宽度))。只对当前输入框临时居中加宽，边界不得跨左右侧栏；不改消息正文宽度或用户保存的宽度偏好，不改 composer-width-guard 的合法偏好契约。按帧合并更新，幂等属性写入，防止观察器震荡；取消后清除临时宽度。
3. 只有达到可用边界仍不足时压缩长模型/技能文字（保留完整 tooltip），参数摘要变参数按钮；极窄复用现有 icon 密度。内部底栏不换行、不增高、不横向滚动，所有入口与发送可见。核对 session-guide/styles.js 的 important 宽度规则和工具区 overflow hidden；仅任务范围覆盖，菜单不得裁切。
4. 如共享 MediaConfigControls 需 compact 参数，默认 false，媒体面板行为保持不变。复用原浮层/菜单与官方 token，不发明平行控件或主题体系。
5. 先在任务工作树动态端口完整应用进行真实 ego-browser Verify，留截图、几何与交互报告、源码/运行身份；以观察到的 DOM 选择器编写 E2E，执行相关回归并自检。无 ego 不伪造通过，不以夹具或替代正式服务器冒充完整应用。

## 项目结构 / Project Structure
- plugins/omnimux/src/client/composer-quick-shortcuts/：快捷入口、会话状态与内联配置。
- plugins/omnimux/src/client/composer-compact.js：现有紧凑布局、图标与监听。
- plugins/omnimux/src/client/session-guide/styles.js：当前输入框宽度级联。
- 共享 MediaConfigControls 所在媒体模块：仅增量紧凑选项。
- specs/composer-inline-controls.spec.md：本实现真源。
- .agent-reports/composer-inline/：调查与最终 report.md。
- .workbuddy/evidence/composer-inline/：浏览器 PNG、几何与交互结构化证据。

## 命令 / Commands
从本任务工作树执行，具体测试文件由调查后的实际路径确定：
- git diff --check
- pnpm --filter omnimux test
- pnpm verify:stages
- pnpm verify:product-baseline
- pnpm verify:app（完整应用共享入口；自定义巡检复用 scripts/test-env-bootstrap.mjs 的 startTestEnvironment({root,mode:'ui'})，finally cleanup）
不调用合并、部署、真实生成、支付命令。

## 代码风格 / Code Style
沿用文件现有 React 函数组件、具名导出与原状态订阅。样例：`const showControls = entry?.id === 'clone' || entry?.id === 'selling'`；派生显示不成为新的持久配置。几何测量是临时 DOM 状态，不写 session 存储。复用原有监听和 requestAnimationFrame 调度；CSS 官方 --dsw-* token，标准控件高 32px，允许既有 28/24 紧凑变体，禁止硬编码主题色。

## 测试策略 / Testing Strategy 与验收
按 Spec → Code → Verify → Test → Green 顺序。真实预验证完成以前不写 E2E。
- 实际会话可用宽度 320/460/560/720/952：四快捷外部保留；选择复刻或带货后配置位于内部技能后；底栏所有控件正尺寸且无遮挡，同一行、发送可见、无横向滚动或增高。
- 宽屏/normal：所需宽度小于原宽不缩窄；原宽不足则居中增长；边界内足够不得预先缩成 icon。侧栏打开/调整不跨其边界，不改变消息正文宽和保存偏好。
- 长中英文模型/技能、zoom：正常文字先测量，到边界才截短；tooltip/aria 提供完整文本；极窄参数按钮和必要 icon 仍可操作。
- 四快捷切换：仅 clone/selling 显示模型参数；取消/技能移除恢复原规则和原宽；多会话切换不得泄露状态。
- 修改模型/参数再来回 resize：数值不变；目录加载失败显示既有错误/禁用状态不崩溃。
- 视频名称仅一处；右侧文本模型所有会话仅一个模型图标，原菜单鼠标与键盘可开，名称可访问。
- 模型、参数、技能菜单在新位置均不被裁切；深浅色均可见，Tab/Enter/Escape 正常。
- 单元/回归覆盖状态隔离、尺寸派生与默认媒体面板不变；E2E依据真实观察固化关键旅程。真实生成/支付不执行。

## 新用户基线
依赖安装后已有宿主扩展座及媒体目录合同，不依赖开发机私有服务/别名/profile。目录缺失或加载失败使用既有错误显示，不回退开发机配置。浏览器验证仅合成 ui 模式，不读取真实提供方密钥。

## 边界 / Boundaries
总是：只写本任务工作树；遵守 design.md；记录实际证据、未知与未覆盖；主理人安排独立审查和QA。
先问：新增依赖、改持久化协议、发送内容/模型路由、扩大任务或成本。
绝不：改主检出业务源码或其它工作区；改官方宿主；合并/部署/写Dev或Prod；真实生成/支付；绕过门禁或伪造浏览器通过。

## 文档影响
本规格与任务报告记录行为和证据；现有产品/模型/配置合同不变，不改公共合同或工作流规范。
