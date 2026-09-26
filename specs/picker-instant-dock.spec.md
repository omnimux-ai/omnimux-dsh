# 《顶部输入框点击添加素材原子置顶与立即吸底状态机规格（Spec）》

- **状态**：**已批准签发（Approved for Engineering Implementation）**
- **负责人**：交付总监 齐活林、产品经理 许清楚、架构师 高见远、前端开发 裴像素、QA 严过关
- **生效工作树**：`omnimux-dsh-wt-picker-instant-dock`
- **生效分支**：`agent/omnimux-picker-instant-dock`
- **归档路径**：`specs/picker-instant-dock.spec.md`

---

## 一、问题根因与竞态分析（Root Cause & Race Condition）

1. **时序与异步滚动竞态**：
   - 旧逻辑在点击加号菜单后，调用 `scrollIntoView({ behavior: 'smooth' })`；
   - 由于 smooth 滚动存在数百毫秒的异步位移动画，初始帧 `scrollTop` 仍处于 0 附近；
   - 同步执行的 `evaluate()` 读取到 `scrollTop <= revealThreshold`，导致输入框无法切换为 `docked`，甚至被反向打回 `inline`。
2. **`dock()` 内部的 `isTopVisible` 强盗式拦截**：
   - 旧代码硬性规定“顶部输入框可见时点击任意业务事件直接在顶部原位触发，绝不迁移到底部”，直接阻断了跳转至底部输入框的正常诉求。
3. **滚动动画的不确定性**：
   - smooth 滚动无法保证 0ms 立即就位，不符合“立即跳到 tab 栏置顶状态”的预期。

---

## 二、架构设计与消灭竞态策略（Zero-Race Architecture）

1. **原子瞬时跳转（Instant Atomic Jump）**：
   - 计算 Tab 栏（`.omnimux-explore-filter-bar`）相对于滚动容器的精确 `targetScrollTop`；
   - 直接原子设置 `scroller.scrollTop = targetScrollTop`，实现 0ms 瞬间对齐置顶（图 1 效果）。
2. **强制立即吸底（Force Immediate Docked State）**：
   - 彻底废除 `isTopVisible` 对跳转吸底的拦截；
   - 显式调用 `dockToBottom(item)`，在同一帧内：
     * `setPlacement('docked')`；
     * 宿主原子写入 `data-omnimux-dock-open` 与吸底几何 CSS 变量；
     * 标记 `isIntentDrivenRef.current = true` 与 `isCollapsedRef.current = false`。
3. **跳转保护锁（Jump Lock）**：
   - 跳转发生时开启 `isJumpingRef.current = true`，在此保护窗口内，滚动监听器 `evaluate()` 绝对不覆写 `placement`；
   - 窗口释放后，`scrollTop` 已处于 `targetScrollTop`（深水区），状态机平稳交由接力滚动机制管辖。

---

## 三、测试用例与验证指标

1. **用例 1（原子同步置顶）**：调用置顶后，`scroller.scrollTop` 瞬时等于 Tab 栏 offsetTop，无平滑滑动等待；
2. **用例 2（立即吸底就位）**：顶部输入框点击添加后，`placement` 在同一轮微任务立即变为 `'docked'`，宿主拥有 `data-omnimux-dock-open`；
3. **用例 3（抗竞态性）**：模拟在跳转瞬间触发高频原生 `scroll` 事件，输入框稳固停留在 `'docked'`，绝对不被错误回弹为 `'inline'`；
4. **用例 4（Tab 自动切换）**：点击从灵感库选择切换至灵感库，点击从资产库选择切换至资产库。
