# 吸附栏实心背景与层级防穿透 · 实机实测证据

- 任务关联：Issue #1977（穿模细节深度根治）
- 对应规格：`specs/sticky-opacity-and-layering.spec.md`
- 对应分支：`fix/sticky-transparent-leak-issue-1977`
- 关联契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 现象与根因核查

用户反馈截图：在「灵感社区」页面向上滚动时，一级 Tab 栏（全部/本地/云端/账号监控）区域的空隙中出现绿色「本地」胶囊角标与卡片内容浮在栏目上层，发生「穿模」。

经过代码排查与实机测量，确认四大深层根因：
1. **背景色无有效实体兜底**：`.omx-stage-sticky` 声明为 `background: var(--dsw-alias-bg-base, var(--dsw-bg))`，但在宿主环境中这两个 CSS 变量未向某些视图子树继承，由于缺少颜色色值兜底，浏览器将其计算为 `transparent`（全透明）。
2. **层叠上下文与 z-index 倒挂**：`.omx-stage-sticky` 原先声明 `z-index: 3`，而卡片右上角的平台角标（`.omnimux-inspiration-badge-platform`）声明了 `z-index: 4`、多选框声明了 `z-index: 5`。当卡片滚入吸附栏后方时，卡片内元素由于 z-index 倒挂浮到了吸附栏上方。
3. **复合导航栏断层漏光**：灵感社区的一级 Tab 工具栏与二级筛选栏拆分在两个带有 `gap: 12px` 的独立容器中吸附，导致滚动过程中两行之间存在透明缝隙。
4. **滚动容器归属未对齐**：灵感社区原先将 `InspirationStage` 设为 `overflow: hidden`，导致页头标题无法滚走，未能完整执行「整页滚动至顶部吸附」架构。

## 2. 修复实施

1. **统一吸附栏契约兜底与层级提升**：
   - 契约真源（`CANONICAL_STICKY` 及全站 7 个一级页样式表）同步升级为：
     `position: sticky; top: 0; z-index: 20; background: var(--dsw-alias-bg-base, var(--dsw-bg, #111215));`
   - 彻底杜绝变量缺失时回退为 transparent 的缺陷。
   - `z-index: 20` 全面压制卡片内一切角标与悬浮层（4~6），同时低于弹窗（100+）。
2. **卡片网格独立层叠上下文隔离**：
   - `.omnimux-inspiration-grid` 添加 `isolation: isolate; position: relative; z-index: 1;`，确保卡片内部所有定位元素被封闭在网格局部层叠上下文中。
3. **导航栈结构合并**：
   - 将一级 Tab 工具栏与二级筛选栏合并包裹在同一个 `.omx-stage-sticky` 容器中，彻底消除中间透明露底缝隙。
4. **灵感社区整页滚动对齐**：
   - `InspirationStage` 升级为整页滚动容器（`.omx-stage-scroll`），页头随滚动自然移出视口，Tab 栏顺滑贴紧视口顶部。

## 3. 真实 Chrome CDP 测量数据

经由无头 Chrome（CDP 自动化驱动与渲染）实机验证，测量结果（`measurements.json`）：
- `scrollTop`: 220px（页头已滚出视口）
- `stickyTop`: 0px（吸附栏精确贴紧顶部）
- `computedBg`: `rgb(17, 18, 21)`（不透明深黑灰背景，完全遮挡下层）
- `computedZ`: 20
- `isOpaque`: true
- 截图证据已落盘：`docs/evidence/sticky-transparent-leak/inspiration-scrolled.png`
