# 规范：左侧栏宽度自反馈收缩修复 (Hub Sidebar Width Feedback Loop)

Issue: [#1618](https://github.com/omnimux-ai/omnimux-dsh/issues/1618)

## 1. 目标 (Objective)

开发版（OmniMux Dev 2.0.9 / profile `omnimux` / 45120）静置无交互时，右侧工作台左边界持续左移并最终覆盖整条左侧侧边栏；`ResizeObserver loop completed with undelivered notifications.` 反复出现。

真实环境（CDP 9229）实测根因链：

1. `installSidebarToggleTopbar` 用 `new ResizeObserverClass(syncGeometry)` 观察 `findSidebarColumn(doc)`（`[class*="sidebarCol"]`）等节点，回调在 ResizeObserver 交付周期内**同步**改写布局，每 ~8.3ms 触发一次。
2. `syncGeometry → applyTopbarToggleCssVars` 把 `computeChromeLayout().leftRailW`（= `sidebarCol.offsetWidth`）写进 `--omnimux-sidebar-width`。
3. `conversation-box.js:218-221` 在 `html[data-omnimux-conversation-collapsed]` 下用 `!important` 把 frame 首列钉到 `var(--omnimux-sidebar-width, 280px)`。
4. 于是「被测量元素」的宽度是「被写入值」的函数：任一次不可信读数（瞬态重挂载、拖拽中间态、嵌套 `[class*="sidebarCol"]` 节点）都会被写回并自我确认。

实测证据：首列宽度 156 → 151 → 147 → 142 → 138 → 133 → 129 → 124 → 119 → 115px 单调收缩（≈7px/s）；极端态 `--omnimux-sidebar-width: 1px`，frame 计算网格 `1.84375px 0px 1706.16px`，右侧面板左边界 `x=2`。

成功标准（可测）：

- 展开态下 `--omnimux-sidebar-width` 与 frame 首列宽度不随观察频次收缩；右侧工作台左边界稳定停在侧栏右缘。
- 用户主动拖拽改变侧栏宽度时仍跟随（shell 首轨同步变小后不得被锁死）。
- 折叠态仍写 0；恢复展开后回到真实宽度。
- 不再产生 `ResizeObserver loop` 告警。

## 2. 命令 (Commands)

```
pnpm --filter omnimux test          # 插件单元/契约测试（含 sidebar-toggle-topbar.test.js）
pnpm verify:stages                  # 静态 Stage 契约
pnpm verify:slots                   # Slot 契约
node scripts/scan-ui-gates.mjs      # UI 硬门禁
```

## 3. 项目结构 (Project Structure)

- 实现：`plugins/omnimux/src/client/sidebar-toggle-topbar.js`（hub chrome，唯一改动源）
- 消费 CSS：`plugins/omnimux/src/client/conversation-box.js`（不改，仅作为自引用证据）
- 测试：`plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`

## 4. 代码风格 (Code Style)

沿用文件既有风格：JSDoc 标注导出、纯函数优先、无新依赖。示例：

```js
export function readShellRailWidthPx(doc) {
  const frame = doc?.querySelector?.('.dshDesktopFrame, [class*="frame"]')
  const inlineFirst = (frame?.style?.gridTemplateColumns || '').trim().split(/\s+/)[0] || ''
  const fromInline = /^(\d+(?:\.\d+)?)px$/.exec(inlineFirst)
  if (fromInline) return Math.round(Number(fromInline[1]))
  return null
}
```

## 5. 测试策略 (Testing Strategy)

`node:test` + `jsdom`（既有 `pnpm --filter omnimux test` 执行）。新增用例必须**先复现真实失败模式**再验证修复：

- 伪造「被覆盖逼到 1px」的 `offsetWidth`，断言展开态写回值不得低于 shell 官方首轨；
- 断言正常读数（含用户拖窄后的值）原样透传，不被错误抬高；
- 断言无 shell 首轨时的兜底（上次良好值 / 280）不塌到 0；
- 断言折叠态写 0；
- 断言 ResizeObserver 通知走 rAF 延迟路径（不再在交付周期内同步改布局）。

## 6. 边界 (Boundaries)

- 总是：改动限于 `plugins/omnimux/src/client/sidebar-toggle-topbar.js` 与其测试；改动前跑本模块测试，改动后跑 `pnpm --filter omnimux test`、`verify:stages`、`verify:slots`、`test:ui`。
- 先问：需要改官方 harness、改 Dev/Prod 数据、或动 `@crosery/dsh-viewer`（另一工作区）时。
- 绝不：为绕过回归而删除/放宽既有断言；在主 checkout 直接改 tracked 文件；把未合并代码物化进 Dev。
