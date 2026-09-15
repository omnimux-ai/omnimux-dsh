# 修复 GroupNode 缺少 inverseScaleForZoom 引入实测验证证据

## 1. 现场排查取证
- 通过 CDP 端口 9229 连接正在运行的 Dev App（`ws://127.0.0.1:9229/devtools/page/...`），抓取到的真实控制台报错为：
  `画布局部渲染遇到问题`
  `inverseScaleForZoom is not defined`
- 审查 `GroupNode.tsx`：第 130 行调用了 `inverseScaleForZoom(zoom)`，但第 6 行 import 未引入 `inverseScaleForZoom`。

## 2. 修复方案
- 在 `GroupNode.tsx` 顶部补上 `inverseScaleForZoom` 的 import；
- 重新编译构建 `omnimux-workflow` 并物化；
- 在 Dev App 中重新刷新画布，验证 ErrorBoundary 错误彻底消除，画布完全正常渲染。
