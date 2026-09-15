# 规格说明：分栏模式彻底解除 starter-host 边距侵入，100% 回归 DSH 原生紧凑几何

## 1. 业务背景与问题现象
- **问题现象**：在分栏（右侧打开创作画布等）模式下，新建会话中输入框两侧留白高达 44px（左右各空一大块黑边），底部悬空 72px。而对照官方原生 DSH（图 2 所示）：分栏模式下输入框左右仅保留 16px clearance，底边仅保留 8px clearance，紧凑舒展。
- **根因分析**：
  1. `[data-omnimux-starter-host]` 下对 `[data-composer-seat]` 设置了 `padding-bottom: 32px!important`，叠加底座 `composerHero` 的 `padding-bottom: 32px` 和 `InputBar` 8px，导致底部空出整整 72px；
  2. `[data-omnimux-starter-host]` 对 `composerStack` 和 `data-composer-card` 施加了双层 `max-width`（1200px 与 780px）并强制 `margin-inline: auto`，在狭窄列宽下造成严重内缩，左右各自多出 40px+ 的黑色空隙。
- **解决方案**：
  在分栏紧凑模式（`html[data-omnimux-split-compact]` 或右侧面板打开）下，彻底将 `[data-omnimux-starter-host]` 对输入框座席、总栈、卡片和工作区行的多余边距置零并解除宽度限制，交由官方原生 DSH 算法自主渲染，实现与原生（图 2）完全一致的 16px 侧边距与 8px 底部对齐。

## 2. 详细规则
在 `plugins/omnimux/src/client/session-guide/styles.js` 中补充紧凑分屏态的几何归一规则：
```css
html[data-omnimux-split-compact] [data-omnimux-starter-host] [data-composer-seat],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host] [data-composer-seat],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [data-composer-seat],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [data-composer-seat] {
  justify-content: flex-end !important;
  padding-bottom: 0 !important;
  padding-top: 0 !important;
  padding-inline: 0 !important;
}
html[data-omnimux-split-compact] [data-omnimux-starter-host] [class*="composerStack"],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host] [class*="composerStack"],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="composerStack"],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="composerStack"] {
  justify-content: flex-end !important;
  width: 100% !important;
  max-width: 100% !important;
  margin-inline: 0 !important;
  padding: 0 !important;
}
html[data-omnimux-split-compact] [data-omnimux-starter-host] [class*="composerHero"],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host] [class*="composerHero"],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="composerHero"],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="composerHero"] {
  width: 100% !important;
  max-width: 100% !important;
  padding-bottom: 0 !important;
  margin-inline: 0 !important;
}
html[data-omnimux-split-compact] [data-omnimux-starter-host] [data-composer-card],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host] [data-composer-card],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [data-composer-card],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [data-composer-card],
html[data-omnimux-split-compact] [data-omnimux-starter-host] [class*="heroWorkspaceRow"],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host] [class*="heroWorkspaceRow"],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="heroWorkspaceRow"],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host] [class*="heroWorkspaceRow"] {
  width: 100% !important;
  max-width: 100% !important;
  margin-inline: 0 !important;
}
```

## 3. 验收标准
1. **测试**：覆盖分栏状态下 `[data-composer-seat]` 和 `[class*="composerHero"]` 的 `padding-bottom: 0` 以及满宽零外边距断言。
2. **实测表现**：分栏时输入框贴底（消除底部 72px 悬空），卡片两端贴齐列宽（仅保留原生 16px 呼吸边距），全屏状态保持原生大屏居中算法不变。
