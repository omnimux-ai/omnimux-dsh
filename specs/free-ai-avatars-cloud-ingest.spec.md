# Spec: free-ai-avatars 云端资产库增量入库与角色「类型」体系落架

## 1. 业务目标与范围界定
- 目标：将 `library/opc/free-ai-avatars/versions/v1/files/` 目录下的 100 款数字人角色（含 100 张高清立绘 PNG 与 99 段 24kHz 原声音频 WAV）正式上架至云端资产中心。
- 范围边界：
  - 严格聚焦本次新增的 100 款角色资产，零改动、零波及历史已有数据。
  - 角色分类维度定名为「类型」（`type`）。
  - 原有 329 套 Pippit 角色全量收归于【数字人】类型（`digital-human`）。
  - 新增 100 款角色完整保留其 4 大原生子类：【人类原型】（30套）、【流行网梗】（25套）、【动物拟人】（20套）、【奇幻世界】（25套）。
  - 声音与角色严格 1:1 绑定（99 款专属原声），绑定 R2 CDN 直链与本地高速路径双轨。

## 2. 关键设计与契约规格
- 数据层（`build-cloud-assets-catalog.mjs`）：
  - 在 `CHARACTER_DIMENSIONS` 首位注册 `{ id: 'type', zh: '类型', en: 'Type', defaults: ['digital-human'] }`；
  - 在 `collectCharacter` 中同时收集 Pippit 经典数字人与 `free-ai-avatars` 增量资产；
  - 角色总数由 329 扩充为 429。
- 客户端层（`locales.js`、`character-dimensions.js`）：
  - 补充 `dim.type` 及 5 个子项中英对照字典；
  - 确保「类型 >」下拉菜单在角色视图中置顶且层级最高（无遮挡）。
- 云端发布与分片：
  - 产出分片 `manifest.json`、`index.json`、`character/page-*.json`（18页）、`all/page-*.json`。

## 3. 验收标准与验证证据
- [ ] 底层物理包通过 `assetctl validate` 校验无误。
- [ ] 自动化测试套件 `npm test` 100% 全绿通过（475+ 测试全绿）。
- [ ] 角色总数准确升为 429 套，按「类型」筛选可无缝联动 5 个子项。
- [ ] 立绘展示清晰、99 款专属原声音频支持试听与创作流调用。
