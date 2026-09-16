# 资产中心整页滚动与视频播放图标悬停呈现规格 (Issue #2011)

## 1. 业务背景
在资产中心「公共」与「本地」页签中，用户反馈两处关键体验问题：
1. **页面无法上下滚动**：卡片网格超出一屏后，滚轮与触控板均无法向下滚动，底部内容与“加载更多”按钮完全无法触达；
2. **卡片播放图标过于显眼遮挡画面**：卡片正中常显白色圆形播放图标（PlayIcon），挡在人像/拟人角色/视频封面上，满屏圆圈视觉噪点严重。用户要求“视频默认不显示播放图标，鼠标悬停才显示”。

## 2. 根因剖析（CDP 真机实测归因）
1. **滚动死锁根因**：
   - PR #1989 将 `omnimux-assets-stage` 设置为整页滚动容器（`.omx-stage-scroll`），但其直接内容容器 `.omnimux-assets-body` 仍残留 `flex: 1; min-height: 0; overflow: hidden;`，下级 `.omnimux-assets-main` 与 `.omnimux-assets-cloud` 亦保留 `flex: 1`。
   - 这导致 `.omnimux-assets-body` 被强行截断在父容器所分配的剩余视口高度内（749px），且 `overflow: hidden` 阻止溢出内容撑大外层。
   - 外层 Stage 的 `scrollHeight` 始终锁定等于 `clientHeight`（954px），外层无法自滚；内层又是 `overflow: hidden`，内层无法滚动。整页产生物理死锁。
2. **播放图标常显根因**：
   - `.omnimux-assets-cloud-play` 仅设置了绝对定位居中，未区分媒体卡与纯音频卡，缺乏 `opacity: 0` 默认态与 hover 激活过渡态。

## 3. 改造目标
1. **释放整页自适应滚动**：
   - 解除 `.omnimux-assets-body`、`.omnimux-assets-main`、`.omnimux-assets-cloud` 的固定 `flex: 1` 与 `overflow: hidden` 束缚，让内容高度自然撑高。
   - 使 Stage 容器 `scrollHeight > clientHeight`，触发标准的 `.omx-stage-scroll` 整页滚动。
   - 滚动过程中页头与动作栏自然滚出，吸附栏（`.omx-stage-sticky`）精准停靠在顶部，契约一致性 100%。
2. **媒体卡播放图标悬停淡入**：
   - 对于带画面的媒体卡（`.omnimux-assets-cloud-card--media`），播放图标默认隐藏（`opacity: 0`，不遮挡画面）；
   - 鼠标悬停（`:hover`）或键盘聚焦（`:focus-within`）或正在播放（`[aria-pressed="true"]`）时平滑淡入（`opacity: 1`）；
   - 纯音频色块卡（`.omnimux-assets-cloud-card--audio`）没有立绘，保持常显作为点击播放的主控件。

## 4. 验收标准（AC）
- **AC-1（整页滚动）**：资产中心卡片网格超出一屏时，Stage 容器 `scrollHeight` 严格大于 `clientHeight`，滚轮可正常向下滚动浏览所有卡片并触达底部加载更多。
- **AC-2（吸附有效）**：在向下滚动时，一级 Tab 与二级分类工具栏（`.omx-stage-sticky`）平滑吸附在顶部不被滚走，内容从其下方穿行。
- **AC-3（播放图标默认隐藏）**：所有带封面的卡片（`.omnimux-assets-cloud-card--media`），播放图标在非 hover 状态下 `opacity` 为 `0`，立绘/封面完整无遮挡。
- **AC-4（悬停与播放显示）**：鼠标悬停在卡片缩略图上或键盘获取焦点时，播放图标 `opacity` 变为 `1` 并伴随平滑过渡；点击播放后播放图标保持常显展示暂停状态。
- **AC-5（纯音频卡不受影响）**：无封面的纯音频卡片（`.omnimux-assets-cloud-card--audio`）播放图标默认保持居中可见。
- **AC-6（质量门禁）**：全量单测与端到端契约测试 100% 通过（基线已知失败除外）。
