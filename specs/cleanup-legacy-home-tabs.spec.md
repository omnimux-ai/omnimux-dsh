# 规格：彻底移除首页旧版冗余 Tab（创作灵感 / Skill）与旧版卡片，仅保留「探索模板」

- **关联 Issue**：#2225
- **工作树**：`omnimux-dsh-wt-cleanup-legacy-home-tabs-2225`
- **所有者**：软件交付团队 (主理人 齐活林)

---

## 1. 痛点根因与目标 (Objective)

此前虽然成功合入了 395+ 套创意模版总表与 7 大分类货架组件，但由于在 `SessionGuide.jsx` 中依然并存着：
1. `StarterGroupList`（旧 10 项文字卡片）；
2. `PopularStarterGrid`（旧 4 大入门卡片）；
3. `TrendingReplicateSection`（渲染了「创作灵感」与「Skill」两个旧 Tab）；

导致用户在真实桌面端应用刷新后，首屏被旧内容严重霸占，误判为“根本没生效新的”。
本次目标：**坚决执行减法，彻底移除上述三块旧组件，让首页唯一纯粹地聚焦于「探索模板 (Explore templates)」！**

---

## 2. 验收标准 (Acceptance Criteria)

- **AC-1 (旧 Tab 彻底清除)**：页面文本中不再出现「创作灵感」与「Skill」两个旧 Tab。
- **AC-2 (旧卡片彻底清除)**：页面中不再渲染 `omnimux-starter-groups` 与 `omnimux-popular-starters-grid`。
- **AC-3 (探索模板独占首屏)**：在非紧凑模式下，空白会话首页直接以「探索模板 (Explore templates)」为核心，呈现 7 大分类胶囊与多主题流媒体货架行。
- **AC-4 (端到端实机验证)**：CDP 连接 Dev App 实测页面，确认 `hasExploreRoot: true`，且页面前 500 字符文本中直接出现「探索模板」与 7 大分类，无旧 Tab 遗留。
