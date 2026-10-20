---
status: active
issue: 3436
base: 57a6a20b567ba0421f82afc260e4da98af89b60f
---

# 3436 账号监控左栏信息收敛

## 用户操作旅程

1. 打开「灵感社区 → 账号监控」。
2. 左栏列头只看到「监控账号」与「反选 / 重置」；不再看到「选择要查看的账号」提示；全部选中时不再看到「已选 N 个账号」。
3. 每个账号行只看到勾选框、头像、昵称、平台图标、handle；不再看到「正常 / 已停止 / 冷却中」与「N 个作品」。
4. 账号异常时，行内只出现一个警告图标；鼠标悬停显示具体原因；停止账号仍可点「重试」。
5. 勾选/反选/重置仍然实时收窄右侧时间线；账号主页跳转与重试行为不变。

## 实现

- `RivalAccountColumn`：
  - header 改为单行：标题 +（仅子集时）「已选 k 个账号」+ 反选/重置；删除 hint 行。
- `AccountFilterRow`：
  - 删除健康状态文字、作品数、内联原因行、quota 原因弹层；
  - 平台图标移到昵称之后（`.omnimux-rival-filter-platform`：18px 圆角底 + 13px `RivalPlatformMark`/SVG，不使用 emoji）；
  - 非 ok 健康态渲染警告图标：`role="img"`，`aria-label` 为该账号具体原因（停止原因 / 冷却剩余 / 需重新导入 / 重试额度）；tooltip 使用 `position: fixed` 浮层（`box-sizing: border-box`，220px，视口 clamp），hover/focus/点击展示，不依赖原生 title；行 `aria-label` 同时带原因；保留「重试」按钮，busy 时禁用，额度不足时禁用并带 title；
  - 勾选/键盘/主页跳转/重试事件隔离不变。
- `rival-styles.js`：header 单行；紧凑行；警告/平台图标样式；删除状态、作品数、原因行、quota 气泡样式。
- `locales.js`：删除 `rivalAccounts.column.hint`；健康/错误文案保留作为 tooltip 文案。
- 测试：更新账号列渲染、D1 健康四态、布局几何、page e2e；新增断言：无状态文字、无作品数、警告图标 aria-label 含原因、平台图标存在、全选无「已选 N 个账号」、子集显示计数。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 正常账号行 | 无「正常」、无「N 个作品」；平台图标存在；无警告图标 |
| A2 | 停止/冷却/需重导 | 无状态文字；警告图标 aria-label 含原因；停止行有重试 |
| A3 | 列头 | 标题 + 反选/重置；子集计数在标题下方第二行；全选无「已选」；无 hint；200px/英文换行不截断 |
| A4 | 选择/反选/重置/重试/主页跳转 | 不变 |
| A5 | 右栏时间线 | 不受影响 |
| A6 | 200–248px 窄列 / 英文 | 行内容与列头不溢出；tooltip 为 fixed 浮层、完全落在视口内，不受列表 overflow 裁切 |
| A7 | 额度耗尽 | 正常行不出现警告图标；只有非 ok 行可附带额度原因 |

## 验证

插件核心套件、受影响渲染/page e2e、真实浏览器 harness（正常行 + 停止行、平台图标、警告 aria-label/tooltip、列头两种状态、200px/英文截图）、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`。

## 文档影响

纯 UI 信息收敛；不改接口/数据/状态机；#3432 的两栏结构与选择语义不变。
