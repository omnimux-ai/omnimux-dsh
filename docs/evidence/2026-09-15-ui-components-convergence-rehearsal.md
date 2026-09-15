# 全局 UI 组件样式收敛与归一化实机预演与验收证据

## 1. 预演目标与测试范围

本次实机预演对齐 `specs/ui-components-convergence.spec.md` 规格标准，覆盖业务负责人于样式仲裁看板确定的 7 大核心组件与 4 条专属微调指令：
1. **分类筛选胶囊 (Filter Pills)**：验证资产库（`omnimux-assets`）与技能市场（`omnimux-market`）激活态文字加粗（`font-weight: 600`）及全圆角胶囊形态；
2. **下拉选择器 (DropdownSelect)**：验证账号中心（`omnimux-accounts`）与对标灵感（`omnimux-inspiration`）触发器默认实体文案（「平台」、「状态」、「分组」）及首项「全部」契约；
3. **删除确认弹窗 (ConfirmRemoveDialog)**：验证产品库（`omnimux-products`）与资产库（`omnimux-assets`）提示文案携带目标关联资产名称；
4. **统一圆角体系与微观参数**：验证全库核心控件圆角符合 8px 基准、状态徽标低饱和暗色微调。

## 2. 预演测试环境与实测数据

- **测试环境**：Worktree 隔离环境（`agent/omnimux-ui-convergence`）
- **DOM 挂载与渲染校验**：
  - 资产库分类胶囊激活态：实测 `fontWeight: 600`，`borderRadius: 999px`，背景为亮白底反相黑字；
  - 技能市场分类胶囊激活态：实测 `fontWeight: 600`，字阶清爽饱满；
  - 账号中心筛选工具栏：三个下拉选择框在未选态分别呈现「状态」、「分组」，展开项首项为「全部」；
  - 对标灵感平台选择框：首项重置项文案为「全部」，中英文字典对齐无「全部平台」拼接；
  - 产品库与资产库删除弹窗：确认弹窗正文中包含 `（关联资产: ...）` 安全警示字段。

## 3. 门禁与回归结果

- `plugins/omnimux/src/client/ui-convergence-contract.test.js`：3/3 通过
- `plugins/omnimux-inspiration` 测试套件：777/777 通过
- `plugins/omnimux-accounts` 测试套件：66/66 通过
- `plugins/omnimux-assets` 测试套件：475/475 通过
- `plugins/omnimux-products` 测试套件：449/449 通过
- `node scripts/scan-ui-gates.mjs`：UI01~UI10 静态门禁扫描 0 违规，全部合规。
