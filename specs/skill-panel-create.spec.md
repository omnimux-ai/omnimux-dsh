---
title: 技能选择面板与创建入口修复
id: spec-skill-panel-create
type: spec
status: draft
authority: L2
date: 2026-09-23
---

# 目标
技能条目仅显示名称和描述，不显示标题旁的 /slug。底部创建入口启动既有独立创建技能会话，不再把常量假装成已选技能。用户授权本地实现与演示，禁止推送、合并、物化。

## 审计与复用
面板真源 plugins/omnimux-market/src/client/skill-picker.js:99-330；注册在 apply.js composer.tools 槽位。复用 createSkillSession 的独立会话和无损预填能力；复用 api install 的失败拒绝、CREATE_SKILL 身份、已有 banner 和按钮样式。当前 catalog 未内置 skill-creator，安装器会走远端；不凭开发机技能宣称可用，不新增未经验证的技能包。
视觉沿用现有 DSH 字体、令牌、列表、描述与浮层，不重新设计。交互参考现有技能市场创建入口：先确认能力再新建会话；不新增动效。

## 验收标准
1. 打开技能面板，真实行有标题与描述，不存在 sh-picker-slug；名称、描述、slug 搜索与正常选择行为不变。
2. 点击创建，由 createSkillSession({requireReady:true}) 统一安装、新建独立 B、挂载并校验非空 skill-creator 正文及 B/slug 身份，然后通过 B 的官方输入槽预填引导。只预填、不自动发送；A/C 的草稿附件不变，B 已有草稿、图片或非 plain 输入不得覆盖。
3. 安装失败或缺创建能力：原面板仍打开时保留 dialog，并显示 role=status 的 picker.createFail 本地化提示，创建按钮恢复 enabled、aria-busy=false；关闭后失败由 body 独立 role=alert 提示。安装失败 create/open/激活次数均为零；在途连续点击（含重绘后点击）仅一次 onCreate，成功后才激活并关闭。失败收束后可再次点击，每次新尝试恰好增加一次调用，不把 cancelled/prefilled=false 当成功。
4. 安全边界：安装成功后已经创建的 B，在正文挂载失败、预填失败/保护/超时或主动取消时允许保留，禁止自动 delete/detach/close 回滚，以免删除用户后来编辑的会话。安装失败不得创建 B；主动取消不再导航/写入，不伪报成功；真实失败显示提示。已打开 B 的保护失败允许停留 B，未打开的 B 不强行打开。残留不等于预填完成，不承诺自动清理。
5. 页面支持键盘操作，创建按钮 Enter 不得触发列表选择。窄屏检查布局正几何。

### QA-1 搜索退修补充（2026-09-23）
- 直接关联验收第 1 条：预设技能面板输入 `animated-storymode`，等待既有防抖完成后仅显示该技能，不得由后续展示过滤恢复全量列表；无匹配时为空，清空查询后恢复当前分类列表。
- 名称、描述、slug 查询保留大小写不敏感及首尾空白归一化行为；查询与分类取交集。预设白名单仍以 binding.skills 为真源，外部 items 不得注入预设列表，非预设过滤行为不变。
- 最小实施范围：`plugins/omnimux-market/src/client/skill-picker-logic.js` 接收查询参数，`skill-picker.js` 的预设展示调用传递同一个 debounced 查询；新增 `skill-picker-search.test.js` 聚焦单测，不改其它既有失败断言及已完成创建退修。
- 自检命令：`node --test plugins/omnimux-market/src/client/{skill-picker-create,session-create-ready,skill-event-channel,plaza-search,try-skill-session,skill-picker-search}.test.js`。本次最终测试/规格退修禁止构建，保持既有聚合产物 SHA256 `c1d8dd137ab61f580ec2d3589cfaa9570925ea5f8b153ccdf480688a0b98c8fe`。
- 本轮函数回归不是浏览器验收。第二轮独立 QA 须在最新构建的任务隔离应用中真实输入查询、切分类、清空查询并记录结果；本轮不编写未经 Verify 的 E2E，不写共享 Dev/Prod/官方文件。

