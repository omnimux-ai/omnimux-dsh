# 规格说明：素材卡槽增加 40×56px 按钮边框线与紧凑竖版对齐

**Issue**: #2863  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与用户意图对齐

根据用户需求指令及参考截图（输入框左侧素材卡槽红色箭头指示）：
1. **尺寸规范**：素材卡槽统一调整为 **40px 宽 × 56px 高**（`40*56px`）；
2. **按钮边框线**：为素材卡槽赋予明确清晰的高品质 SaaS 按钮边框线（`1px solid` 微光边框搭配微妙底色与悬浮态高亮），摆脱此前悬浮裸图标或淡虚线感知不清的问题；
3. **视觉对齐与叠卡**：
   - 内部矢量图标（ImagePlus / Video / Audio）适配为 20px，在 40×56 容器内保持几何居中；
   - 叠卡计算步进（`CARD=40`, `STEP=48`, `PILE_WIDTH=50`, `GAP=10`）无缝适配；
   - 右侧多行提示词输入框最小高度同步收敛至 56px，形成水平紧凑基线对齐。

---

## 2. 详细样式与几何契约

### A. 按钮边框线与尺寸定义 (`styles.js`)
- `.omx-slot-card, .omx-slot-add`:
  - `width: 40px;`
  - `height: 56px;`
  - `border-radius: 8px;`
- `.omx-slot-add` 按钮边框线外观：
  - `border: 1px solid var(--dsw-alias-border-l3);`
  - `background: var(--dsw-alias-bg-layer-2);`
  - `color: var(--dsw-alias-label-secondary);`
- `.omx-slot-add:hover` 交互高亮态：
  - `border-color: var(--dsw-alias-border-l4);`
  - `background: var(--dsw-alias-bg-layer-3);`
  - `box-shadow: 0 2px 8px var(--dsw-alias-bg-layer-1);`
- `.omx-slot-add svg`:
  - `width: 20px;`
  - `height: 20px;`
- `.omx-slot-count` 计数角标：
  - `left: 28px;`
  - `bottom: -2px;`

### B. 叠卡与排布参数 (`MediaSlotGroup.jsx`)
- `CARD`: 40
- `STEP`: 48
- `PILE_WIDTH`: 50
- `GAP`: 10
- 堆叠动画位移适配新步长。

---

## 3. 验收与回归标准
1. 媒体查看器中，卡槽呈现清晰的 40×56px 按钮边框线与背景。
2. 鼠标悬停时边框线清晰高亮反馈。
3. 提示词输入框与卡槽按钮左侧并排，高度自然基线对齐。
4. 本地自动化门禁测试全部通过。
5. CDP 真机实测截图验证无视觉瑕疵。
