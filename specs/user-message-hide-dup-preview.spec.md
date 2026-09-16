# Spec: 用户消息带素材时去掉消息内重复大预览

## 1. Objective
用户发送带素材的消息后，同一份素材不得显示两次。

**用户旅程**
1. 用户在输入框挂载图片/视频/资产（如「科技 Vlogger-粉衣女郎 Yuna」）
2. 发送「/video-deconstruct 复刻这条爆款视频」
3. 会话流出现用户消息

**期望界面反馈**
- 消息卡片上方：紧凑素材轨（44px 缩略图/胶囊）可见
- 消息气泡内：仅用户文本，无大图预览、无侧卡、无 `.omx-chat-media-tail`
- 官方宿主 `data-message-attachments` 大图行不可见（不占位）

**成功标准**
- AC-1：带素材用户消息上方有 `.omx-user-attachments-rail`
- AC-2：同用户行 `[data-message-attachments]` 带 `data-omx-native-attachments-hidden="true"` 且 CSS 隐藏
- AC-3：用户气泡内无 `.omx-chat-media-tail`
- AC-4：助手生图/display_file 尾卡画廊仍可挂载
- AC-5：纯文本用户消息无变化

## 2. Commands
```bash
# 工作树根
cd .worktrees/omnimux-hide-dup-user-media-issue-2122

# 单测
node --test --experimental-strip-types \
  plugins/omnimux/src/client/attachments/userMessageAttachmentsEnhancer.test.ts \
  plugins/omnimux/src/client/attachments/assistantMessageMediaEnhancer.test.ts

# E2E（jsdom 结构）
node --test --experimental-strip-types \
  plugins/omnimux/tests/e2e/user-message-attachments.e2e.test.mjs
```

## 3. Project Structure
- `plugins/omnimux/src/client/attachments/userMessageAttachmentsEnhancer.ts` — 上方素材轨 + 隐藏官方大图行
- `plugins/omnimux/src/client/attachments/assistantMessageMediaEnhancer.ts` — 跳过用户行，不向用户气泡挂尾卡
- `plugins/omnimux/src/client/attachments/*.test.ts` — 单测
- `plugins/omnimux/tests/e2e/user-message-attachments.e2e.test.mjs` — E2E
- `tmp/user-message-hide-dup-preview-demo.html` — 演示页
- `docs/evidence/user-message-hide-dup-preview-*` — 预演证据

## 4. Code Style
- 与既有 enhancer 一致：DOM 扫描 + MutationObserver，幂等 data-* 标记
- 不改官方 DSH 包；仅插件侧隐藏/过滤
- 选择器容忍 CSS module hash：`div[class*="userRow"]`

示例：
```ts
export function hideNativeMessageAttachments(scope: Element | null): number {
  const row = scope?.closest?.('div[class*="userRow"], div[class*="userStack"]') || scope;
  // mark [data-message-attachments] with data-omx-native-attachments-hidden
}
```

## 5. Testing Strategy
- 单测：rail 挂载、官方行隐藏、用户节点不提取媒体、无助手气泡时 enhanceTurnMedia 返回 false
- E2E：模拟宿主 attachmentRow + OmniMux 记录，断言隐藏与无尾卡
- 演示页：修复前后对照

## 6. Boundaries
**总是做**
- 先规格后代码；提交前跑相关单测
- 仅改 omnimux 客户端附件增强器

**先问**
- 改官方 ui-chat / ui-attachment 源码
- 去掉用户上方素材轨本身

**绝不做**
- 影响助手媒体尾卡正常路径
- 提交密钥；改 vendor

## Assumptions
1. 官方附件行使用 `data-message-attachments`（MessageItem.attachmentRow）
2. 重复大预览主要来自：官方大图行 + 助手增强器误扫用户附件并挂尾卡
3. OmniMux 上方 44px rail 是产品约定的唯一用户素材展示

## Open questions
无（用户已明确：只保留卡片上方素材，移除消息内部预览）。
