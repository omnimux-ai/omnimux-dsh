# 技能/专家工坊新增「插件专栏」与全插件分类开关布局规范 (Spec)

## 一、目标（Objective）

在技能/专家（`omnimux-market`）工坊主界面中：
1. **新增 Tab 入口**：在「专家市场」Tab 右侧新增「插件专栏」Tab，保持与 `Skill`、`我的 Skill`、`专家市场` 相同的几何基准与吸顶交互；
2. **视觉还原截图布局**：
   - 纵向按**四大业务分类**（内容与创作、视频与媒体、社媒与运营、智能体与系统）分组组织；
   - 每一分类下采用**双列自适应网格（2-Column Grid）**；
   - 每个插件卡片：左侧圆角矩形槽位展示专属矢量 SVG 图标，中间展示**插件名称（粗体主文案）**与**功能描述（次级说明文本）**，右侧提供**可开启/禁用的 Toggle Switch 开关**；
   - 支持顶部搜索框对插件名称、描述与 ID 的实时检索过滤；
3. **设计体系规范（`design.md`）**：
   - 100% 消费官方 `--dsw-alias-*` Token；
   - 严禁 Unicode 字符与 Emoji（UI04 门禁）；
   - 核心受保护插件（`omnimux`、`omnimux-market`）开关呈现锁定开启态，避免误关影响中枢运行。

---

## 二、命令（Commands）

```bash
# 构建 client bundle
npm --prefix plugins/omnimux-market run build

# 运行全量单元测试与 E2E 验证
node tests/e2e/market-tabs-alignment.e2e.test.mjs
node tests/e2e/market-mine-category-bar.e2e.test.mjs
node tests/e2e/market-plugins-column.e2e.test.mjs

# 运行 UI04 门禁校验
node scripts/scan-ui-gates.mjs
```

---

## 三、项目结构（Project Structure）

- `plugins/omnimux-market/src/client/plugins-column.js`: 插件专栏分类元数据、SVG 图标、状态读写与卡片渲染组件；
- `plugins/omnimux-market/src/client/i18n.js`: 插件专栏及相关分类、文案中英文词条；
- `plugins/omnimux-market/src/client/css.js`: 双列网格、卡片、图标槽位与 Switch 布局样式；
- `plugins/omnimux-market/src/client/skill-plaza.js`: 主界面导航栏增加 Tab 路由并接入内容分发；
- `plugins/omnimux-market/src/client/plaza/plazaUtils.js`: 插件专栏标题与搜索占位符解析；
- `plugins/omnimux-market/scripts/concat-client.mjs`: 打包流水线引入 `plugins-column.js`；
- `tests/e2e/market-plugins-column.e2e.test.mjs`: 针对插件专栏的自动化端到端测试。

---

## 四、代码风格与设计规范（Code Style & Design Rules）

1. **色彩与设计 Token**：
   - 卡片背景：`var(--dsw-alias-bg-layer-1)`
   - 悬停背景：`var(--dsw-alias-bg-layer-2)`
   - 边框：`var(--dsw-alias-border-l1)`
   - 图标槽位：36x36px，圆角 8px，背景 `var(--dsw-alias-bg-layer-2)`，图标颜色 `var(--dsw-alias-label-primary)`
   - 主标题：14px 600，颜色 `var(--dsw-alias-label-primary)`
   - 副标题：12px 400，颜色 `var(--dsw-alias-label-secondary)`
2. **纯矢量 SVG 图标**：
   - 每个插件拥有独立语义的纯 SVG 矢量图标，严格杜绝 Unicode 字符与 Emoji（`UI04`）。
3. **状态持久化**：
   - 使用 `window.localStorage` 键 `omnimux:plugins-enabled-state` 持久化开启/禁用状态。

---

## 五、测试策略（Testing Strategy）

1. **测试文件**：`tests/e2e/market-plugins-column.e2e.test.mjs`；
2. **测试项**：
   - 验证一级 Tab 导航中正确渲染「插件专栏」且位于「专家市场」右侧；
   - 验证切到「插件专栏」时不渲染旧 category-bar 胶囊栏；
   - 验证四大分类与 21 款 OmniMux 内置插件全量渲染，各卡片包含图标、标题、描述与开关；
   - 验证受保护插件（`omnimux`、`omnimux-market`）的只读锁定状态；
   - 验证可配置插件的开关切换与本地存储持久化；
   - 验证搜索框过滤逻辑。

---

## 六、边界与门禁（Boundaries）

- **总是做（Always）**：
  - 遵循 `design.md` 消费官方 `--dsw-alias-*` Token；
  - 遵循 UI04 规范使用矢量 SVG 图标；
  - 在提交前跑通所有相关 E2E 测试与 UI 门禁扫描。
- **先问（Ask First）**：
  - 调整其他无关插件的配置或结构。
- **绝不做（Never）**：
  - 破坏现有 Skill / 我的 Skill / 专家市场原有逻辑；
  - 使用未定义的颜色硬编码或 Unicode 字符。
