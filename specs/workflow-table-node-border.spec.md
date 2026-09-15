# 修复创作画布表格节点卡片顶部双边框与遮挡缺陷规格（Table Node Header Border Spec）

## 1. 业务痛点与用户指正
用户在创作画布中实测表格/分镜节点卡片并明确指出（带红箭头截图）：
**「创作画布节点的卡片的边框上方会有双边框导致边框线被覆盖，找下啥原因」**

### 1.1 现状与根因分析
1. **外层卡片容器与高光选中环**：
   - 外层卡片 `.wf-material-node__card` 定义了 `border-radius: 18px;` 及 `border: 1px solid var(--wb-border);`。
   - 当节点处于选中态（`wf-material-node--selected`）时，卡片获得白色边框 `border-color: var(--wb-node-ring);` 以及内侧高光环 `box-shadow: inset 0 0 0 2px var(--wb-node-ring);`，正常应当形成 3px 连续平滑的外圆角高光轮廓。
2. **内部表头直角底色与层叠覆盖**：
   - `TableNode.tsx` 内部表头容器 `<div style={{ ... background: 'color-mix(in srgb, var(--wb-surface) 60%, transparent)', ... }}>` 是直角矩形，未声明顶部圆角（`borderTopLeftRadius` / `borderTopRightRadius`）。
   - 根据 CSS 盒模型渲染层级，子元素 `background` 的绘制顺序高于父容器的 `box-shadow: inset`。
   - 结果：
     - 表头的直角底色顶破了父容器内圆角高光，在左上角和右上角直接覆盖并截断了高光线。
     - 表头顶部边缘与卡片外框之间形成一条灰色的背景带，肉眼可见外白内灰紧挨的两条线，形成极其刺眼的“双边框”视觉瑕疵。

## 2. 改造方案
1. **表头顶部圆角贴合**：
   - 表头容器显式声明 `borderTopLeftRadius: 17` 及 `borderTopRightRadius: 17`（精准对齐 18px 外圆角减去 1px 边框后的内圆角半径）。
2. **内容容器溢出保护**：
   - 表头的外层纵向容器补充 `borderTopLeftRadius: 17` 和 `borderTopRightRadius: 17`，并设置 `overflow: hidden`，彻底阻断任何内部子元素背景渗入卡片高光边缘。
3. **视觉一致性保障**：
   - 无论在未选中、鼠标悬浮（hover）、选中态，卡片顶部边框始终通透平滑，圆角处无直角遮挡，无多余灰色线条。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（表头圆角收敛）**：`TableNode.tsx` 内部卡片表头容器显式声明顶部左右内切圆角（`borderTopLeftRadius` 与 `borderTopRightRadius`），彻底贴合卡片内弧度。
- **AC-2（消除双边框与遮挡）**：在节点选中高亮状态下，顶部与两端圆角处的高光线条完整连续，无任何子元素直角底色覆盖或内侧灰线造成的双边框现象。
- **AC-3（契约与自动化测试）**：更新 `TableNode.test.mjs`，增加对卡片表头圆角收敛与边框完整性的断言，相关测试 100% 绿灯通过。
