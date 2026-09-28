---
title: "输入框底栏浮层单例互斥规范与协调中枢契约 (Composer Overlay Mutual Exclusion Contract)"
id: "contract-composer-overlay-mutual-exclusion"
type: "contract"
status: "active"
authority: "L1"
date: "2026-09-28"
authors: ["齐活林", "许清楚", "高见远", "裴像素"]
subsystem: "omnimux"
---

# 输入框底栏浮层单例互斥规范与协调中枢契约

> **生效范围**：`plugins/omnimux`（输入框宿主壳层与原生命令增强）、`plugins/omnimux-market`（技能选择器、模型选择器）及所有挂载于 `[data-composer-card]` 内部的弹出层组件。  
> **核心目标**：彻底消灭加号指令列表、技能面板、模型选择面板多浮层共存与穿模遮挡，建立作用域级单例互斥协议。

---

## 1. 交互原则与心智契约

1. **单例互斥铁律 (Exclusive Popover Law)**：
   在会话输入框（Composer）物理边界内，任何时刻最多只允许存在**一个**处于激活展开态的上下文弹出层（Popover / Menu / Dialog）。
2. **意图切换即收起 (Context Handoff Dismissal)**：
   当任一浮层处于展开态时，用户点击输入框底栏上的其他上下文选择器或操作入口，系统认定用户已发起新的操作意图，旧浮层必须立即、无感收起。
3. **Esc 与外部点击兜底 (Light Dismiss Guarantee)**：
   按 `Escape` 键或点击输入框外部空白区域，必须清空当前所有活跃浮层，焦点平稳交还给输入框。

---

## 2. 全局浮层协调总线协议 (Overlay Coordinator Protocol)

统一通过 `window` 自定义事件进行跨插件无耦合广播与状态同步：

- **打开事件**：`omnimux:composer:overlay:open`
  - `detail`: `{ id: 'plus-menu' | 'skill-picker' | 'model-picker' | string }`
  - 触发时机：任一浮层在确认即将展开前派发。
  - 响应契约：所有接入浮层在收到非自身 `id` 的通知时，若自身当前处于 `open` 状态，必须立即调用收起逻辑。
- **收起事件**：`omnimux:composer:overlay:dismiss`
  - `detail`: `{ id?: string }`
  - 触发时机：外部全局动作要求收起指定或所有浮层。

---

## 3. 浮层成员接入规格

| 浮层标识 (`id`) | 归属插件 | 触发器选择器 | 打开时动作 | 关闭执行器 |
| :--- | :--- | :--- | :--- | :--- |
| `plus-menu` | `omnimux` (原生 DSH 增强) | `button[aria-haspopup="listbox"]` | 派发 `overlay:open` (`plus-menu`) | `dismissPlusMenu(doc)` (触发展开态加号按钮安全收起) |
| `skill-picker` | `omnimux-market` | `button[data-omnimux-skill-picker]` | 派发 `overlay:open` (`skill-picker`) | `close()` (`setOpen(false)`) |
| `model-picker` | `omnimux-market` | `button.sh-model-capsule-btn` | 派发 `overlay:open` (`model-picker`) | `close()` (`setOpen(false)`) |
