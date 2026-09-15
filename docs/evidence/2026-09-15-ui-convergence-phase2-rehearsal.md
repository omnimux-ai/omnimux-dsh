# 全局 UI 组件样式收敛与归一化第二阶段实机预演证据

## 1. 预演目标与范围

依据业务负责人的裁决与 `specs/ui-components-convergence.spec.md` 规格中 AC-7、AC-8、AC-9 的要求：
1. **统一按钮圆角基准（AC-8）**：
   - 收敛技能市场（`omnimux-market`）等业务模块中存量的 6px 等非标按钮圆角至 8px 共享基准；
2. **空状态引导组件统一（AC-7）**：
   - 数据分析（`omnimux-analytics`）空状态外框统一为居中微图标加紧凑标准留白，兼容插画插槽与状态分派；
3. **状态徽标低饱和暗调（AC-9）**：
   - 验证全库状态标签底色暗沉低调，克制高级。

## 2. 实机预演数据与 DOM 断言

- **技能市场按钮圆角**：`.hover-btn`, `.sh-model-tab`, `.mine-dropdown-item` 全部对齐为 `border-radius: 8px`；
- **空状态引导**：`.omnimux-analytics-empty` 具备标准居中对齐与文字层级，按钮采用标准共享组件；
- **全库设计门禁**：UI01~UI10 扫描 0 违规，符合 L1 级极简契约。
