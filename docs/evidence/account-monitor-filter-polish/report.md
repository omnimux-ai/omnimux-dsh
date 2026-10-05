# 账号监控筛选弹层可读性 + 未定义颜色变量（Issue #3171 / #3172）

## 结论

三处问题全部修复，并在真实浏览器中按测量取证（不是靠样式文本断言）。

| # | 问题 | 根因 | 修复 | 改前 → 改后 |
| --- | --- | --- | --- | --- |
| 3171-1 | 筛选列表最后一行要滚动才看全 | 列表写死 `max-height:240px`，四行（含一个两行原因行）实测 272px | 上限提到 `320px`（272px 实测 + 余量），账号更多时仍按列表自身滚动 | `scrollHeight 272 > clientHeight 240`（需滚动）→ `293 == 293`（不滚动，`scrollTop 0`） |
| 3171-2 | 冷却行昵称被压成省略号 | 昵称 `flex:0 1 auto` 独自承受全部挤压；状态文字 `flex:none` 且不换行，冷却行状态文字最长（115px）；原「保护昵称」的 `min-width:96px` 从未生效（信息列实测已 195px） | 昵称 `flex:none` 不参与压缩；昵称行 `flex-wrap:wrap`，放不下时状态文字整体落到第二行；删除从未生效的 `min-width` 规则 | 冷却行昵称 50px 且 `scrollWidth > clientWidth`（截断）→ 60px 完整显示；状态文字「冷却中 · 42 分钟后恢复」换到第二行，行高 51 → 72 |
| 3172 | 两个提示条没有底色 | `var(--dsw-alias-bg-tertiary)` 在任何真实令牌来源中都不存在（组件库只定义 bg-base / bg-elevated / bg-layer-1 / bg-layer-2 / bg-mask-1），浏览器丢弃该声明 | 改用已定义、且与本文件其它浅浮起表面一致的 `--dsw-alias-bg-layer-2` | 提示条底色透明 → `rgba(255,255,255,0.07)`；反向对照（故意用未定义令牌）仍为 `rgba(0,0,0,0)` |

## 验收装置的两处修正（否则缺陷会被装置本身掩盖）

1. **验收页原先自己定义了 `--dsw-alias-bg-tertiary`**（从早前验收页逐字复制的令牌块），于是 3172 在测量中「看起来有底色」。已从验收页删除该行，并留注释说明为何不能补。
2. **验收页原先没给宿主高度**，账号监控页自带的滚动容器只有 468px 高，把浮层下沿裁掉（面板到 582px），看起来像「第四行被裁」——那是验收页失真。已按真实窗口高度挂载宿主（`height: calc(100vh - 48px)`，实测容器 825px），复测面板 582 ≤ 容器 849，末行完整可见。

## 判据（真实浏览器，`harness-results.json` 为原始数据）

- 列表：`scrollHeight === clientHeight === 293`、`scrollTop === 0`、`needsScroll === false`
- 四行：`inListView` 全为 true，`nameTruncated` 全为 false，冷却行昵称宽 60px
- 提示条：`background-color` 非透明；未定义令牌反向对照透明
- 静态：本插件源码内 `--dsw-alias-bg-tertiary` 引用 0 处

## 回归

- `pnpm --filter omnimux-inspiration test`：1097 tests / 1095 pass / **0 fail**；插件端到端 261 / 261 pass；`REAL_EXIT=0`
- `pnpm verify:stages`：PASS（14 Stage 组件、8 侧栏目标）
- `node --test scripts/verify-anti-slop.test.mjs`：PASS
- `git diff --check`：干净

## 未覆盖

- 开发版真机验收归人工（Agent 不重启应用）。
- 验收页是独立挂载真实 `InspirationStage`（仓库 react + 仓库 ui-kit 替身 + 插件自身注入样式），不是完整应用外壳；浮层与外壳的层叠关系未在真机验证。
