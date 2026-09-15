# 资产库分类胶囊方案 B 样式对齐预演证据

## 1. 验证目标
验证资产库分类胶囊（本地及云端）选中的胶囊按钮，从旧版刺眼的纯白实心底色反相黑字（`background: var(--dsw-alias-label-primary)`）彻底对齐为方案 B：半透明暗灰色底色（`rgba(255, 255, 255, 0.16)`）+ 纯白高对比文字（`#ffffff`）+ 700 粗体（`font-weight: 700`）。

## 2. 计算样式与规范对比
- 属性 `background`: `var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.16))`
- 属性 `border-color`: `var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.28))`
- 属性 `color`: `var(--dsw-alias-label-primary, #ffffff)`
- 属性 `font-weight`: `700`
- 视觉呈现：与技能市场分类胶囊保持完全一致的低调高级感，暗黑模式下一体化沉浸。
