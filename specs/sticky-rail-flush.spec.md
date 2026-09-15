# 一级页吸附栏贴顶（消除穿模）规格

- 任务单：Issue #1977（跟进）
- 分支：`fix/omnimux-sticky-flush-issue-1977`
- 关联契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 目标

一级页滚动到 Tab 栏吸附时，吸附栏必须**贴住内容区顶部**，与上方的窗口 Tab 条无缝相接；吸附栏之上不得露出下层内容（用户反馈的「穿模」）。

## 2. 问题与根因

技能/专家页实测：吸附栏上方出现一条露出卡片缩略图的横带。

根因：该页的滚动容器 `.sh-plaza-body` 自带 `padding: 18px 20px 32px`。滚动容器带 `padding-top` 时，`position: sticky; top: 0` 的吸附位置落在内边距之下，于是内边距那一条始终露出滚动中的内容。

## 3. 修复

把内边距从**滚动容器**移到**内容层**，滚动容器零内边距：

```css
.sh-plaza-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }        /* 零内边距 */
.sh-plaza-body .sh-mkt { max-width: none; width: 100%; padding: 18px 20px 32px; }        /* 内边距下移 */
```

同时满足两个效果：吸附栏横向铺满、纵向贴顶（无缝衔接）；内容视觉留白保持不变。

## 4. 验收标准

| ID | 场景 | 期望 |
|---|---|---|
| AC-1 | 技能/专家页滚动到吸附位置 | 吸附栏顶边与内容区顶边重合（位移 0px），其上无任何内容可见 |
| AC-2 | 同页顶部未滚动时 | 标题与动作行的留白与修复前一致 |
| AC-3 | 其余一级页 | 滚动容器均无 `padding-top`（本轮逐个核对） |
| AC-4 | 门禁与单测 | 契约门禁 7/7；market 客户端单测全绿 |

## 5. 边界

- **总是**：只改内边距归属，不改吸附语义与契约类声明。
- **绝不**：给吸附栏加 `position: fixed`；改动其他页面的视觉留白。
