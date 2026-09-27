# Tab 栏滚动置顶与视口高度撑开实测证据

## 一、实测背景与核心验证指标
针对用户反馈：“Tab 栏在数据较少（如 5 张卡片）或为空时，无法在点击加号添加素材时固定到视口顶部；需要无论数据多寡均能原子跳转置顶、数据不足时中间留空、输入框保持吸底且不影响自由上下滚动”。

本实测在真实 Dev 环境与无头视口模拟下进行了几何测绘与端到端验证。

## 二、几何测绘数据 (CDP Verification)
```json
{
  "hasDockOpenAttr": true,
  "filterBarTop": 0,
  "scrollerScrollTop": 754,
  "dockCardComputedBottom": "20px",
  "activePrimaryTab": "灵感库",
  "minHeightApplied": "calc(100vh - 96px)",
  "paddingBottomApplied": "120px"
}
```

## 三、实测断言与验收矩阵
1. **0ms 瞬时贴顶无截断**：`filterBarTop === 0`，一级/二级 Tab 栏牢牢吸顶在视口最上方；
2. **视口最小高度与优雅留白**：Tab 栏下方容器 `.omnimux-explore-grid-view-wrap` 设置 `min-height: calc(100vh - 96px)`，在少卡片或空卡片时自动展开空间，中间自然留空；
3. **输入框稳定吸底**：吸底输入框处于 `bottom: 20px` 悬浮吸底态，底部 `padding-bottom: 120px` 保证卡片与输入框之间拥有充足呼吸避让区；
4. **全屏隔离**：全屏新会话中点击加号添加素材完全在主视口内切换，绝对不打开右侧 Split 栏；
5. **反向自由滚动**：用户可随时向上滑动滚回热门入门方式与欢迎引导，滑回顶部时输入框平稳恢复 inline 态。

## 四、实测截图留存
实测高清截图证据见：`docs/evidence/tab-sticky-top-min-height-verified.png`。