## 新用户基线
仅依赖产品市场插件、正式安装 API、会话接缝。没有本地创建技能时走已有正式安装流程，远端失败明确提示“创建技能暂不可用，请稍后重试。”不读取开发机技能或配置，不捏造内置能力。

## 命令
- git diff --check
- pnpm --filter omnimux-market test
- pnpm verify:stages
- pnpm verify:product-baseline
- ego-browser nodejs：在任务工作树动态端口观察真实 DOM，截图并保留脱敏身份；任务结束关闭空间和服务。

## 项目结构与代码风格
修改 src/client/skill-picker.js（展示和创建事件）、css.js（删除死样式）、i18n.js（创建状态文案）；测试放同目录与已有 tests/e2e。沿用 h("button", { type: "button", className: "sh-picker-btn" }, tr("picker.create"))、React hooks、双语字典；不加依赖。

## 测试策略
先真实浏览器预验证，再基于实际 DOM 固化行为回归；单测和局部组件证据不冒充完整应用证据，也不宣称全套历史失败已通过。

### 可观察矩阵与责任
- 空查询 + all + 非空预设：仅 binding.skills；空查询 + 分类：binding.skills 与该分类的交集；空预设：始终空。非空查询再与名称/描述/slug 匹配取交集，外部 items 不注入白名单。`skill-picker-search.test.js` 使用固定夹具调用真实纯模块，并通过完整面板片段、持久 hook 槽和受控防抖测试搜索、切分类、清空后的行名称；不截取内部表达式。
- `session-create-ready.test.js`：A/B/C 输入状态均接入实际查找 Map，成功只写 B 一次；保护/超时零写入，回执 false 恰好一次写入尝试；逐项断言 draft-protected、prefill-failed、input-unavailable 与监听清理。
- `skill-picker-create.test.js`：失败重试用例跨重绘复用 ref/state，检查 disabled/aria-busy 从 true 恢复 false，失败提示可见、首次在途 onCreate=1、重试后累计=2；取消不得激活。受控挂起操作在 finally 收束。此为组件逻辑单测，不模拟完整 React 调度或浏览器。
- QA subagent-49 独占 `tests/e2e/skill-panel-create.ego.spec.mjs`，以任务隔离完整应用的真实点击/上传/返回验证 A 草稿附件、B 正文与输入、取消/切换、连续点击、失败重试及零自动发送。零发送须有会话消息/模型请求计数证据，不以“没有点击发送”替代。
- 浏览器依赖项受阻时由 QA 在主仓 `.agent-reports/skill-panel-create/` 保存报告：候选 HEAD/bundle、运行命令/环境、失败步骤与原始错误、已通过项、未执行项、截图/结构化证据、清理回执、责任与下一步。未运行/受阻项标 BLOCKED，不计通过，不得由单测推进为完整验收或合入准入；主理人汇总，工程不代签 QA。
- 官方同步 setDraft 合同作为当前输入接缝前提；异步替代实现不在已证范围。导航快照滞后条件风险继续单列，当前正常宿主成功不得推为所有导航/卸载时序均安全。此轮只处置测试/规格，不修改冻结业务、不构建、不自动发送。

补审背景中“就绪后发送”是已披露的历史输入失真，不构成自动发送需求。本规格与原始用户授权优先。

## 边界与计划
总是：先规格后实现，复用现有函数，保留错误，记录证据；先问：新增分发技能内容或变更运行配置边界；绝不：写官方源码、分发包、外部工作区、Dev/Prod 配置，复制共享 profile，推送或合并。
顺序：审计 -> 提交规格 -> 最小源码修改 -> 浏览器预验证 -> 回归测试 -> 工程报告。文档影响仅此任务规格和报告，未改变公共 API/架构合同。
