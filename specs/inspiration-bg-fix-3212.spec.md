# 任务规格：灵感社区舞台主体背景颜色异常与色块断层修复（Issue #3212）

## 1. 目标（Objective）
- **问题定义**：
  在灵感社区舞台（`InspirationStage`）暗黑模式下，顶部 `PageHeader` 背景为宿主原生中性黑 `--dsw-alias-bg-base`（`#151517`），但其子容器 `.omnimux-inspiration-root` 与 `.omx-stage-sticky` 显式声明了 `background: var(--dsw-alias-bg-primary, var(--dsw-bg, #111215))`。由于 `--dsw-alias-bg-primary` 变量在宿主中不存在，硬编码 fallback `#111215` 生效，渲染为偏蓝暗色（RGB `(17, 19, 23)`）。
  当内容较少（如账号监控空状态、爆款趋势首屏）时，`.omnimux-inspiration-root` 仅撑开部分高度（~924px），下方视口区域露出了外层舞台底色 `#151517`，导致页面出现严重的三明治色块断层（顶栏 `#151517` → 主体 `#111215` → 底栏 `#151517`），违反 `design.md` §1.1、§3.1 与 §3.6「全站 100% 消费官方 Token、中性纯黑、严禁偏蓝暗石板色与色块断层」的铁律。
- **业务价值**：
  统一灵感社区全屏中性暗黑质感，彻底消除视觉色块断层，让页面各层级自然继承舞台根背景底色，对齐工作台全站视觉标准。

## 2. 核心用户操作旅程与界面反馈
1. 用户从侧边栏点击进入「灵感社区」：
   - 顶部 PageHeader、ActionRow 按钮区、Tabs 导航吸顶栏、空状态及内容展示网格背景颜色完全纯净统一为 `--dsw-alias-bg-base`。
2. 用户在「账号监控」标签页下遇到冷却或空状态（内容高度不足一屏）：
   - 整屏到底部无任何色块分界线或水平色差横线，留白空间与侧边栏、主视口完全融合。
3. 用户在「爆款趋势」与「灵感库」之间切换：
   - 工具栏吸顶背景与页面画布底色保持 100% 一致的中性暗黑，不出现偏蓝或偏亮色带。

## 3. 技术方案与变更范围
- **受影响文件**：
  `plugins/omnimux-inspiration/src/client/styles.js`
- **具体修改**：
  1. `.omnimux-inspiration-root`：移除 `background: var(--dsw-alias-bg-primary, var(--dsw-bg, #111215));`，改为透明（或继承父容器背景 `transparent`），或者统一为 `var(--dsw-alias-bg-base)`。
  2. `.omx-stage-sticky`：将硬编码 fallback `#111215` 统一对齐为官方 `--dsw-alias-bg-base`（fallback 保底 `#151517` 或透明/原生变量，杜绝偏蓝石板色）。
  3. `.omnimux-inspiration-stage`：确保 `background: var(--dsw-alias-bg-base);` 并支持全高撑满，消除任何孤立底色断层。

## 4. 验收标准与成功判定（Success Criteria）
1. **静态样式契约**：`.omnimux-inspiration-root` 样式声明不再包含偏蓝暗色 `#111215` 或未定义的 `--dsw-alias-bg-primary` 独立色块。
2. **像素级无断层**：在工作树真实浏览器环境中，灵感社区顶部 PageHeader、主体内容区及底部留白区域的背景像素计算样式完全一致（等于 `--dsw-alias-bg-base`）。
3. **全量测试保持绿灯**：`plugins/omnimux-inspiration` 既有 1185+ 项单元测试与端到端测试 100% 通过。
4. **真机取证与人眼复核**：获取真实浏览器截图，确认构图无破败、留白无色块断层。

## 5. 边界与约束（Boundaries）
- **总是做**：遵循 Git/PR 规范与工作树隔离；修改后运行单元测试与本地最小命令；真机截图复检。
- **绝不做**：禁止修改官方 DSH 源码；禁止引入新的私造 CSS 变量；禁止在主检出直接改动代码。
