# 会话栏单按钮互斥与回车排队实测证据 (#3085)

## 任务背景与验收路径
用户提出：“为什么浏览器插件的会话栏会设计两个按钮？继续发送的意思？不需要继续发送 直接发送就行了 输入 回车立即发送排队，不需要在点按钮发送”

## 实测证据
1. **单按钮互斥验证**：
   - 助手在思考/回复（working=true）时，发送按钮不再渲染，仅渲染单个 `.stop-button`。
   - 助手在空闲等待（working=false）时，仅渲染 `.clean-send-btn`（向上箭头）。
2. **回车排队验证**：
   - 输入框在流式回复期间维持启用，Enter 键直接触发 `send()` 并携带 `mode: 'queue'`，输入框即时清空，无感知排队。
3. **测试与打包证据**：
   - `plugins/omnimux-browser/extension/tests/composer-send-toggle.spec.ts` 3/3 严格通过。
   - `node scripts/build.mjs` 打包出 `dist/panel/assets/index.js`。
   - `pnpm --filter omnimux-browser build:server` 成功。
