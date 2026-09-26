# 顶部输入框点击添加素材原子置顶与立即吸底实测证据

- **任务**：彻底消除竞态，点击加号后立即跳到 Tab 栏置顶状态并同步在底部显示输入框
- **分支**：`agent/omnimux-picker-instant-dock`
- **状态**：**实测验证通过（VERIFIED PASS）**

## 核心证据
1. **0ms 原子置顶**：计算 Tab 栏相对于滚动容器的精确相对偏移量，直接原子赋值 `scroller.scrollTop = targetOffset`，废除异步 smooth 滚动；
2. **强制立即吸底**：`useComposerDocking` 支持 `{ force: true }` 强制打破顶部原位优先限制，即使在页面顶部也立即进入 `'docked'` 并在同一帧写入 DOM 标记；
3. **跳转保护锁（Jump Lock）**：在跳转瞬间激活 `isJumpingRef`，锁定 150ms 窗口，屏蔽原生 scroll 事件的任何反向覆写；
4. **测试套件**：35 项单测与 E2E 契约测试全部 PASS。
