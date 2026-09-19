# 规格：优化卡片悬停操作按钮背景颜色与毛玻璃质感 (Optimize Card Button Background Spec)

## 一、需求背景与现状分析
- **现状痛点**：根据用户提供的实机界面截图，在首页模板与应用货架（如「王牌短视频应用」卡片「手机与网页交互实机演示」）上，鼠标悬停浮起的操作按钮为高反差的纯白实底胶囊，导致按钮内部的浅色文字与图标（如「打开应用」）与白色背景混为一体，严重失真看不清，且在大面积暗黑背景中如白炽灯般刺眼突兀。
- **根因分析**：
  1. `styles.js` 中 `.omnimux-tpl-card[data-template-type="app"]` 强制指定了 `background: var(--dsw-alias-brand-primary)`；
  2. 按钮 `:hover` 规则被强硬写成了 `background: var(--dsw-static-neutral-00) !important`（纯白 #ffffff），且在深色模式下颜色混淆；
  3. 脱离了项目长期设计规范中“深灰半透明毛玻璃、严禁高饱和亮色与死白实底”的铁律。

## 二、设计与交互方案
1. **统一深灰半透明毛玻璃背景**：
   - 默认浮起态（卡片悬停时）：统一采用克制高级的深灰半透明毛玻璃背景（`background: color-mix(in srgb, var(--dsw-static-neutral-1000) 76%, transparent)` 或 `var(--dsw-alias-bg-mask-2)`），配合 `backdrop-filter: blur(14px)` 与 `box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35)`；
   - 边框：采用 `1px solid var(--dsw-alias-border-l3)` 细腻微边框；
   - 文字与图标：高对比纯白 `color: var(--dsw-static-neutral-00)`，保证在任何封面背景下清晰锐利、一目了然。
2. **优雅温和的鼠标激活反馈 (`:hover`)**：
   - 鼠标真正移到按钮上方时：背景适度微亮温和透光（`background: color-mix(in srgb, var(--dsw-static-neutral-1000) 60%, transparent)`），边框微亮微透，带有 1.02 轻微缩放弹性反馈；
   - 文字与图标恒定保持清晰纯白，坚决杜绝反转为白底白字或高反光实底。
3. **应用与模板卡片风格归一**：
   - 移除 `data-template-type="app"` 的突兀纯色覆盖，使应用（App）、模板（Template）与热门视频（Trending）保持统一的苹果级极简暗调毛玻璃质感。

## 三、验收标准
1. 在所有卡片（含应用卡片与模板卡片）上悬停时，升起的按钮背景均为通透舒适的深灰半透明毛玻璃，绝无纯白实体反光；
2. 按钮内文字（「打开应用」、「复刻」、「使用」）及图标清晰纯白，字迹分明；
3. 鼠标悬停到按钮上时，背景自然微亮微透，文字依然清晰可见；
4. 相关自动化测试 100% 绿灯。
