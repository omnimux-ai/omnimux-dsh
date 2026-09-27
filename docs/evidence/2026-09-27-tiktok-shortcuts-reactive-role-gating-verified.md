# TikTok Agent 快捷指令实时响应式角色绑定验证报告

- **日期**：2026-09-27
- **Issue**：#2722
- **验证人**：QA 工程师 · 严过关、前端开发工程师 · 裴像素
- **审核核准**：产品经理 · 许清楚 (PM_SIGN_OFF: PASS)

---

## 1. 验证目标
解决用户反馈的问题：“当前没有跟随角色来显示快捷指令了？我看已经改成全局可见了？无论切换哪个 Agent 都可见？我希望当前这四个快捷指令是绑定在 TikTok Agent 下才可见，切换其他 Agent 不可见”。
核心验证：
1. 建立 `omnimux:agent-preset-changed` 全局事件派发契约；
2. 在 `useIsTikTokAgentPreset` 中采用 `useSyncExternalStore` 响应式监听全局事件与 DOM 席位变动；
3. 用户在同一个界面通过下拉菜单实时切换 Agent 时，输入框下方的 4 条快捷指令能够零延迟联动显隐：
   - 处于 TikTok 运营专家团时：4 条指令完整显示；
   - 处于全域社媒操盘手、Instagram 视觉增长专家、X (推特) 流量运营专家等非 TikTok 角色时：100% 隐藏，DOM 元素数量恒为 0（零 DOM 留存）。

---

## 2. 自动化单元测试与契约测试
执行命令：
`node --test plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.test.js`
`node --test plugins/omnimux/src/client/composer-quick-shortcuts/reactivePreset.test.js`
`node --test plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.e2e.test.js`

测试结果：
- `isTikTokAgentPreset.test.js`: 12/12 passed (100%)
- `reactivePreset.test.js`: 3/3 passed (100%)
- `isTikTokAgentPreset.e2e.test.js`: 1/1 passed (100%)

---

## 3. 真实浏览器（Ego Browser / CDP）端到端实机验证证据链
在真实运行的 OmniMux Dev 环境 (`http://127.0.0.1:45120/`) 中进行连续角色切换测试，实测结果：

| 测试步骤 | 选定 Agent 席位 | `hasContainer` | 快捷指令数量 | 实测快捷指令文案列表 | 验收结论 | 截图证据 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **步骤 1** | 全域社媒操盘手 | `false` | 0 | `[]` | **PASS (完全隐藏)** | `docs/evidence/step1-omni-agent-hidden.png` |
| **步骤 2** | TikTok运营专家团 | `true` | 4 | `["复刻爆款视频", "拆解爆款视频", "一键创作带货视频", "反推视频提示词"]` | **PASS (完整呈现)** | `docs/evidence/step2-tiktok-agent-visible.png` |
| **步骤 3** | Instagram视觉增长专家 | `false` | 0 | `[]` | **PASS (实时隐藏)** | `docs/evidence/step3-instagram-agent-hidden.png` |
| **步骤 4** | X (推特) 流量运营专家 | `false` | 0 | `[]` | **PASS (实时隐藏)** | `docs/evidence/step4-x-agent-hidden.png` |
| **步骤 5** | TikTok运营专家团 | `true` | 4 | `["复刻爆款视频", "拆解爆款视频", "一键创作带货视频", "反推视频提示词"]` | **PASS (实时恢复)** | `docs/evidence/step5-tiktok-agent-restored.png` |

---

## 4. 产品与设计合规审计（PM Sign-off）
- **UI 元素与逐字文案**：4 个按钮完全对齐白名单，零同义重复，零冗余徽章（无任何 NEW、HOT 标签），零装饰火苗 Emoji；
- **设计规范**：严格遵循 `design.md`，样式消费 `--dsw-alias-*` Token；
- **验收结论**：`PM_SIGN_OFF: PASS`，`QA_STATUS: PASS`。
