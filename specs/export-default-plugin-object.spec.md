# 规格：为 omnimux-device 提供 export default 插件对象支持

## 一、 背景与根因
Cordis 插件加载器在执行 `unwrapExports` 时优先提取 `exports.default`。如果模块仅有命名导出，在部分打包/运行环境下 Module 命名空间对象未能通过 `isApplicable` 判定，抛出：
`invalid plugin, expect function or object with an "apply" method, received object`

## 二、 修复方案
在 `plugins/omnimux-device/src/index.js` 导出 `export default { name, inject, apply }`。

## 三、 验收标准
- [ ] 模块包含 `export default` 对象，具备 `apply` 方法；
- [ ] 宿主正常启动，不再报 invalid plugin。
