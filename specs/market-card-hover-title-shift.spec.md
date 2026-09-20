# 规格 · 技能卡片悬停时标题平滑上移动态避让与间距保障 (Issue #2441)

## 1. 业务背景与用户目标
在技能市场与首页技能推荐的卡片上，用户反馈并提供真实操作截图：
鼠标悬停卡片后，卡片底部滑出描述与快捷操作按钮，但中央标题保持原居中位置不动。当标题较长换行时（如两行标题），标题第二行直接压在下方浮现的描述文案上，造成严重的视觉重叠碰撞。同时外层卡片容器挂载了浏览器原生 `title` 属性，导致悬停时弹出黑色悬浮框遮挡卡片中央文字。

本期目标：
1. **标题平滑上移**：卡片悬停（`:hover`）时，标题容器（`.omnimux-creatify-card-center`）平滑向上滑动位移（`translateY(-28px)`），为底部浮现的描述文本与按钮腾出足够的垂直空间；
2. **留白呼吸间距保障**：确保即便在标题为两行长文本的最极端情况下，标题底部与描述文本顶部依然保持 8~14px 的舒适呼吸留白，100% 杜绝重叠；
3. **丝滑动态过渡**：引入统一的贝塞尔缓动曲线（`transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1)`），与底部抽屉的滑出节奏完全同频、顺滑自然；
4. **移除外层干扰 Tooltip**：清理卡片根容器上的原生 `title` 属性，仅在需要省略号提示的截断文本上保留，彻底消除黑框遮挡问题；
5. **两端协同对齐**：确保 `omnimux-market` 与 `omnimux`（首页 session-guide）两处的样式与行为完全一致。

## 2. 影响范围与改动文件
- `specs/market-card-hover-title-shift.spec.md`：本规格说明；
- `plugins/omnimux-market/src/client/css.js`：技能市场卡片样式；
- `plugins/omnimux/src/client/session-guide/styles.js`：首页引导卡片样式；
- `plugins/omnimux-market/src/client/plaza/FeaturedCard.jsx`：卡片组件根节点属性优化；
- `docs/evidence/market-card-hover-title-shift-verified.*`：实测验证截图与报告。

## 3. 验收标准
- **AC-1 悬停上移**：鼠标 hover 卡片时，`.omnimux-creatify-card-center` 向上平滑位移约 26~28px；
- **AC-2 杜绝重叠**：长标题换行为两行时，标题底边与下方描述顶边纵向间距 ≥ 8px，文字 100% 不发生交叉碰撞；
- **AC-3 动画流畅**：鼠标移入与移出过程具有平滑缓动动画，无跳跃、无抖动、无残影；
- **AC-4 无原生黑框遮挡**：整卡悬停不再弹出遮挡正文的全局 Tooltip。
