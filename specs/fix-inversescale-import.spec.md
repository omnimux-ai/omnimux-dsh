# 修复 GroupNode 缺少 inverseScaleForZoom 引入导致的画布崩溃缺陷规格 (Spec)

## 一、问题根因与背景
在创作画布中，当画布存在打组（工作流）节点时，打开画布出现局部渲染崩溃（ErrorBoundary），报错：
`inverseScaleForZoom is not defined`。

根因排查：
在 `plugins/omnimux-workflow/src/canvas/editor/components/GroupNode/GroupNode.tsx` 中调用了 `inverseScaleForZoom(zoom)`，但文件顶部的 `import { childIdsOfGroup, resolveGroupAccentStyle } from '../../utils/nodeVisualMath'` 遗漏了对 `inverseScaleForZoom` 的导入，导致运行时抛出 `ReferenceError`。

---

## 二、修复方案
1. 在 `GroupNode.tsx` 的 import 列表中显式补齐 `inverseScaleForZoom`；
2. 增加模块级引用与符号完整性检查测试，确保所有内部引用的工具函数都有显式导入并能成功执行。

---

## 三、验收标准
1. `GroupNode.tsx` 完整导入 `inverseScaleForZoom`；
2. 构建编译正常，无任何未定义符号；
3. 开发版 Dev 应用中不再出现 `inverseScaleForZoom is not defined` 报错，画布恢复正常渲染。
