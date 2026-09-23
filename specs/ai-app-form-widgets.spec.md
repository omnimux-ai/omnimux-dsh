# AI 应用表单复合控件 · 任务规格（Issue #2596）

## 1. 背景与目标
AI 应用（omnimux-apps）表单现有 8 种通用控件（`AppFormPanel.tsx` 已实现 input-text / textarea / select-single / ratio-cards / slider-range / switch-boolean / media-uploader / media-extractor；`manifest.ts` 声明的 select-grid-pair 未渲染）。对照用户确认的竞品截图与已验收演示页 `tmp/ai-app-form-widgets-demo.html`，缺少带业务来源的复合控件。用户已明确授权实施（演示确认通过）。

## 2. 新用户基线
全新用户安装登录后，三个内置应用（商品生视频、爆款复刻、视频转提示词）的表单即可渲染新控件；库选择器在对应库（资产库/灵感库/商品库）无数据时显示空态文案，不报错、不依赖开发机任何私有状态。

## 3. 范围（只做这些）
1. **库选择器**：单一控件按字段配置切换 资产库 / 灵感库 / 商品库；弹窗挑选（搜索+网格+确认）、结果回填为可移除的选中卡片。
2. **多选列表**：胶囊标签多选，支持 `max` 上限，达上限后未选项置灰并提示。
3. **选项卡**：2~4 项分段切换（多选一），用于「预设类型/自定义内容」类场景。
4. **视频链接升级**：现有 media-extractor 增强为三来源——粘贴链接 / 本地上传 / 从资产库添加，结果统一卡片展示、可移除。
5. **商品链接**：单行输入 + 右侧商品库选择按钮，与视频链接同构。
6. 将上述控件接入三个内置应用（`builtinCatalogData.ts` / `catalog/builtin-apps.json` 中对应表单定义），按用户截图字段排布。

## 4. 硬边界
- 复用优先：先审计 hub 的 `components/inspiration-picker`、composer 库选择器等既有实现；omnimux-apps **不得 import hub 内部实现**，只能走 `ctx.get` / `omnimux_*` 既有公开 seam；确无公开出口时，在 `.agent-reports/` 记录最小共享边界提案，不私自新建路由。
- 设计：遵守 design.md 与 docs/contracts/ai-app-ui-spec.md（输入 40px、CTA 44px、圆角 8px、弹窗 16px、SVG 图标、禁原生 select、禁 Emoji 图标、WCAG AA、消费 --dsw-alias-* Token，禁 --omx-* 私造变量）。
- 文案：遵守 ui-copywriting-and-naming-standards.md；QA 门禁正则 `/全部(平台|账号|来源|类型|状态|分类|发布方式)/` 命中即 FAIL。
- 不动 hub 内部、不动官方 DSH、不改 form-contract 包（那是任务表单插件的另一套协议）。

## 5. 成功标准（可测）
- `manifest.ts` FormWidgetType 新增控件类型，`schemaValidator.ts` 校验覆盖（含 options/max/library 配置非法时的拒绝用例）。
- `AppFormPanel.tsx` 渲染全部新控件；inferWidget 推断规则不破坏既有 8 种控件的自动映射。
- 三个内置应用表单使用新控件；既有应用快照/单测按需更新且语义不丢字段。
- `pnpm --config.verify-deps-before-run=false --filter dsh-omnimux-apps test`（或包实际名）全绿；`pnpm verify:stages` 通过；文案门禁扫描通过。
- 工作树内 ego-browser 真实浏览器证据：三个应用逐一打开，验证弹窗选择回填、多选上限置灰、选项卡切换、视频链接三来源、商品链接商品库回填，PNG 留存于 `.agent-reports/`。

## 6. 非目标
不做表单可视化设计器、不改发布向导、不动执行链路（executionBridge）语义、不接真实上传/支付。
