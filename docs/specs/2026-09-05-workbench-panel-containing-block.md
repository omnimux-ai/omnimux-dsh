---
title: "工作台分栏面板的定位容器"
id: "spec-workbench-panel-containing-block"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-05"
updated: "2026-09-06"
authors: ["agent-architect"]
subsystem: "omnimux"
---

# 工作台分栏面板的定位容器

关联 [#610](https://github.com/omnimux-ai/omnimux-dsh/issues/610)、[#552](https://github.com/omnimux-ai/omnimux-dsh/issues/552)。

## 问题与根因

官方 better-sidebar 的 `[data-dsh-panel-host]` 是全视口定位容器，使用 `position: fixed; inset: 0`。右侧工作台面板位于其中，以 `position: absolute; right: 0` 定位。容器与面板不是同一宽度控制对象。

Hub 分栏 CSS 对容器和面板同时施加 `max-width`，改变了子面板的定位基准。Dev 实测视口 1324px、分栏上限 684px 时，容器被压到 684px；624px 的右面板落在 x=60，盖住会话输入框。输入框虽存在且状态为 split，其中心命中灵感库，而非输入框。顶部按钮修复 #579 不改变这条宽度路径。

L2 窄窗验收还确认：视口从 1280px 缩到 980px、侧栏自身尺寸不变时，已有监听不会更新分栏上限。920px 的旧上限使面板重新覆盖输入框。窗口 resize 必须复用现有宽度同步，同时保持 GUI/chat/split 意图和拖拽期间仅更新 CSS 上限的规则；卸载时移除监听。

## 已确认实现边界

- 保持官方容器的全视口几何；分栏上限仅作用于真实右侧面板。
- `findWorkbenchPanelElement` 解析真实面板，不返回定位容器本身，也不把底部面板、resize handle 或无关 dragging 节点当作工作台。
- 复用已有分栏上限、用户宽度记忆和拖拽生命周期；不新增布局协调器、尺寸常量或历史兼容路径。
- 保留 #505 拖拽释放后的会话最小宽度保护，以及 GUI/chat/split 模式切换。
- 不改灵感复刻、附件、草稿保护、官方新会话、Tab/画布开关和 #579 顶部按钮实现。

实现限定为 Hub `workbench.js` 与相应回归测试；本规格和索引随同交付。

## 验证

1. 真实 wrapper 层级回归在旧实现失败、修复后通过；容器无 panel 标记、无宽度写入、无 split max-width，真实面板才被选择和限制。保留拖拽、GUI、窄窗格及无关节点测试。
2. 运行 Hub 相关测试、Stage 和边界检查，以及适用 required CI。
3. 当前提交的隔离 L2 使用 ego-browser 和共享 Stage 探针。分栏断言同时包含几何与命中：容器宽度等于视口，右面板贴右，composer 有可见尺寸且中心命中自身或子节点。不能以 `focus: split` 或 DOM 存在代替可用性。
4. 在任务自有会话中复核灵感预填、附件、原草稿保护、预览关闭及原 Tabs/画布保留；不发送消息或调用真实模型。录制该零模型 UI 流程 GIF，明确展示提交和实际范围。
5. 经独立最终验收与 Merge Queue 合入后，由统筹在授权窗口物化 Dev，复验同一路径。L2 被浏览器阻断时保留未验收状态，不用共享 Dev 或 HTTP 替代。

## 架构影响

本修复恢复既有 Host 容器与 Hub 面板的几何边界，不改变插件入口、模块职责、业务 Tab 选择、数据流、存储、SSE 或运行环境；无需改架构总览。不得把当前主工作区中他人未提交的架构文档纳入本交付。
