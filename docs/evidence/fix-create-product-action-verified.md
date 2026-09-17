# 修复资产库「添加产品」点击无响应与二级表单唤起链路实测验证证据

**日期：** 2026-09-17 ｜ **工作区：** `plugins/omnimux-assets` + `plugins/omnimux-products`
**对应规格：** `specs/fix-create-product-action.spec.md` ｜ **验证状态：** 全部通过（PASS）

---

## 1. 验证目标与问题复现闭环

### 1.1 缺陷现象与复现
- 用户在资产库（`omnimux-assets:library`）的「产品库」选项卡下，点击顶部 `[+ 添加产品 ⌄]` 展开下拉分流菜单（`实物产品` / `数字产品`）；
- 点击任意子项时，控制台无响应，未弹出任何创建表单，亦未发生任何视图切换；
- **代码真源审查确认**：`AssetsStage.jsx` 内部 `handleOpenCreateProduct` 试图调用 `api.openTab('omnimux-products:library')`，而 `window.__omnimuxWorkbench` 上的方法实为 `open` 与 `openWorkbench`，无 `openTab` 属性，导致调用分支判定失败并静默吞没操作。

### 1.2 修复后验证结果
1. **工作台调度 API 对齐**：
   - `AssetsStage.jsx` 中的调度逻辑成功纠正为 `api.open({ tabId: 'omnimux-products:library' })` 与 `api.openWorkbench` 兼容调用；
   - 静态分析与源码扫描确认已彻底消除所有对未定义 `api.openTab` 的调用。
2. **跨插件意图解耦通信**：
   - 点击「实物产品」时：设置 `window.__omnimuxProductsIntent = { mode: 'create', kind: 'physical' }` 并广播 `omnimux-products:open` 事件；
   - 点击「数字产品」时：设置 `window.__omnimuxProductsIntent = { mode: 'create', kind: 'digital' }` 并广播 `omnimux-products:open` 事件；
   - 点击产品卡片时：设置 `window.__omnimuxProductsIntent = { mode: 'edit', productId }` 并广播 `omnimux-products:open` 事件；
   - `ProductsStage.jsx` 在挂载及运行时均可捕获该意图，无缝直接切入 `ProductFormPage` 对应的实物/数字创建或编辑二级表单页。
3. **单元测试与全量回归**：
   - `omnimux-assets` 测试套件（541 项测试）全部通过；
   - `omnimux-products` 测试套件（464 项测试）全部通过；
   - 合计 1005 项自动化测试 100% 绿灯。
4. **打包产物**：
   - `plugins/omnimux-assets/lib/client.js` 重新构建成功（361,060 字节）；
   - `plugins/omnimux-products/lib/client.js` 重新构建成功（270,518 字节）。
