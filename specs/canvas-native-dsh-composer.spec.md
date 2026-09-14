# 全屏画布模式展示原生 DSH 输入框规格（Show Native DSH Composer in Full Canvas Mode Spec）

## 1. 业务诉求与现状分析
用户在全屏画布模式（折叠会话栏、工作台铺满）下实机测试，提出核心指正：
**「预期的在画布全屏状态下 要显示原生的 dsh 输入框 当前没显示呢」**

### 1.1 现状缺陷根因
1. 在之前实现中，进入全屏画布（`data-omnimux-conversation-collapsed` 状态）时，为了隐藏中间会话气泡流，样式简单粗暴地将整个会话列：
   ```css
   html[data-omnimux-conversation-collapsed] [class*="centerCol"],
   html[data-omnimux-conversation-collapsed] .dshDesktopConversationSurface {
     flex:0 0 0!important;
     width:0!important;
     overflow:hidden!important;
     opacity:0!important;
     pointer-events:none!important;
   }
   html[data-omnimux-conversation-collapsed] [data-slot="conversation"] {
     visibility:hidden!important;
     pointer-events:none!important;
   }
   ```
   导致位于会话内部的**原生 DSH 输入框**（`[data-composer-seat]` / `[data-composer-card]`）连同整个会话流被完全隐藏、置零并禁止交互。
2. 误用了非原生的自定义悬浮输入框，既未与原生真实会话联通，又在单图模式下因为样式条件未渲染，导致全屏画布底部一片空白。

## 2. 解决方案与架构重构

### 2.1 会话折叠逻辑精确分流
不再对整个会话列进行 `opacity: 0` 和 `visibility: hidden` 的一刀切隐藏：
1. **隐藏聊天气泡记录流与会话顶栏**：
   ```css
   html[data-omnimux-conversation-collapsed] [data-conversation-scroll],
   html[data-omnimux-conversation-collapsed] [data-slot="conversation.header"],
   html[data-omnimux-conversation-collapsed] header[class*="header"] {
     display: none !important;
   }
   ```
2. **中间栅格宽度折叠为 0 但允许内容溢出**：
   ```css
   html[data-omnimux-conversation-collapsed] [class*="centerCol"],
   html[data-omnimux-conversation-collapsed] .dshDesktopConversationSurface {
     flex: 0 0 0 !important;
     width: 0 !important;
     min-width: 0 !important;
     max-width: 0 !important;
     overflow: visible !important;
     opacity: 1 !important;
     pointer-events: none !important;
   }
   html[data-omnimux-conversation-collapsed] [data-slot="conversation"] {
     visibility: visible !important;
     pointer-events: none !important;
   }
   ```
3. **原生 DSH 输入框（[data-composer-seat] / [data-composer-card]）悬浮定位在全屏底端**：
   ```css
   html[data-omnimux-conversation-collapsed] [data-composer-seat] {
     position: fixed !important;
     bottom: 24px !important;
     left: var(--omnimux-sidebar-width, 280px) !important;
     right: 0 !important;
     width: auto !important;
     display: flex !important;
     justify-content: center !important;
     align-items: center !important;
     z-index: 100 !important;
     pointer-events: auto !important;
     visibility: visible !important;
     opacity: 1 !important;
   }
   html[data-omnimux-conversation-collapsed][data-omnimux-left-collapsed] [data-composer-seat] {
     left: 0 !important;
   }
   html[data-omnimux-conversation-collapsed] [data-composer-card] {
     width: 640px !important;
     max-width: min(640px, calc(100vw - var(--omnimux-sidebar-width, 280px) - 64px)) !important;
     margin: 0 auto !important;
     box-shadow: 0 20px 48px var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.4)) !important;
     border-radius: 18px !important;
     pointer-events: auto !important;
     visibility: visible !important;
     opacity: 1 !important;
   }
   ```

### 2.2 清理多余的非原生浮动输入框
在 `MediaViewerTab.jsx` 中移除冗余的手写模拟 `FloatingBottomComposer` 挂载，直接复用悬浮就位的真实原生 DSH 输入框，杜绝双输入框与模拟逻辑。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（全屏画布下原生输入框常驻显示）**：在画布全屏状态（`data-omnimux-conversation-collapsed` 激活）下，原生的 DSH 输入框（`[data-composer-card]`）正确定位在画布区域下方的水平中央。
- **AC-2（历史消息流正确隐藏）**：中间栏的消息流（`[data-conversation-scroll]`）被隐藏，不遮挡大图，大图依然在视口正中呈现。
- **AC-3（原生输入框具备真实输入与发送交互）**：由于直接复用原生输入框，回车发送、语音、模型切换、文件拖入均保持官方原汁原味功能与样式。
- **AC-4（左栏收放自适应居中）**：左侧导航栏收起或展开时，原生输入框自适应在右侧画布区域居中。
