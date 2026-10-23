# 钻取面板 900×560 下入口卡仍被裁 1px（Issue #3649）

## 背景与现状

#3639 给「添加节点」面板底部加了「新建工作流」入口卡，并修了右键钻取面板的视口溢出（`ContextMenu` 按视图真实高度估计夹取 `top`，并给钻取面板加内联 `maxHeight`；CSS 打通 flex 链使列表内滚动、footer 固定）。

修复后真实浏览器复测（隔离 worktree + 真实 Chromium）：

| 视口（锚点 y=500） | entryBottom | entryInViewport | entryHit | clippedPx |
| --- | --- | --- | --- | --- |
| 900×560 | 561 | false | true | **1** |
| 1280×720 | 707 | true | true | 0 |
| 1728×883（y=150/300/500） | 745 / 870 / 870 | true | true | 0 / 0 / 0 |

成因：`maxHeight = max(200, innerHeight - top - 8)` 只扣了视口边距，未扣面板自身 padding/border（上下各 6+1 = 14px）。卡片仍可点，属 1px 视觉裁切。

## 用户操作旅程

1. 窄窗口（900×560）在画布偏低位置右键 → 钻取「添加节点」。
2. 面板被夹取到视口内、列表内滚动，底部入口卡完整可见（当前差 1px）。
3. 点入口卡 → 打开「创建可复用工作流模板」。

## 期望界面与交互

- 900×560 与 1280×720、1728×883 下入口卡均**零裁切**、可见且可点。
- 不改变面板视觉、定位策略与交互；仅修正夹取时的盒模型扣减。

## 验收标准

1. 900×560：`clippedPx = 0`、`entryInViewport = true`、`entryHit = true`，点击仍打开模态。
2. 1280×720 与 1728×883（三锚点）不回归（裁切仍 0）。
3. Dock 面板布局不回归（三区零重叠、全在视口内）。
4. `pnpm --filter omnimux-workflow test`、`typecheck`、`verify:stages`、`verify-anti-slop` 绿。
5. 真实浏览器复测几何写入证据文件；同时改正已合并 `docs/evidence/issue-3639-ui-journey.md` 中两句过时描述（「修复后 pass」与「窄视口未复测」），使其与实测一致。

## 技术设计

- `ContextMenu.tsx`：新增具名常量描述面板自身盒模型开销（padding 6+6、border 1+1 = 14px），`maxHeight` 减数改为 `视口边距 + 该开销`；注释说明来源，不写裸魔法数字。
- `docs/evidence/issue-3639-ui-journey.md`：按 #3649 的复测结果改写两句（不新增未经测量的断言）。

## 硬性约束

- 不重构面板定位体系、不改视觉、不动其它菜单/弹层；不改调度与 Feed/Slot 语义。
- 证据必须来自真实浏览器；不得用 CSS 推导冒充实测。

## 证据要求

- 三档视口的几何 + 命中数据（含 900×560 归零）。
- 命令输出：package test / typecheck / verify:stages / anti-slop。
- 截图（若有）留存于 worktree 之外的持久位置，并在 PR 中引用。

## 假设

1. 那 1px 只来自面板自身 padding/border（复测已给出成因），不是子元素 margin 折叠或滚动条宽度导致。
2. 修正减数不会让面板在正常视口下变矮（正常视口走的是 `top` 夹取路径，`maxHeight` 不生效）。

## 证伪方式

1. 若 900×560 下 `clippedPx` 仍不为 0，则说明还有其它盒模型开销（如滚动条宽度或 margin），此时改为在 CSS 里对 host 设 `box-sizing: border-box` 并把扣减量改为可测量值，并如实报告新的残留。
2. 若修正后 1280×720 / 1728×883 出现回归（面板变矮、出现不必要滚动），则回退到按视口高度动态扣减实测开销的方案，并在 PR 中说明。

## 新用户基线

不影响新用户路径；仅修正窄窗口下的 1px 裁切。
