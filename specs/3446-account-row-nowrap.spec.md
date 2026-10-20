---
status: active
issue: 3446
base: cb1a5c148acdef6f3cfb397e5d964d6cdaed2da6
---

# 3446 账号行不换行 + 警告图标固定昵称右侧

## 用户反馈

1. 账号行换行：长昵称把平台图标、警告图标挤到第二行。
2. 要求不换行、限制长度（昵称/handle 截断）。
3. 警告图标固定在「昵称右侧」同一行的最右侧（图 2 红圈）。
4. 列头同样不换行、按长度截断。

## 实现

- 行：
  - `.omnimux-rival-filter-name-row` → `flex-wrap: nowrap; min-width: 0`；
  - 昵称 `.omnimux-rival-filter-name` → `flex: 0 1 auto; min-width: 0` + 单行 ellipsis；
  - 平台图标紧随昵称（flex none）；
  - `.omnimux-rival-filter-status` 保持 `margin-left:auto; flex:none`，始终固定在昵称行最右；
  - handle 单行 ellipsis + `max-width:100%`；
  - ≤960px：昵称最小宽度 36px，隐藏 hover 主页跳转，重试改图标（aria-label/title 保留），子集计数隐藏；
  - 标题单行 ellipsis，绝不被容器硬裁。
- 列头：
  - `.omnimux-rival-accounts-head` → `flex-wrap: nowrap`；
  - `.omnimux-rival-accounts-titles` 改为横向 flex，标题不收缩、摘要 `flex:1 1 auto` + 单行 ellipsis；操作按钮 flex none；
  - 删除 `overflow-wrap:anywhere`（不再换行）。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 长昵称行 | 行高与普通行一致；昵称单行省略；平台/警告图标不换行 |
| A2 | 警告位置 | 警告图标与昵称同一行、行最右侧（红圈） |
| A3 | 列头 | 单行；摘要过长省略；按钮不换行 |
| A4 | 200px / 英文 | 不换行、不横向溢出；昵称仍有 ≥36px 可见宽度；标题省略号；tooltip 仍可见 |
| A5 | tooltip/重试/选择 | 行为不变 |

## 验证

插件核心套件、page e2e（警告/平台图标 DOM 位置契约）、真实浏览器几何（248/200/EN：行长一致、昵称 ellipsis、警告右对齐、无横向溢出）、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`。

## 文档影响

纯布局收敛；不改接口/数据/状态机。
