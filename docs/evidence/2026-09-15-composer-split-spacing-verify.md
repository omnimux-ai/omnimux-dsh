# 验证证据：非全屏模式下会话输入框 25px 留白几何实测

- 状态：已验证
- 时间：2026-09-15T09:59:08.781Z
- 结果：
  1. [data-composer-seat] 在 html[data-omnimux-split-compact] 模式下内边距为 padding: 0 25px 25px 25px
  2. [data-composer-card] 宽度 100% 紧贴座席内容区，消除多余 margin
  3. 左右两侧与底部边缘至外框边界刚好 25px，空间利用率最大化
