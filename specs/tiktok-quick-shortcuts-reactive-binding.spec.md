# 规格说明书 (Spec)：TikTok Agent 快捷指令实时响应式角色绑定

- **Issue**: #2722
- **作者**: 前端开发工程师 · 裴像素（Pixel）
- **核准产品经理**: 许清楚
- **状态**: APPROVED (实施就绪)
- **基准规范**: 现代 SaaS 科技极简准则 / `design.md` v2.0

---

## 1. 背景与用户痛点
用户在输入框下方使用视频创作快捷指令（`复刻爆款视频`、`拆解爆款视频`、`一键创作带货视频`、`反推视频提示词`）。
此功能被严格绑定在 **TikTok 运营专家团**（TikTok Agent）角色预设下。
然而，此前在新建会话页面中，用户在下拉菜单中切换预设角色时，由于组件内部未建立响应式预设变动订阅，导致界面不会触发重新渲染（re-render）：
- 用户从“全域社媒操盘手”切换到“TikTok运营专家团”时，快捷指令栏依然处于初次加载时的隐藏状态；
- 用户误以为快捷指令已被改成全局可见或角色绑定失效；
- 实际上必须在切换角色时建立全局/DOM 响应式订阅（`useSyncExternalStore`），实现角色切换与快捷指令实时无缝联动显隐。

---

## 2. 行为契约与响应式架构设计

### 2.1 响应式事件与订阅模型
1. **全局预设事件派发**：
   - 在 `agent-preset-enhancer.js` 的 `syncSeatAvatar` 中，当活跃预设变更时，派发标准全局 CustomEvent：
     `omnimux:agent-preset-changed`，附带 `{ detail: { id: resolved.id } }`。
2. **响应式 Hook (`useIsTikTokAgentPreset`)**：
   - 位于 `isTikTokAgentPreset.js`，采用 React 官方推荐的 `useSyncExternalStore` 机制；
   - 订阅逻辑：
     - 监听 `window` 上的 `omnimux:agent-preset-changed` 事件；
     - 配合 MutationObserver 监听 `document.body` 中 `[data-omnimux-preset-seat]` 和 `[class*="seatLabel"]` 变动；
     - 当任一变更发生时通知 React；
   - 快照逻辑：
     - 调用 `isTikTokAgentPreset(session, props)`，返回精准布尔值；
     - 在非 TikTok 角色（如全域社媒操盘手、Instagram 视觉增长专家、X 流量运营专家、代码开发等）下恒返回 `false`；
     - 在 TikTok 角色（`tiktok-agent`、`TikTok运营专家团` 及其白名单别名）下恒返回 `true`。
3. **消费组件接入**：
   - `ComposerQuickShortcuts` 与 `ComposerQuickShortcutControls` 接入 `useIsTikTokAgentPreset`；
   - `isTikTok === false` 时立即返回 `null`（DOM 数量为 0，零占位）；
   - `isTikTok === true` 且满足 4 条技能全部就绪、处于空会话时，完整呈现 4 条快捷指令。

---

## 3. UI 元素白名单与逐字文案字典（100% 锁定）
- 四条快捷指令核心文案（全量 4 条，残缺不展示）：
  1. `quickShortcuts.clone`: 复刻爆款视频（film 图标）
  2. `quickShortcuts.breakdown`: 拆解爆款视频（text-search 图标）
  3. `quickShortcuts.selling`: 一键创作带货视频（workflow 图标）
  4. `quickShortcuts.reverse`: 反推视频提示词（sparkles 图标）
- 现代 SaaS 科技极简铁律：
  - 零同义重复，零冗余徽章（严禁添加 `NEW`、`HOT`、`推荐`）；
  - 零装饰 Emoji 与火苗图标；
  - 零副标题冗余废话。

---

## 4. 验收标准与测试用例（Acceptance Criteria）
- **AC-1**：单测覆盖 `useIsTikTokAgentPreset` / `isTikTokAgentPreset` 与 `AGENT_PRESET_CHANGED_EVENT` 派发契约；
- **AC-2**：在真实 Dev 运行环境中，默认状态（全域社媒操盘手）下 `[data-omnimux-quick-shortcuts]` 数量为 0；
- **AC-3**：在真实 Dev 运行环境中，切换为“TikTok运营专家团”时，无需刷新，快捷指令栏实时出现且完整包含 4 条指令；
- **AC-4**：在真实 Dev 运行环境中，再次切换为“Instagram视觉增长专家”或“全域社媒操盘手”时，快捷指令栏实时消失（数量为 0）。
