# 实机验证证据：默认新建会话顶部溢出修复与 56px 呼吸留白

- 日期：2026-09-15
- 任务：修复默认新建会话顶部猫咪图标与标语超出页面上边界的问题，增加 56px 呼吸留白与流式排布。
- 关联规格：`specs/fix-default-session-top-overflow.spec.md`

## 验证结果记录
1. **排布机制收敛**：
   - 全屏长内容模式下，取消 `[data-omnimux-starter-host] [data-composer-seat]` 与 `[class*="composerStack"]` 的强制垂直居中（`justify-content: center!important`）；
   - 收敛为 `justify-content: flex-start!important`，彻底根除弹性容器在超高长内容（1500px+）时向上产生负向溢出截断的问题。
2. **56px 顶部通透安全留白**：
   - 设定 `padding-top: 56px!important; padding-bottom: 32px!important;`，与 macOS 桌面端左上角红黄绿交通灯按钮（约 36px）错落分明；
   - 顶部猫咪 Logo 完整显露无切头，副标题标语清晰居中，页面向下顺畅滚动。
3. **分屏紧凑态平滑兼容**：
   - 分屏状态下 `html[data-omnimux-split-compact]` 保持既有 `justify-content: flex-end!important;` 规则，输入框紧凑吸底不退化。
4. **自动化与回归验证**：
   - `plugins/omnimux/tests/e2e/session-top-overflow.spec.js`：5/5 断言全部通过。
   - `plugins/omnimux/src/client/session-guide/component.test.js`：8/8 全部通过。
   - `plugins/omnimux/src/client/split-compact-layout.test.js`：20/20 全部通过。
