# 爆款趋势卡片交互升级与文案/背景优化规格 (Issue #2795)

## 一、需求背景与目标
在新会话首页的“爆款趋势”板块卡片（`TrendingVideoCard`）中，复用灵感社区卡片的现代交互方式：
1. 默认状态：保持 9:16 竖版大卡片、真实封面、地区标签、底部渐变遮罩 + 互动率/播放量双指标 + 标题。
2. 鼠标激活态（Hover/Focus）：
   - 居中展示半透明圆形播放按钮（黑色实心三角图标）；
   - 右上角展示平台 Badge（如 `TikTok` 等）；
   - 底部浮现操作栏（Overlay）：
     - 左侧次要按钮：“详情”（眼睛图标 + 文字“详情”）；
     - 右侧主要按钮：“复刻”（复刻图标 + 文字“复刻”）；
     - 底部单行截断标题（单行省略，白色字）。
3. 按钮几何与布局：
   - 紧凑尺寸：高度严格限定 28px，内边距 `0 6px`；
   - 几何形态：全胶囊圆角 9999px，双按钮对称均分（`flex: 1 1 0; min-width: 0`）；
   - 文案 2 字对称：`详情` 与 `复刻`（英文：`Details` 与 `Replicate`），`white-space: nowrap` 严格杜绝小卡片换行。
4. 背景与对比度规范：
   - 100% 遵循 official `--dsw-alias-*` 语义 Token，严禁任何写死 Hex/RGBA 或私有颜色；
   - 主按钮（复刻）：`--dsw-alias-label-primary` 纯色高亮底，`--dsw-alias-bg-base` 反色文字；
   - 次按钮（详情）：`--dsw-alias-bg-elevated`（回退 `var(--dsw-alias-bg-layer-2)`）层级底色，`--dsw-alias-label-primary` 文字，`1px solid var(--dsw-alias-border-l3)` 边框；
   - 键盘焦点环（Focus Ring）：`:focus-visible` 增加局部 `!important` 抵抗 Host 全局 1px outline 覆盖，呈现 2px 独立焦点环。
5. 动作与输入框联动闭环：
   - 点击“详情”或中心播放按钮：唤起 `preview-service` 顶层灵感分镜弹窗；
   - 点击“复刻”：调用 `onRecreate(item)` 将内容预填入当前会话输入框并挂载附件与技能药丸，**绝对零自动发送、零意外生成**；
   - 再次点击同一卡片复刻：取消激活（Toggle 卸载）。

## 二、UI 元素与文案字典白名单

| 组件位置 | 元素类型 | 逐字文案 (zh-CN) | 逐字文案 (en-US) | 视觉 Token / 样式规范 |
| :--- | :--- | :--- | :--- | :--- |
| 卡片中心 | 圆形按钮 | 播放详情 (aria-label) | Play Details | 纯白底色 #ffffff, 黑色图标 #000000 |
| 卡片右上 | 徽章 Badge | TikTok (动态) | TikTok | bg-layer-2, label-primary |
| 浮层左侧 | 次按钮 | 详情 | Details | bg-elevated (fallback bg-layer-2), 28px 胶囊 |
| 浮层右侧 | 主按钮 | 复刻 | Replicate | label-primary / bg-base, 28px 胶囊 |
| 浮层底部 | 标题文本 | (动态标题，单行截断) | (Dynamic) | white-space: nowrap; text-overflow: ellipsis |

## 三、测试与验收用例 (Seams)
1. **单元测试回归**：
   - `trending-sticky-styles.test.js`：断言 28px 高度、9999px 圆角、对称 flex、语义 Token、无裸色、focus 优先级。
   - `trending-detail-modal.test.js`：断言卡片悬停元素存在、点击复刻调用回调、点击详情唤起弹窗且 ESC 能关闭。
   - 全量回归：`plugins/omnimux/src/client/session-guide/trending/*.test.js` 134 项测试 100% 通过。
2. **代码审查（OCR）**：
   - 使用 open-code-review CLI 执行真实本机代码审查，0 Critical / 0 High / 0 Medium。
3. **真实环境 Dev 实机验收**：
   - 在已运行的 OmniMux Dev (45120) 中，真实点击新会话爆款趋势卡片，验证详情弹窗与输入框预填。
