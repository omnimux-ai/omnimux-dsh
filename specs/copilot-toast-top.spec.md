# 推特助手气泡提示消息（Toast）顶部定位调整规格

## 1. 背景与诉求
当前推特助手的悬浮提示条（Toast，如“请先在发帖框写下你的主题或想法，再使用该功能。”、“AI 正在深度思考生成...”）默认显示在网页底部（`bottom: 24px`）。
由于推特发帖框和主要操作区位于页面上方，用户在点击助手后视线集中在上半区，底部提示容易被忽视或显得突兀。
用户明确要求：“把气泡消息放在页面顶部而不是底部。”

## 2. 改动范围
- `plugins/omnimux-browser/extension/src/content/twitter-copilot/styles.css`:
  - 基础定位从 `bottom: 24px` 调整为 `top: 24px`；
  - 默认隐藏状态平移：从 `translateY(20px)`（由下向上弹出）改为 `translateY(-20px)`（由上向下滑出）；
  - 展开状态保持 `transform: translateX(-50%) translateY(0)`；
  - 层级 `z-index: 1000000`、配色（深色中性 `#18181b`，状态字色绿色/红色/白色）及圆角胶囊形态保持不变。

## 3. 验收标准
1. **样式与单测**：
   - 样式文件断言包含 `top: 24px`，不再包含 `bottom: 24px`；
   - 动画效果变更为由顶部下滑入场；
   - `tests/no-purple-theme.spec.ts` 门禁与 `tests/twitter-copilot.spec.ts` 全量绿灯。
2. **实机验证**：
   - 在真实浏览器页面触发空草稿拦截，气泡提示条准确出现在页面顶部中间（距顶 24px），截图留存证据。
