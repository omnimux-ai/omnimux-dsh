# 规范：右上角「收起右侧边栏」按钮去重（搬运不复制）

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

**用户报告（附截图）**：界面右上角出现两个「侧边栏」按钮，要求查明哪个是原生、哪个是单独添加的，并给出最佳处理。

**现场取证（运行中的开发版，CDP 直接读元素）**：

| 位置 | 按钮 | 来源 |
| --- | --- | --- |
| 最左 | 「全屏」`data-sidebar-right-mode` | 外壳原生 |
| 中间 | 「分栏」`data-dockkit-split-button` | 官方工作台原生 |
| 最右 | 「收起右侧边栏」`data-sidebar-right-toggle` | **原生 1 份 + 本插件搬出的拷贝 1 份（重叠）** |

`data-original-parent` 是本插件 `syncNativeRightbarControls` 写入的标记（`dataset.originalParent`）。
它把原生按钮搬到 `document.body` 并 `position:fixed` 固定在右上角，以便右侧栏收起后仍有可见入口。

**根因**：界面（React）每次重画都会在原生容器里生成一个**新的**按钮节点，而本插件只对「查到的第一个」节点做搬运/归位，
被搬走的旧拷贝从此无人回收。对照实验（收起→展开一次）后，`body` 上同时残留 `toggle` 与 `expand` 两个旧拷贝，
且展开态下与原生按钮并存 → 同一动作出现两份，且随每次收起/展开越攒越多。

**成功标准（可测）**：

- 任意时刻，同一动作的可见控件只有一份：`document` 中带 `data-original-parent` 的节点数量 ≤ 1。
- 展开态：原生节点在原生容器内时，插件不再保留任何拷贝（拷贝数 = 0）。
- 收起态：仍保留「右上角可见入口」的能力（唯一一份，被固定显示）。
- 反复收起/展开 N 次后，节点数量不增长。
- `pnpm --filter omnimux test` 全绿。

## 2. 命令 (Commands)

```
node --test plugins/omnimux/src/client/sidebar-toggle-topbar.test.js
node --test plugins/omnimux/src/client/*.test.js
```

## 3. 项目结构 (Project Structure)

- 改动：`plugins/omnimux/src/client/sidebar-toggle-topbar.js`（`syncNativeRightbarControls` 与其选择器）、`plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`（回归用例）
- 规格：`specs/rightbar-toggle-dedupe.spec.md`

## 4. 代码风格 (Code Style)

沿用该文件既有的 JSDoc + 中文注释风格；选择器同时兼容 `[data-sidebar-right-toggle]` 与历史 `="true"` 写法。

## 5. 测试策略 (Testing Strategy)

- 复用既有测试的 DOM 夹具风格（jsdom 风格的手写 document），新增用例：
  1. 收起态：只保留一份可见控件（拷贝数 ≤ 1）；
  2. 展开态：原生节点已被重新渲染时，拷贝被删除（拷贝数 = 0）；
  3. 反复收起/展开 3 轮：节点总数不增长。

## 6. 边界 (Boundaries)

- **总是**：只删除本插件自己标记（`data-original-parent`）的节点；不删除原生节点；不改变原生按钮的点击行为。
- **先问**：改变右侧栏收起/展开的交互语义；替换原生按钮本身。
- **绝不**：在收起态删除唯一的可见入口（那会丢失重新打开右侧栏的能力）。
