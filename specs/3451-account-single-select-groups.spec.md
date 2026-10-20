---
status: active
issue: 3451
base: c736cf922e3b13a244bd8faf8f237130fcd70f30
---

# 3451 账号监控左栏：单选分组导航 + 更多/删除

## 用户需求

不要多选；用分组方式；默认「全部」；点击任意账号切换该账号内容；鼠标悬停显示「更多」，菜单支持删除。

## 实现

- `RivalAccountColumn` 改为单选导航：
  - 顶部「全部」项（默认选中）；按平台分组（`platform.*` 文案），组内列账号；
  - 点击账号 → `feed.selectAccount(id)`（selection={mode:'subset',ids:[id]}）；点击「全部」→ `feed.resetAccounts()`；
  - 删除复选框、反选、重置、已选摘要；行 `role="button"` + `aria-current`。
- 行悬停显示「更多」按钮（kebab），点击不选中；菜单固定定位、点外/Escape 关闭：
  - 「删除」首点变为「确认删除」，二次点击执行；
  - 调用现有 `removeRivalAccount(id)`；成功后 `feed.reload()`；若删的是当前账号先 `resetAccounts()`；失败显示错误并保留行。
- `use-rival-feed` 新增 `selectAccount(id)`（复用 commitSelection）。
- `InspirationSection` 接线 `onSelect` / `onRemove`；删除使用现有 DELETE 接口，不改 Host。
- 行保留头像、昵称、平台图标、警告图标/重试、主页跳转。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 默认 | 「全部」高亮，右侧全部内容 |
| A2 | 点击账号 | 只看该账号；该行高亮；「全部」取消高亮 |
| A3 | 分组 | 按平台分组且组标题正确；无多选框/反选/重置 |
| A4 | 悬停更多 | 行右侧出现「更多」，点击不切换账号 |
| A5 | 删除 | 二次确认；DELETE 成功后行消失、内容刷新；失败提示且行保留 |
| A6 | 删除当前账号 | 回到「全部」 |
| A7 | 警告/重试/主页跳转 | 行为不变 |

## 验证

插件核心套件、page e2e（单选、分组、更多菜单、删除成功/失败/当前项）、真实浏览器证据（分组/单选/更多/删除确认）、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`。

## 文档影响

左栏交互模型变化；右侧时间线与 Host 接口不变。
