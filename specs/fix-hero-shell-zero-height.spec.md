# 规格说明：修复右栏折叠状态识别并彻底清除居中外壳零高度负向上移缺陷

## 1. 业务背景与问题根因
- **问题现象**：在默认新建会话中，页面顶部猫咪 Logo 与标语被顶出页面上边缘、猫耳朵被物理切断；在右侧面板收起（全屏纯会话）时，左上角角标未隐退且与居中标题同时出现。
- **深层成因**：
  1. **选择器挂载层级错误导致折叠状态失效**：
     在 `plugins/omnimux/src/client/composer-compact.js` 中，选择器将 `:not([data-rightbar-collapsed="true"])` 挂载在了子节点 `[data-sidebar-right-panel]` 上，而该折叠属性实际上只存在于外框容器 `.dshDesktopFrame` 上。这导致即使右侧栏已收起，系统依然错误命中分屏分支。
  2. **高度压零导致负空间上浮切头**：
     分屏分支试图隐藏居中标题外壳时，错误采用了 `height: 0px !important; min-height: 0px !important;`。由于内部子元素未设隐藏且外层为垂直居中的弹性布局，子元素在 0 像素高度的父容器中居中产生了 `-23px` 的负向上移，使得猫咪图标和标语硬生生越过窗口顶边被截断。
  3. **全屏状态缺少健康自然高度与顶部留白**：
     全屏开屏状态下，居中外壳需要显式维持 `height: auto` 与 36 像素自然沉降留白。

## 2. 解决方案设计
1. **修正外框折叠选择器层级**：
   - 将 `.dshDesktopFrame:has(...:not([data-rightbar-collapsed="true"]))` 收敛为 `.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"]))`；
   - 确保当右侧栏收起（`data-rightbar-collapsed="true"`）时，分屏模式规则 100% 被阻断，左上角迎宾层自动隐退。
2. **分屏隐藏外壳采用语义级 display: none**：
   - 将分屏模式下的外壳压零规则全面改为 `display: none !important;`，根除 0 高度负空间上移。
3. **全屏长内容开屏外壳赋予舒适留白**：
   - 在 `session-guide/styles.js` 中，为 `[data-omnimux-starter-host] [class*="composerHero"] > :first-child` 赋予 `margin-top: 36px !important; margin-bottom: 8px !important; height: auto !important; min-height: auto !important;`。

## 3. 验收标准
1. **自动化测试**：
   - 端到端测试验证在右侧栏收起时，`.omnimux-welcome-header` 不呈现；
   - 端到端测试验证全屏开屏状态下，居中标题外壳具备 `height: auto` 且无 `height: 0` 压缩；
   - 所有端到端测试 100% 绿灯。
2. **实机验收**：
   - CDP 实机量测居中标题顶部坐标为正常正数（`top >= 36px`），猫咪图标完整舒展无切耳，全屏与分屏切换丝滑自如。
