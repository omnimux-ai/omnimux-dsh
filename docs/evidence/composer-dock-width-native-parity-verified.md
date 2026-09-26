# 新会话吸底输入框宽度对齐顶部默认输入框原生上限（方案 A）实测验证证据

- **任务**：新会话吸底输入框宽度对齐顶部默认输入框原生上限（方案 A）
- **规格**：`specs/composer-dock-width-native-parity.spec.md`
- **执行角色**：前端开发工程师 裴像素（Pixel）
- **验证时间**：2026-09-26
- **状态**：VERIFIED & PASSED

## 一、量化验收点验证

### 1. 宽屏尺寸与原生上限对齐（AC-1 & AC-3）
- 顶部初始状态原生上限：`max-width: var(--dsh-composer-card-max-width, 952px)!important;`
- 吸底状态几何计算：`Math.min(available, Math.max(baseTargetWidth, demandWidth))`，其中 `baseTargetWidth = Math.min(available, nativeMaxWidth)`，`nativeMaxWidth` 默认读取 `952px` 并优先自适应 `--dsh-composer-card-max-width`。
- 在可用宽度为 1200px（> 952px）环境下，吸底输入框宽度严格测量为 `952px`。
- 水平居中定位坐标：`left = leftEdge + (available - width) / 2 = 394 + (1200 - 952) / 2 = 518px`，左右间距严格对称（0px 偏差）。

### 2. 样式红线与白名单（AC-2）
- 彻底剔除 `max-width: none!important;`。
- 替换为 `max-width: var(--dsh-composer-card-max-width, 952px)!important;`。
- 保留 `position: fixed!important; left: var(--omnimux-dock-left, 0px)!important; width: var(--omnimux-dock-width, 100%)!important; margin: 0!important; bottom: var(--omnimux-dock-bottom, 20px)!important; z-index: 45!important;`。

### 3. 分栏紧凑与窄屏自适应（AC-4）
- 在可用宽度为 900px（可用净宽 888px）环境下，吸底输入框宽度自适应收缩至 `888px`，不产生溢出或横向滚动条，左右各留 12px 安全内边距。

### 4. 自动化测试套件
- `plugins/omnimux/src/client/session-guide/composer-docking.test.js` PASS (12/12)
- `plugins/omnimux/src/client/session-guide/docked-slot-position.e2e.test.js` PASS (4/4)
- `plugins/omnimux/src/client/session-guide/trending/trending-interaction.test.js` PASS (16/16)
- `plugins/omnimux/src/client/session-guide/trending/trending.test.js` PASS (17/17)
- `plugins/omnimux/tests/e2e/restore-dock-composer.e2e.test.mjs` PASS (1/1)
- `plugins/omnimux/tests/e2e/composer-scroll-dock.e2e.test.mjs` PASS (1/1)
- `plugins/omnimux/tests/e2e/attach-reveal-no-scroll.e2e.test.mjs` PASS (1/1)

## 二、PM Sign-off 驳回整改项闭环（收起操作项文案白名单对齐）

依据产品经理许清楚在 PM Sign-off 中的驳回意见（去除冗余宾语，纯动词收敛）：
1. **中文键位**：`trending.undock` 严格对齐白名单为 `收起`（去除冗余宾语“输入框”）。
2. **英文键位**：`trending.undock` 严格对齐白名单为 `Collapse`（替换冗余动宾组合“Restore composer”）。
3. **组件层兜底**：`SessionGuide.jsx` 内部兜底文案同步更新为 `收起`。
4. **测试断言与用例**：同步更新 `restore-dock-composer.e2e.test.mjs`、`composer-scroll-dock.e2e.test.mjs`、`attach-reveal-no-scroll.e2e.test.mjs`、`docked-slot-position-qa.mjs` 与 `trending-interaction.test.js`，全部自动化测试用例 100% 绿灯通过。
