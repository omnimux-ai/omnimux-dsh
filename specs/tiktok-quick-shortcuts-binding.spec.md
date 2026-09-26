# 输入框下方快捷方式（QuickShortcuts）角色绑定与完整展示规格说明书 (Spec)

- **作者**：前端开发工程师 · 裴像素（Pixel / 像素匠）
- **核准产品经理**：许清楚
- **状态**：APPROVED (实施就绪)
- **基准设计规范**：`design.md` v2.0 (原生 DSH UI 体系)

---

## 1. 目标与背景 (Objective & Background)

### 1.1 业务诉求
输入框正下方的 4 条视频创作快捷方式（`复刻爆款视频`、`拆解爆款视频`、`一键创作带货视频`、`反推视频提示词`）是专属于 **TikTok 运营专家团（TikTok Agent）** 的核心功能入口。
此前存在两处关键体验与逻辑缺陷：
1. **预设映射与识别错位**：`AGENT_PRESET_NAMES` 中误将 `'tiktok-agent'` 映射为 `'omni-agent'`，导致角色预设解析错误；
2. **缺乏角色绑定与防残缺门禁**：在其他角色预设（如代码开发、标准模式等）下错误展示，且在跨插件技能库异步加载未完成阶段展示 1~3 条残缺半吊子状态，影响用户体验与视觉完整性。

### 1.2 改造目标
1. **纠正角色映射**：`agent-preset-enhancer.js` 中将 `'tiktok-agent'` 纠正映射为 `'tiktok-agent'`，并补齐常见中英文别名；在席位头像同步时向 `window.__omnimuxActivePreset` 写入当前预设 ID；
2. **严格角色绑定（Role Gate）**：只有检测到当前预设为 TikTok Agent 时才允许渲染快捷方式；非 TikTok Agent 立即返回 `null`（零 DOM 节点、零占位间距）；
3. **4 条全量完整性门禁（All-or-Nothing Completeness Gate）**：只有 4 条快捷方式全部就绪（`shortcuts.length === 4`，全部命中已内置技能）时才渲染；未就绪时等待退避重试，绝不展示半吊子残缺状态。

---

## 2. 界面与交互规格 (UI & Interaction Spec)

### 2.1 文案与 UI 元素白名单（100% 严格执行，零私自添加）
- 四条快捷方式核心文案（锁定）：
  1. `quickShortcuts.clone`: 复刻爆款视频（film 图标）
  2. `quickShortcuts.breakdown`: 拆解爆款视频（text-search 图标）
  3. `quickShortcuts.selling`: 一键创作带货视频（workflow 图标）
  4. `quickShortcuts.reverse`: 反推视频提示词（sparkles 图标）
- 严禁添加任何 Badge（如 `新品`、`推荐`）、严禁添加任何副标题说明、严禁添加 Emoji 或装饰图标。
- 遵循 `design.md`：无边框单行流排布，图标 14px，箭头 12px，文字 13px，悬停高亮，严格消费官方 `--dsw-alias-*` CSS Token。

### 2.2 状态流转契约
```
[新会话初始化]
      │
      ▼
[检测当前角色是否为 TikTok Agent]
      │
      ├─ 否 ───────────────► 立即返回 null (零 DOM)
      ▼ 是
[检查技能库 shortcuts.length]
      │
      ├─ < 4 ──────────────► 返回 null (静默等待退避重试，严禁展示半吊子残缺状态)
      ▼ === 4
[完整渲染 4 条快捷方式 (复刻 / 拆解 / 带货 / 反推)]
```

---

## 3. 技术实现细节 (Technical Details)

### 3.1 `agent-preset-enhancer.js`
1. **`AGENT_PRESET_NAMES` 修正与补充**：
   - 修正：`'tiktok-agent': 'tiktok-agent'`
   - 补充：
     - `'TikTok运营专家团': 'tiktok-agent'`
     - `'TikTok 运营操盘手': 'tiktok-agent'`
     - `'TikTok Ops Team': 'tiktok-agent'`
2. **`AGENT_PRESET_AVATARS` 映射**：
   - 补充：`'tiktok-agent': Object.freeze({ hue: 172 })`
3. **`syncSeatAvatar` 全局感知同步**：
   - 解析出 seat 的 preset id 时，执行：
     ```javascript
     if (typeof window !== 'undefined') {
       window.__omnimuxActivePreset = resolved.id;
     }
     ```

### 3.2 `ComposerQuickShortcuts.jsx`
1. **`isTikTokAgentPreset(session, props)` 判定逻辑**：
   - 探测来源优先级：
     - `props?.agentPreset`
     - `session?.projectionValues?.agentPreset`
     - `session?.agentPreset`
     - `session?.meta?.agentPreset`
     - `typeof window !== 'undefined' ? window.__omnimuxActivePreset : null`
     - DOM 席位：`document.querySelector('[data-omnimux-preset-seat]')` 的 `data-omnimux-preset-seat` 或 `data-omnimux-preset-id`，以及 `document.querySelector('[class*="seatLabel"]')` 的 `textContent`
   - 白名单集合：
     `['tiktok-agent', 'tiktokagent', 'tiktok-ops-team', 'TikTok运营专家团', 'TikTok 运营操盘手', 'TikTok Ops Team']`（支持原词或小写不区分大小写匹配）
   - 若不命中白名单，返回 `false`。
2. **组件渲染门禁**：
   - `ComposerQuickShortcuts`：
     - 若 `!isTikTokAgentPreset(currentSession, props)`，返回 `null`；
     - 若 `shortcuts.length !== 4`，返回 `null`（只允许展示完整 4 条）。
   - `ComposerQuickShortcutControls`：
     - 若 `!isTikTokAgentPreset(currentSession, props)`，返回 `null`。

---

## 4. 验证与测试策略 (Testing Strategy)

### 4.1 单元测试与 E2E 测试
1. `preset-skill-lookup.test.js`：验证出厂技能库中 4 款技能与 tiktok-agent 的绑定与解析。
2. `composer-quick-shortcuts` 单元测试组：验证会话标识、草稿写入、样式、图标。
3. `composer-quick-shortcuts-icon-style.e2e.test.mjs`：补充验证在 TikTok Agent 下渲染完整 4 条，且在非 TikTok Agent 下返回 `null`、无任何 DOM 节点残留。
4. `composer-shortcut-model-picker.e2e.test.mjs`：验证模型选择器联动在 TikTok Agent 下正常工作。

### 4.2 质量与无障碍验收标准
- **FRONTEND_SELF_CHECK**:
  - UI 零越权文案与零多余装饰（无 Badge、无副标题、无 Emoji）。
  - 色彩 100% 遵循 `design.md`。
  - 所有测试 100% PASS。
