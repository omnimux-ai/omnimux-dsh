# 实测证据：探索模板 6 大 Tab 栏卡片与输入框交互统一收敛及防跳顶 (Issue #2821)

## 一、验证环境
- 目标端：OmniMux Web 开发端 (`http://127.0.0.1:45120/`)
- 测试驱动器：ego-browser (Ego Lite Chromium)
- 关联 Issue：#2821
- 关联规格：`specs/2821-converged-tab-card-docking.spec.md`

## 二、复现与修复前后对比实测

### 1. 修复前缺陷观测
- 当页面向下滚动浏览卡片（`scrollTop = 550px`）时，点击卡片复刻/选用按钮；
- 堆栈追踪：`attachCardToConversation -> composer.revealAttachments() -> focusEditorElement() -> DIV.Q7WfXG_input.focus()`（未带 `preventScroll: true`）；
- 导致视口瞬间被浏览器强制拉回页首（`scrollTop` 被重置为 0），`host` 上的 `data-omnimux-dock-open` 吸底标记为 false，输入框留在顶部相对位置，当前浏览上下文完全丢失。

### 2. 修复后行为验证
1. **防止抽顶**：`focusEditorElement` 强制注入 `{ preventScroll: true }`，移除 `revealAttachments` 的裸 focus 触发，滚动条稳固锁定在当前卡片高度；
2. **坚决吸底**：卡片交互统一调度 `dock(payload, { force: true, onDocked: ... })`，100% 进入吸底状态；
3. **架构收敛**：跨 6 大 Tab 栏（精选/资产库/灵感库/商品库/爆款趋势/Skills）统一分发至单一动作网关，杜绝双重挂载附件，并支持同卡片再次点击优雅反悔。

## 三、离线与端到端自动化测试
- `plugins/omnimux/src/client/session-guide/converged-tab-docking.e2e.test.js`: 3/3 PASS
- `plugins/omnimux/src/client/session-guide/trending/trending-card-actions.e2e.test.js`: PASS
- `plugins/omnimux/src/client/session-guide/trending/trending-interaction.test.js`: PASS
- `plugins/omnimux/src/client/session-guide/templates/explore-templates-ui.test.js`: PASS
- 全量关联测试 54/54 PASS (0 失败)。
