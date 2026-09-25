# 规格说明书：统一 Agent 预设与专家插件数据源（Issue #2662）

## 1. 目标与背景（Objective）
- **核心痛点**：
  1. 数据两张皮：输入框 Agent 预设下拉列表读取官方原生 DSH 运行时扫描的全部预设（含系统级内置团队与用户自建），而专家市场依赖硬编码静态数组 `DEFAULT_MARKET_EXPERTS` 孤岛，导致官方内置预设与用户自建 Agent 在专家市场彻底隐形。
  2. 非 Agent 工具混入：`HTML 生成器`（`html-generator`）作为纯功能性网页生成工具被错当成 Agent 专家。
  3. 双胞胎冗余：TikTok 与亚马逊均存在粗糙版与深度定制版两张重复卡片。
- **重构目标**：
  1. 专家市场全面适配官方 `@deepseek-ai/dsh-agent-presets` 服务（`ctx.agentPresets.list()`），将其作为唯一权威动态真源。
  2. 专家市场完整展示系统内置 Agent、出海专精专家与用户自建 Agent，安装/聘用状态与输入框下拉列表 100% 毫秒级同步。
  3. 彻底移除 `html-generator`；TikTok 唯一保留高价值 `TikTok 电商专家`（升级为默认已入职）；亚马逊唯一保留精细版 `亚马逊运营专家`（升级为默认已入职）。

## 2. 用户操作旅程与期望界面反馈（User Journey & UI Feedback）
1. **浏览专家市场**：
   - 用户打开「专家市场」Tab，不再只看到孤立的 8 张旧卡片，而是能看到：
     - **出海专精团队**：Shopee运营专家、YouTube创作者专家、亚马逊运营专家（精细版）、TikTok电商专家（精细版）、媒体创作者；
     - **系统预装团队**：代码开发、短剧专家、社媒专家、营销专家、日常工作等（打上 `[系统预置]` 徽章，操作按钮禁用或标示为核心保障）；
     - **我的自建 Agent**：用户通过输入框「创建 Agent」新建的专属 Agent 实时同步亮相，打上 `[用户自建]` 徽章。
   - 彻底不再出现「HTML 生成器」。
2. **入职与离职操作**：
   - 对「可聘用」的出海专家点击「安装/聘用」，成功落盘至 `$DSH_HOME/.agent-presets/<id>/`，卡片状态瞬时变为 `[已入职]`，输入框 Agent 下拉列表毫秒级出现该专家，无需重启。
   - 对「已入职」的出海专家点击「禁用/办理离职」，归档至 `.retired`，卡片状态转为 `[已离职]`，输入框下拉菜单中对应项即刻移除。

## 3. 架构设计与数据流（Architecture）
- **权威数据源拓扑**：
  - 宿主提供 `ctx.agentPresets.list()` 动态发现方法，通过 `local-api` 暴露；
  - `reconcileMarketExperts(home, officialPresets)` 纯函数执行归一化比对与聚合，输出三层模型；
  - 容灾降级：离线或单测无 Cordis 容器时，自动扫描 `$DSH_HOME/.agent-presets` 与出厂预设目录兜底。
- **广播通信机制**：
  - 安装/禁用变更通过 `settings/document-updated`（命名空间 `agent-presets`）广播，触发前端视图与官方 Seat 控制器无感重读。

## 4. 交付命令（Commands）
- 构建：`pnpm --filter omnimux-market build`
- 测试：`node --test plugins/omnimux-market/lib/tests/experts-market.test.js`
- 规范审查：`ocr review`

## 5. 测试策略与验收标准（Acceptance Criteria）
- **AC-1**：全系统彻底消除 `html-generator`。
- **AC-2**：TikTok 专家唯一保留 `tiktok-ecommerce-expert`，初值为已入职；亚马逊专家唯一保留 `amazon-operations-expert`，初值为已入职。
- **AC-3**：`expertMarketList` 接口返回的数据中，动态包含官方扫描发现的系统预设与用户自建预设。
- **AC-4**：`experts-market.test.ts` 全部用例 100% 绿灯通过。
- **AC-5**：产品经理（许清楚）对 UI 文案与元素验收通过（`PM_SIGN_OFF: PASS`）。
- **AC-6**：开源代码审查（`ocr review`）零保留意见。

## 6. 边界与防御契约（Boundaries）
- **总是（ALWAYS）**：
  - 严格保持向后兼容，导出 `DEFAULT_MARKET_EXPERTS` 供既有引用；
  - 任何落盘目录严格校验 `PRESET_ID` 正则，杜绝目录穿越；
  - 遵循现代 SaaS 科技极简标准，零多余 Emoji 与无意义徽章。
- **先问（ASK FIRST）**：
  - 修改官方 DSH Desktop 核心 ASAR 内核。
- **绝不（NEVER）**：
  - 在主检出直接修改受版本保护的业务源码；
  - 自作主张发明不在白名单内的非标准状态字段。
