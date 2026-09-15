# 验证证据：分栏模式彻底解除 starter-host 边距侵入，100% 回归 DSH 原生紧凑几何

- 状态：已验证
- 时间：2026-09-15T11:42:10.322Z
- 结果：
  1. 分栏模式下 [data-omnimux-starter-host] 对 [data-composer-seat] 的 padding-bottom: 32px 置零，消除底部 72px 悬空死区
  2. 解除 composerStack、composerHero、composer-card 的 1200px 与 780px 双层限制并消除 margin-inline: auto
  3. 分栏下输入框左右严格采用官方原生的 16px clearance，底边严格采用 8px clearance，完全复刻官方底座（图 2）的视觉间距
  4. 全屏模式下不受任何影响，保持官方原有自适应居中与最大宽度
