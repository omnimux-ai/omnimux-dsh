---
title: "分栏分割线拖拽回归原生网格 · 验证证据"
id: "fix-native-split-drag-verify"
date: "2026-09-15"
subsystem: "client"
---

# 分栏分割线拖拽回归原生网格 · 验证证据

## 环境

- 目标：Dev App（OmniMux 2.0.9，advanced/darwin），视口 1728×994，CDP 9229。
- 方法：`Input.dispatchMouseEvent` 真实鼠标序列（press → 6×move → release），每步读取手柄左缘、
  右侧面板左缘、会话列右缘，以及面板的计算 `position` 与 `transition-property`。
- 脚本：`tmp/verify-corrected-css.mjs`（读取本工作树源码中的 CSS 常量注入运行中的渲染进程）。

## 源码检查

| 断言 | 结果 |
| --- | --- |
| 分栏态未限定规则残留 | false（已清除） |
| 全屏态规则存在 | true |
| `min-width:420px!important` 规则残留 | false |
| `min-width:0!important` 存在 | true |

构建产物审计（`plugins/omnimux/lib/client.js`）：

| 断言 | 结果 |
| --- | --- |
| 任何把分栏面板置为 `position: fixed` 的规则 | 0 条 |
| `min-width:420px` | 0 处 |

## 修复前（基线，Dev App 现状）

| 指标 | 实测 |
| --- | --- |
| 拖拽中面板左缘与手柄偏差 | 最大 71px（黑缝） |
| 拖拽中面板计算 `transition-property` | `width, transform`（0.3s） |
| 拖拽中面板计算 `position` | `fixed` |
| 拖到最宽画布时会话列与面板间隙 | -20px（会话列溢出轨道，露出近黑底色） |

## 修复后（注入本工作树修正 CSS）

| 场景 | 跟手偏差 | 黑缝 | position | transition |
| --- | --- | --- | --- | --- |
| 向右拖拽（6 步） | 恒 4px | 恒 0px | absolute | transform 0.3s |
| 向左拖拽（6 步） | 恒 4px | 恒 0px | absolute | transform 0.3s |
| 拖到最宽画布（原发场景，6 步） | 恒 4px | 恒 0px | absolute | transform 0.3s |

4px 是原生手柄自身的半宽（手柄宽 8px，左缘落在列边界前 4px），属于外壳既有几何，
修复前后一致，不是偏差。修复前该值在拖拽中会漂移到 -27…-60px（向右）与 +35…+71px（向左）。

## 单元测试

`plugins/omnimux` 客户端定向套件：`sidebar-toggle-topbar.test.js` + `sidebar-collapse-hidden.test.js`
共 61 项，61 通过 0 失败。两处断言已由「锁定 fixed 定位 + 宽度过渡」改为「锁定原生网格几何」。

## 既有失败（与本改动无关）

`plugins/omnimux/src/text/references.test.js` 在**纯净 main 检出**上同样失败
（`guardCode: research_not_verified`，模型契约状态），非本次回归。

## 未覆盖

- 未在本工作树内启动完整应用（`pnpm verify:app` 仅接受 `<repo>/.worktrees/<task>` 下的 root，
  本工作树为仓库同级目录）；验证改为在真实 Dev App 渲染进程上注入本工作树的 CSS 常量。
- 左栏收起态与会话列收起态只做了源码级回归检查（相关规则未改动），未做拖拽实测。
