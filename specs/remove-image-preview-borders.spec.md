# 移除图片预览卡片与画布大图边框线规格（Remove Image Preview Card & Canvas Display Borders Spec）

## 1. 业务痛点与用户指正
用户实测生成图片并明确反馈：
**「预览的图 我看有边框线 不要出现边框线」**

### 1.1 现状分析
1. **气泡内图片预览卡片**（`.omx-chat-media-tail__card`）：
   原先定义了 `border: 1px solid var(--dsw-alias-border-l2);`，鼠标悬停时变成 `border-color: var(--dsw-alias-border-l3);`。在暗黑背景下呈现为生硬的浅灰色描边线，割裂视觉，与苹果和推特的现代极简卡片无边框风格相悖。
2. **画布大图预览视口**（`.omx-mv-display`）：
   外层容器应当保持纯净无边框，杜绝任何外轮廓或细线描边。
3. **时间线预览卡片**（`.omx-mv-timeline__card-multi`）：
   同样存在 `border: 1px solid var(--dsw-alias-border-l2);`，应当一并彻底清除。

## 2. 改造方案
1. **彻底移除预览卡片边框**：
   - `.omx-chat-media-tail__card`：
     - `border: none !important;`
     - 悬停（hover）状态不再修改 `border-color`，仅保留极微弱的微浮动（`transform: translateY(-1.5px)`）与柔和阴影，实现自然高级的现代视觉。
2. **画布大图视口无边框保障**：
   - `.omx-mv-display` 显式声明 `border: none !important; outline: none !important;`。
3. **时间线卡片无边框处理**：
   - `.omx-mv-timeline__card-multi` 移除 `border: 1px solid ...`，改为 `border: none !important;`。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（预览卡片无任何边框线）**：气泡底部媒体预览卡片（`.omx-chat-media-tail__card`）四周无边框线，hover 时亦无边框线。
- **AC-2（画布大图无边框线）**：画布主舞台大图视口四周无任何边框线或轮廓线。
- **AC-3（圆润通透质感）**：仅依靠图片本身与底层微弱柔和阴影区隔，对标苹果与推特现代极简质感。
