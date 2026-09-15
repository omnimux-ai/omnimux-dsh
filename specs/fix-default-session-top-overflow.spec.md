# 规格说明：修复默认新建会话顶部位置超出页面

## 1. 业务背景与问题现象
- **问题现象**：在默认新建会话（无历史对话、未开始聊天的全屏开屏页面）中，页面顶部内容（品牌猫咪 Logo、副标题标语「属于你的AI社媒运营团队」）向上溢出页面上边界（切头、顶出视口外），且紧贴窗口物理上边缘，与左上角系统控制交通灯按钮挤在一起，破坏了桌面端极简优雅的视觉体验。
- **根本成因**：
  1. **弹性布局垂直居中的负空间上推灾难（Flexbox unsafe centering）**：
     在 `plugins/omnimux/src/client/session-guide/styles.js` 中，`[data-omnimux-starter-host] [data-composer-seat]` 和 `[class*="composerStack"]` 设置了 `justify-content: center!important;`。随着新会话中引入了快捷入口分组、4大热门入门方式卡片、创作灵感瀑布流推荐后，整个页面的实际内容高度（约 1300px~2000px）远超常见窗口可视高度（800px~1000px）。弹性容器在内容高度超过容器高度时，执行垂直居中会导致内容向上产生负偏移（`offsetTop < 0`），而滚动容器无法向上负向滚动，使顶部内容永久超出页面上边界被截断。
  2. **缺少顶部系统避让与呼吸安全留白**：
     原样式仅设置了 `padding-block: 32px;`，在 macOS 极简无边框窗口模式下，左上角红黄绿交通灯占据了约 36px 垂直空间。当顶部内容贴近 32px 时，就会和左上角交通灯产生视觉冲突。需要优雅留出 `56px` 的顶部通透呼吸留白，形成清晰的视觉层级。

## 2. 解决方案设计
在 `plugins/omnimux/src/client/session-guide/styles.js` 中：
1. **取消全屏长内容模式下的垂直居中，采用自顶向下的自然流式排布**：
   - `[data-omnimux-starter-host] [data-composer-seat]` 的对齐方式收敛为 `justify-content: flex-start!important;`。
   - `[data-omnimux-starter-host] [class*="composerStack"]` 的对齐方式收敛为 `justify-content: flex-start!important;`。
   - 增加充足的顶部呼吸安全留白：`padding-top: 56px!important; padding-bottom: 32px!important; box-sizing: border-box;`。
2. **重置 Hero 迎宾外壳的伸展属性**：
   - 声明 `[data-omnimux-starter-host] [class*="composerHero"]` 为 `flex: 0 0 auto!important; width: 100%;`，消除多余弹性撑高或挤压，使其严格依附内容自适应。
3. **分屏紧凑模式兼容保护**：
   - 维持既有的 `html[data-omnimux-split-compact]` 以及紧凑状态规则（`justify-content: flex-end!important;`），确保在侧边栏/画布展开时，输入框依然稳健吸底，迎宾区依然锚定左上角独立图层。

## 3. 验收标准
1. **自动化测试**：
   - 验证 `GUIDE_CSS` 中 `[data-omnimux-starter-host] [data-composer-seat]` 的 `justify-content` 为 `flex-start!important`，且具备 `padding-top: 56px!important;`。
   - 验证 `[data-omnimux-starter-host] [class*="composerStack"]` 的 `justify-content` 为 `flex-start!important`。
   - 验证 `[data-omnimux-starter-host] [class*="composerHero"]` 声明了 `flex: 0 0 auto!important;`。
   - 单元测试与端到端回归测试 100% 绿灯。
2. **真实界面效果验收**：
   - 在默认新建会话全屏状态下，猫咪图标完整呈现无切耳，猫咪图标与标题顶部距窗口上边框至少 56px 呼吸留白，绝不顶出视口外，与左上角交通灯高低错落有致。
   - 页面纵向滚动时从顶部平滑向下滚动，顶部内容 100% 完整可见。
