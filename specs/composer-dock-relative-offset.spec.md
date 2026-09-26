# 规格：输入框吸底阈值的缺失防御与相对坐标

## 目标（Objective）

空白会话向下滚动时，输入框在离开原位后吸到底部。阈值来自 `getComposerScrollThresholds`。

现状有两个会算错的入口：

1. 页面上还没有 `[data-composer-card]` 时，函数把整个宿主根节点当成测量带。根节点很高，阈值变成几千像素，输入框该吸底时不吸底。
2. 测量带的 `offsetParent` 不是滚动容器时，`offsetTop` 不是相对滚动容器的距离。阈值偏小或偏大，吸底和归位时机错位。

用户是打开空白会话、上下滚动页面的人。成功是：没有输入框卡片时使用现有基线（露头 10px、离开 20px）；卡片存在且滚动容器不是其定位父级时，距离按视口矩形和 `scrollTop` 计算。主线已有的 30px 迟滞、每帧重新测量、滚动状态机保持不变。

来源是 `agent/omnimux-composer-dock-reveal` 的 `ba44bd79a`。该提交还有「滚动时冻结测量」的改法，与当前主线相反，不移植。

## 技术栈（Tech Stack）

既有 OmniMux 客户端：React、`useComposerDocking.js`、`node:test` + JSDOM。不新增依赖。

## 命令（Commands）

在本任务工作树 `.worktrees/composer-dock-relative-offset` 执行：

```
node --test plugins/omnimux/src/client/session-guide/composer-docking.test.js
```

## 项目结构（Project Structure）

- 规格：`specs/composer-dock-relative-offset.spec.md`
- 阈值：`plugins/omnimux/src/client/session-guide/useComposerDocking.js`
- 验收：`plugins/omnimux/src/client/session-guide/composer-docking.test.js`

## 代码风格（Code Style）

沿用该文件的早返回和现有常量。卡片缺失时直接返回基线，不把 `root` 当作测量带：

```js
if (!card) {
  return { revealThreshold: READ_TOP_MAX, leaveThreshold: DOCK_LEAVE_MAX, measuredHeight: 0, offsetTop: 0 }
}
```

相对距离只在滚动容器不是定位父级时替换 `offsetTop`：

```js
const relativeOffset = bandRect.top - scrollerRect.top + (Number(scroller.scrollTop) || 0)
```

离开阈值继续是 `revealThreshold + 30`。窗口尺寸变化重新走现有的每帧测量，不缓存上一帧矩形。

## 测试策略（Testing Strategy）

在现有 `composer-docking.test.js` 增加两条纯函数断言：

1. 没有 `[data-composer-card]` 时，四个字段分别是 `READ_TOP_MAX`、`DOCK_LEAVE_MAX`、`0`、`0`。
2. 定位父级被显式设成滚动容器以外的节点，滚动容器顶 50、测量带顶 220、`scrollTop` 30、卡片高 120 时，`offsetTop` 为 200，`revealThreshold` 为 320，`leaveThreshold` 为 350。

不删除、不放宽已有吸底测试。

## 边界（Boundaries）

- 总是：只改阈值计算和对应测试；保留主线 30px 迟滞与滚动热路径重新测量。
- 先问：改吸底状态机、缓存矩形、改其它会话引导文件。
- 绝不：移植 `ba44bd79a` 里冻结 `thresholdsRef` 的热路径；改 #2673 / #2652 正在使用的工作树；直推 `main`。

## 成功标准（Success Criteria）

- 上述测试命令通过，已有用例无新增失败。
- `git diff origin/main` 只含本规格、`useComposerDocking.js`、`composer-docking.test.js`。
- 卡片缺失分支不再读取宿主根节点高度。
- 相对坐标分支仅在 `band.offsetParent` 存在且不是滚动容器时启用。JSDOM 中 `offsetParent` 为空时仍使用 `offsetTop`。

## 开放问题（Open Questions）

无。旧提交中的热路径缓存已明确排除。
