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
2. 点击创建，先等待安装成功，再复用 createSkillSession({skipInstall:true}) 新建独立会话，预填创建技能引导，原会话草稿不变，不自动发送。
3. 安装失败或缺创建能力：面板保留，显示中文可理解提示；不得点亮假技能、创建空会话或显示成功。可重试，连点仅一个在途请求。
4. 页面支持键盘操作，创建按钮 Enter 不得触发列表选择。窄屏检查布局正几何。

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
先真实浏览器预验证，再基于实际 DOM 固化行为回归；已有插件全套测试覆盖选择、搜索、独立会话和不自动发送。浏览器局部组件证据不冒充完整应用证据。共享测试引导代码链接 Dev profile，与合同冲突，需审计合法隔离接缝；无合规完整应用启动时如实标 BLOCKED。

## 边界与计划
总是：先规格后实现，复用现有函数，保留错误，记录证据；先问：新增分发技能内容或变更运行配置边界；绝不：写官方源码、分发包、外部工作区、Dev/Prod 配置，复制共享 profile，推送或合并。
顺序：审计 -> 提交规格 -> 最小源码修改 -> 浏览器预验证 -> 回归测试 -> 工程报告。文档影响仅此任务规格和报告，未改变公共 API/架构合同。
