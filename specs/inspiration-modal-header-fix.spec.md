# 需求规格：修复会话栏折叠样式误伤灵感弹窗顶栏与分享按钮（Issue #2014）

## 一、目标与背景 (Objective & Context)

### 1.1 背景与现场现象
用户在灵感社区点击卡片打开预览弹窗时，弹窗顶部的「标题栏」整行消失，位于顶栏右侧的「分享」按钮随之彻底不可见。
通过真实 Chromium 浏览器（CDP）实地排查，定位到根本原因：
- 在 `plugins/omnimux/src/client/conversation-collapse.js` 中，当会话栏收起（`html[data-omnimux-conversation-collapsed]` 属性激活）时，注入了一条规则：
  ```css
  html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) header[class*="header"]{
    display:none!important;
  }
  ```
- 该选择器使用了未限定容器范围的通用 `header[class*="header"]` 并带有 `!important`；
- 灵感社区弹窗的顶栏结构为 `<header className="omnimux-inspiration-modal-header">`，类名命中了 `*="header"`；
- 导致当用户收起会话栏或全屏使用灵感社区时，弹窗顶栏被误判为会话栏头部并强行设置为 `display: none !important`。

### 1.2 目标
1. 将 `conversation-collapse.js` 里的会话折叠隐藏规则严格限定在会话栏容器内（`[data-slot="conversation"] header[class*="header"]`），杜绝误伤外层弹窗。
2. 在灵感社区样式 `plugins/omnimux-inspiration/src/client/styles.js` 中，为 `.omnimux-inspiration-modal-header` 增加显式的作用域与层级保障，杜绝任何外部未预期规则误伤。
3. 确保在会话栏折叠与展开两种状态下，灵感预览弹窗的顶栏均正常渲染，标题、复制按钮、分享按钮均具备正向几何尺寸（`width > 0, height > 0`）与正常点击行为。

---

## 二、关键用户旅程 (Critical User Journeys)

- **旅程一：全屏/会话栏收起态下打开灵感弹窗**
  1. 用户收起中间会话栏，进入全屏灵感社区。
  2. 点击任意灵感卡片打开全屏预览弹窗。
  3. 预期：弹窗顶部完整显示标题栏，包含灵感主标题、复制按钮与「分享」按钮。
  4. 点击「分享」按钮，正常呼出分享弹层并可创建链接。

- **旅程二：会话栏展开态下打开灵感弹窗**
  1. 用户展开中间会话栏，访问灵感社区。
  2. 点击灵感卡片打开预览弹窗。
  3. 预期：弹窗顶栏及分享按钮依然 100% 正常显示。

---

## 三、验收标准 (Acceptance Criteria)

- [ ] **AC-1**：在 `html[data-omnimux-conversation-collapsed]` 激活态下，`.omnimux-inspiration-modal-header` 的计算样式 `display === 'flex'`，且几何高度 `height >= 50px`。
- [ ] **AC-2**：`.omnimux-inspiration-share-trigger-btn` 处于可见状态（`visibility: visible`, `opacity: 1`），且具有正向几何尺寸（`width > 0, height > 0`）。
- [ ] **AC-3**：点击 `.omnimux-inspiration-share-trigger-btn` 能成功拉起 `.omnimux-inspiration-share-popover` 分享浮层。
- [ ] **AC-4**：会话栏内部的聊天顶栏在收起态依然按原有规则正常隐藏，会话栏收起业务逻辑不受负面影响。
- [ ] **AC-5**：在真实 Chromium（ego-browser）中执行自动化验证并留存证据截图。
