# #3565 账号监控时间线左对齐 + 取消悬停背景：证据

- 任务：Issue #3565（worktree `timeline-left`，分支 `agent/timeline-left-issue-3565`）
- 反馈：截图显示帖子时间线 `margin: 0 auto` 居中、悬停条目背景变化；要求列表靠左、去掉 hover 背景交互。

## 改动

`plugins/omnimux-inspiration/src/client/rival-styles.js`：

- `.omnimux-rival-timeline { margin: 0 auto }` → `margin: 0`（左对齐；`width: min(100%, 620px)` 不变）。
- `.omnimux-rival-timeline-item:hover` 不再修改背景；保留 `:focus-visible` 背景（键盘可见性）。
- 保留条目点击打开、hover 时 actions 显隐等既有交互（本单只取消背景色变化）。

## 验证

```bash
# 样式断言（新增 + 更新既有标准）
node --test src/client/rival-timeline-style.test.js   # 3/3 pass
node --max-old-space-size=1024 --test-timeout=120000 \
  --import ./scripts/deny-network.mjs \
  --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js
# tests 1847 / pass 1847 / fail 0

# 真实无头 Chrome 端到端测量（新用例挂在既有 e2e 文件里）
node --test src/client/rival-filter-polish.e2e.test.js   # 6/6 pass（含 #3565 新用例）

# 客户端构建
node scripts/build-client.mjs   # wrote lib/client.js

# 浏览器证据（工作树隔离 Stage，port:0，自清理）
node scripts/worktree-web-qa.mjs inspiration   # PASS；截图 worktree-qa.png

# Stage/反模式门禁
node scripts/verify-stage-contracts.mjs   # PASS: 14 Stage components
node --test scripts/verify-anti-slop.test.mjs  # pass
```

## 证据边界

- `worktree-qa.png` 来自工作树隔离 Stage 渲染（新 CSS bundle 已加载），不是 Dev 45120 真机验收；Dev 视觉确认属人工/后续观察。
- `rival-filter-polish.e2e.test.js` 的新用例在真实无头 Chrome 里测量：时间线 margin-left=0、左缘与内容列一致、宽度 620、对照元素仍居中、idle 背景非 hover 层；hover 删除与 focus-visible 保留用规则级断言。
- hover 背景由 CSS 规则断言覆盖，真实浏览器 hover 效果可在 Dev 物化后用 egg/浏览器复核。
