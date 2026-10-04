# 规格：生成中任务卡去除顶部图标与文案，点阵动效铺满卡片

## 目标
生成中任务卡片（GeneratingStateCard → GenWaveCard）：
1. 移除左上角工具图标 + "等待生成工具启动" 文案行；
2. 点阵过渡动画铺满整张卡片（原顶部行与间距全部让出）；
3. 右下角进度胶囊保留。

## 实现
- GenWaveCard 的 statusText 改为可选；未传入时不渲染 head 行，点阵画布占满全部高度。
- GeneratingStateCard 不再传 statusText。
- .field 的 margin-top 仅在有 head 时需要；head 缺省时为 0。
- 卡片 padding 与进度胶囊绘制不变。

## 验收
1. 提交生成任务后：卡片内只有点阵波动画 + 右下角进度百分比，无图标、无文字行，动效延伸到原顶部区域。
2. 其他传 statusText 的调用方视觉不变。

## 测试
- GenWaveCard.test.js：statusText 可选、无 statusText 不渲染 head。
- GeneratingStateCard 源码断言：不再传 statusText。
- 工作树内真机截图（CDP）。
