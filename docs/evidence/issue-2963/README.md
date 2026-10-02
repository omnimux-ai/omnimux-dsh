# Issue #2963 浏览器实测证据（worktree 内）

QA 页面：`.tmp/qa-2963/index.html`（X 推文卡片模拟，注入 `host: x.com`）。

实测记录：
- 指针移入图片：同一事件回调内 `is-visible`（无 150ms 计时器等待）——性能时间戳 `performance.now()` 于指针移动后立即为 true。
- 收起态胶囊：24×24px，`border-radius: 999px`，品牌 SVG 18px，距图左/下边各 14px。
- 展开态工具栏：128×24px，3×24px 图标按钮、14px 图形、gap 4px、radius 999px。
- 与 YouMind 0.3.0.38 拆包几何逐项一致（24 idle / 128 toolbar / 24 图标按钮 / 14px inset）。
