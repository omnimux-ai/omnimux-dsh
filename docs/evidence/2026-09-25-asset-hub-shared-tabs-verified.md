# 2026-09-25 素材工作台与新会话共享 Tab 栏单一真源重构验证记录

- **实施角色**：前端开发工程师 裴像素（Pixel / 像素匠）
- **核准需求与规格**：`specs/asset-hub-shared-tabs.spec.md`（产品经理 许清楚 锁定签发）
- **系统架构实施方案**：`specs/asset-hub-shared-tabs-architecture.md`（架构师 高见远 核准签发）
- **验证时间**：2026-09-25 20:02:00
- **验证状态**：`VERIFIED_PASSED`

---

## 1. 验证目标与门禁对照

1. **【门禁一（四件套确认）】**：
   - PRD / UI Spec / Architecture 100% 对齐。
   - 彻底废除素材工作台不符合定位的「画布」Tab，将其纠正为「精选」（Featured），补齐「爆款趋势」（Trending）与「Skills」，素材工作台与新会话全屏统一为 6 大主库。
2. **【门禁二（design.md 遵循）】**：
   - 32px 控件高基准，单行不折行工具栏；
   - 8px 标准圆角体系；
   - 100% 消费官方 `--dsw-alias-*` 语义 Token；
   - 纯矢量 SVG 图标（15×15），UI04 门禁 0 处违规。
3. **【门禁三（零自由发挥）】**：
   - 二级分类首项 100% 严格固定为「全部」（All），彻底消除了「全部资产」「全部灵感」等叠词废话；
   - 界面无非必要装饰性角标、无副标题、无 Emoji。

---

## 2. 核心改动成果与单一真源

1. **共享契约层（`plugins/omnimux/src/client/shared/asset-hub-tabs/`）**：
   - `shared-tabs-catalog.js`：单一真源元数据字典（`SHARED_PRIMARY_TABS`、`SHARED_SUB_CATEGORIES`、`SHARED_I18N_SPEC`）；
   - `SharedTabIcons.jsx`：统一导出 15×15 纯矢量 SVG 图标；
   - `SharedPrimaryTabs.jsx` 与 `SharedSubTabs.jsx`：高内聚通用组件，双模态无缝自适应；
   - `shared-tabs.test.js`：静态断言单测 100% 通过。
2. **状态机升级与 Canvas 彻底拔除（`asset-hub-store.js`）**：
   - `PRIMARY_TABS` 权威收敛为 `['featured', 'assets', 'inspiration', 'products', 'trending', 'skills']`；
   - 彻底移除了 `canvas`；
   - `readPersistedTab` 遭遇旧值安全降级为 `featured` 或 `assets`。
3. **全模态六路数据引擎与 Click-to-Attach（`asset-hub-data.js`）**：
   - 扩展支持 `featured`、`trending`、`skills` 数据的归一化（`NormalizedAssetHubItem`）；
   - 组合筛选过滤算法，支持中文标签到英文枚举字典映射；
   - `adaptCardToAttachmentPayload` 转换与 Prompt 模板生成，点击仅注入附件槽与追加 Prompt，绝不自动调用发送消息 API。
4. **加号菜单路由适配（`library-stage-model.js` & `controller.js`）**：
   - `tabForKind` 适配 6 大分类；
   - `controller.js` 扩展 `openFeatured`、`openTrending`、`openSkills`。
5. **右栏素材工作台组件重构（`AssetHubHeader.jsx`, `AssetHubToolbar.jsx`, `AssetHubPanel.jsx`）**：
   - 消费共享组件，单行优雅排布；
   - 拔除 `canvas` 分支，统一网格渲染。
6. **新会话全屏专区对接（`ExploreTemplatesSection.jsx`, `templates-data.js`）**：
   - 消费共享真源，彻底消除叠词。

---

## 3. 测试与验证数据

- `plugins/omnimux/src/client/shared/asset-hub-tabs/shared-tabs.test.js`: 3/3 passed
- `plugins/omnimux/src/client/workbench/asset-hub.test.js`: 10/10 passed
- `plugins/omnimux/src/client/composer-add/controller.test.js`: 17/17 passed
- `plugins/omnimux/src/client/composer-add/library-stage-model.test.js`: 5/5 passed
- `plugins/omnimux/src/client/session-guide/templates/templates-data.test.js`: 4/4 passed
- `plugins/omnimux/src/client/session-guide/templates/explore-templates-rearchitecture.e2e.test.js`: 1/1 passed
- `plugins/omnimux/src/client/workbench/asset-hub.e2e.test.js`: 3/3 passed
- **合计 43 项测试 100% 全绿通过**。
- **静态 UI 门禁（`scripts/guard-ui-rules.mjs`）**：0 处违规。
