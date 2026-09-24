# 规格：输入框滚动切换顶部动态露头感知与防抖时机重构 (Composer Dock Reveal Threshold)

## 1. 目标与背景 (Objective & Context)
- **目标**：优化 OmniMux 首页会话引导层（`SessionGuide` / `useComposerDocking`）中输入框在吸底状态下往上滚动页面时切换回顶部的时机。
- **痛点**：既有逻辑硬编码了 `READ_TOP_MAX = 10` 与 `DOCK_LEAVE_MAX = 20`，导致用户向下浏览触发吸底后，必须将滚动条完全滑回最顶端（`scrollTop <= 10px`）输入框才会归还顶部；如果槽位已经露头，输入框仍然吸底，造成视觉割裂与归位延迟。
- **期望**：当顶部输入框占位槽在视口顶端**开始露头（开始出现）**时（即 `scrollTop <= revealThreshold`），输入框立即切换回顶部（`inline`），不再等整个输入框完全显示或滚到最顶端（`<= 10px`）。

## 2. 交互状态机与几何计算规格 (Interaction & Geometry Spec)

### 2.1 动态测量辅助函数 `getComposerScrollThresholds(root, scroller)`
- **测量槽位高度**：
  - 读取 `card = root.querySelector('[data-composer-card]')`
  - 读取 `band = card.parentElement || root`
  - 测量高度 `measuredHeight` 取 `band` 或 `card` 的 `getBoundingClientRect().height` 与 `parseFloat(band.style.minHeight || '0')` 的最大值，缺省安全 fallback 为 `160px`。
- **测量槽位偏移量**：
  - `offsetTop = Number(band?.offsetTop ?? 0)`
- **计算临界阈值**：
  - `revealThreshold = Math.max(0, offsetTop + measuredHeight)`：顶部输入框槽位底边缘刚触及视口顶边缘的临界点。
  - `leaveThreshold = revealThreshold + 20`：顶部输入框完全滚出视口顶部并留出 20px 缓冲防抖安全区。

### 2.2 滚动监听与状态流转
- **初始化**：
  - `let leftTop = readPageScrollTop(scroller) > leaveThreshold`
- **滚动评估 `evaluate()`**：
  - `scrollTop = readPageScrollTop(scroller)`
  - 动态计算 `{ revealThreshold, leaveThreshold } = getComposerScrollThresholds(root, scroller)`
  - 若 `scrollTop > leaveThreshold`，置 `leftTop = true`（确保曾真正滑离过顶部）
  - 状态判定：
    - 若 `pinnedRef.current` 为 true：保持 `'docked'`
    - 若 `scrollTop <= revealThreshold && leftTop`：立即返回 `'inline'`（一旦开始进入视口立即切回顶部！）
    - 若 `scrollTop > leaveThreshold`：返回 `'docked'`（完全离开视口后吸底）
    - 迟滞区间 `(revealThreshold, leaveThreshold]`：保持 `prev`，杜绝边缘横跳抖动

### 2.3 向后兼容性
- `READ_TOP_MAX` (10) 与 `DOCK_LEAVE_MAX` (20) 作为导出常量保留，但内部计算采用动态感知值。

## 3. 验收标准与测试用例 (Acceptance Criteria & Test Cases)
1. **测试文件**：`plugins/omnimux/tests/e2e/restore-dock-composer.e2e.test.mjs`
2. **草稿断言修复**：选用技能由旧的 `/ugc-confessional` 指令更新为自然语言说明请求（包含「最佳使用方式」/「explain the best way to use this skill」）。
3. **露头切换断言**：
   - 向下滚动（例如 `scrollTop = 300` 超过 `leaveThreshold`），输入框稳固吸底（`hasAttribute('data-omnimux-dock-open') === true`）；
   - 向上滚动至露头阈值内（例如 `scrollTop = 100` 或 `revealThreshold` 内），输入框就已经成功解除吸底（`hasAttribute('data-omnimux-dock-open') === false`），证明无需等到 0px 或 10px 即可流畅切换！
   - 向上滑回 0px 同样保持解除吸底。
4. **测试执行**：测试用例 100% 通过（exit code 0），无报错与未捕获异常。
