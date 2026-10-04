# 会话栏单按钮互斥切换与回车排队规范 (Issue #3085)

## 1. 目标与背景 (Objective)
用户在浏览器扩展（OmniMux-精灵助手）会话栏使用时，发现在助手正在思考/回复期间，底部右侧同时显示了【发送】与【停止】两个按钮，引发严重认知困惑（误认为存在两个发送按钮，或误认为需要点击才能“继续发送”）。
本规范定义会话栏按钮的状态互斥行为与回车直接排队规范：
- 空闲等待状态：仅显示单个发送按钮（向上箭头）。
- 思考/输出状态（working）：隐藏发送按钮，仅显示单个停止生成按钮（小方块）。
- 生成中追问体验：用户在生成过程中输入文本并敲击回车（Enter）时，直接触发发送并进入队列排队，输入框即时清空，无需点击任何界面按钮。

## 2. 关键用户旅程 (User Journey)
1. **初次提问**：输入框打字 -> 显示激活态发送按钮 -> 点击按钮或按 Enter 发送 -> 助手进入思考状态（working=true）。
2. **状态自动切换**：进入 working 状态后，发送按钮自动消失，右侧展示唯一的停止按钮（SquareIcon）。
3. **思考中追问与排队**：在 working 状态下，用户继续键入追问内容 -> 直接按下键盘 Enter -> 消息通过 session.prompt(mode: 'queue') 正常排入队列 -> 输入框草稿即时清空。
4. **生成结束复位**：助手回复完成（working=false）-> 停止按钮消失，发送按钮重新恢复显示。

## 3. 验收标准与契约断言 (Acceptance Criteria)
1. **单按钮互斥渲染**：在 `App.tsx` 中，`working` 为 true 时只渲染 `.stop-button`，绝对不同时渲染非 stop 的 `.clean-send-btn`；`working` 为 false 时渲染 `.clean-send-btn`（带 ArrowUpIcon）。
2. **回车排队支持**：输入框在非 busy 状态下按 Enter，直接调用 `send()`，且调用时附带 `mode: 'queue'`，输入框即时清空。
3. **中文输入法组词保护**：`onKeyDown` 维持 `!e.nativeEvent.isComposing` 判定，输入拼音选词敲击 Enter 时不触发发送。

## 4. 影响范围 (Affected Files)
- `plugins/omnimux-browser/extension/src/panel/App.tsx`
- `plugins/omnimux-browser/extension/tests/composer-send-toggle.spec.ts`
