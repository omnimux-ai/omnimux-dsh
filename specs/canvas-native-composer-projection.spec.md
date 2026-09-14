# 全屏画布下原生输入框精准投射修复规格 (Canvas Native Composer Projection Spec)

## 1. 业务痛点与真实根因剖析
用户在全屏画布下实测反馈并提供整屏截图指正：
**「输入框依然没有出现在侧边栏全屏状态下 难道是 dsh 原生不支持？」**

### 1.1 核心根因锁定（源码级精准定位）
1. **DSH 原生 DOM 树嵌套事实**（查验 `app.asar` 官方结构）：
   ```html
   <main class="dshDesktopConversationSurface">
     <div class="uPhUma_root" data-phase="active">
       <div class="uPhUma_body">
         <div class="uPhUma_scrollBody" data-conversation-scroll="">
           <div data-slot="conversation.session">...消息流气泡...</div>
           <div class="uPhUma_composerSeat" data-composer-seat="">...输入框座席...</div>
         </div>
       </div>
     </div>
   </main>
   ```
2. **致命缺陷点**：
   在 `conversation-collapse.js` 中，样式规则曾定义：
   ```css
   html[data-omnimux-conversation-collapsed] [data-conversation-scroll] {
     display: none !important;
   }
   ```
   由于官方原生的 `composerSeat`（`[data-composer-seat]`）**本身就直接包含在 `[data-conversation-scroll]` 容器内**！
   一旦父容器 `[data-conversation-scroll]` 被 `display: none !important` 强行隐藏，其子元素即使指定了 `position: fixed !important` 也绝对无法渲染展示！
3. **精准收敛方案**：
   - 坚决**不能**对 `[data-conversation-scroll]` 实施 `display: none`；
   - 而是应该隐藏其内部的消息气泡列表容器：`[data-slot="conversation.session"]` 以及顶栏 `[data-slot="conversation.session.header"]`；
   - 让 `[data-conversation-scroll]` 保持 `overflow: visible !important; visibility: visible !important;`；
   - 让 `[data-composer-seat]` 正常生效其 `position: fixed !important; bottom: 24px !important;` 规则，完美居中投射浮现在画布正下方中央！

## 2. 改造范围与样式矩阵
1. `conversation-collapse.js`：
   - 保留 `[data-conversation-scroll]` 的挂载与可见性，仅设置 `overflow: visible !important; pointer-events: none !important;`。
   - 隐藏消息流容器：`[data-slot="conversation.session"], [data-slot="conversation.session.header"], [data-slot="conversation.header"], header[class*="header"], [class*="widthHandle"] { display: none !important; }`。
   - 保证 `.dshDesktopConversationSurface` 及其所有父层级保持 `overflow: visible !important;`，允许内部 fixed 输入框正常脱离文档流浮现。
   - 输入框座席 `[data-composer-seat]` 设置 `position: fixed !important; bottom: 24px !important; pointer-events: auto !important; z-index: 100 !important;`。
   - 输入框卡片 `[data-composer-card]` 保持 `width: 640px !important; pointer-events: auto !important;`。

## 3. 验收标准 (Acceptance Criteria)
- **AC-1 (父容器不隐藏)**：`html[data-omnimux-conversation-collapsed] [data-conversation-scroll]` 不再是 `display: none`，而是保持可见与 overflow: visible。
- **AC-2 (仅隐藏消息流)**：`[data-slot="conversation.session"]` 设为 `display: none !important`，聊天记录气泡不渲染。
- **AC-3 (输入框完美悬浮展示)**：在全屏画布下，原汁原味的官方原生 DSH 输入框正常浮现于画布正下方中央，可打字、回车发送与选模型。
