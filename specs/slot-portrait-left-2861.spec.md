# 规格说明：素材卡槽组件采用默认竖版比例并水平置于输入框左侧

**Issue**: #2861  
**状态**: 草案 / 待验证  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与视觉交互重构

### 目标
根据用户明确指示：
1. **比例**：素材卡槽组件采用经典竖版比例（48px 宽 × 64px 高，约 3:4 比例），边框为细腻虚线，纯视觉居中 ImagePlus 图标；
2. **位置**：素材卡槽水平放置于提示词输入文本框的**左侧**，而非上方。卡槽与右侧的提示词文本域并列同行，构成一体化现代工业美学输入容器；
3. **叠卡兼容**：多张卡片叠加（>=3 张）时，在左侧区域收纳为叠卡与悬停展开扇形，保持动画自然流畅。

---

## 2. 布局与几何契约

### A. 水平并列排布 (`.omx-mv-prompt-row`)
- `.omx-mv-prompt-row`:
  - `display: flex; flex-direction: row; align-items: flex-start; gap: 12px; width: 100%;`
  - `@media (max-width: 480px) { flex-direction: column; }`
- `.omx-mv-prompt-row .omx-slot-row`:
  - `display: flex; align-items: flex-start; flex-shrink: 0; min-height: 64px; padding-bottom: 0;`
- `.omx-mv-prompt-row .omx-mv-prompt-box`:
  - `flex: 1 1 auto; min-width: 0; width: auto;`
- `.omx-mv-prompt-textarea`:
  - `min-height: 64px;`

### B. 竖版比例几何 (`MediaSlotGroup.jsx` & `styles.js`)
- `CARD_WIDTH`: 48px
- `CARD_HEIGHT`: 64px
- `STEP`: 56px
- `PILE_WIDTH`: 60px
- `GAP`: 12px
- `.omx-slot-card`, `.omx-slot-add`:
  - `width: 48px; height: 64px; border-radius: 8px; box-sizing: border-box;`
- 叠卡堆叠偏移动画：
  - `.omx-slot-group.is-piled:not(.is-open) .omx-slot-add`: `transform: translateX(74px);`
  - `.omx-slot-count`: `left: 36px; bottom: 0px; min-width: 20px; height: 20px; font-size: 11px;`

---

## 3. 验收标准
1. 媒体查看器输入框内，卡槽位于输入框左侧，提示词文本域位于右侧，高度对齐（64px 视觉基线）。
2. 卡槽空态与素材卡片呈现标准的 48×64px 竖版比例。
3. 单元测试与端到端自动化测试全部通过。
4. CDP 真机实测截图核验无误。
