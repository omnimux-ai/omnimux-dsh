# 渠道分组显示名整改验证证据（2026-09-16）

- 任务工作树：`.worktrees/channel-group-naming`（分支 `feat/channel-group-naming`，基线 `origin/main` @ `cba279c8f`）
- 变更性质：纯展示层文案（34 个分组的 `label` / `badge`）+ 新增命名规范契约 + 新增门禁
- 证据目录：`docs/evidence/`

## 一、验证结论速览

| 层次 | 手段 | 结果 |
| --- | --- | --- |
| 数据层 | 门禁 `node scripts/verify-channel-group-naming.mjs` | ✅ 通过（18 个模型族 / 34 个分组，6 类规则零违规） |
| 单元 / 组件层 | 中枢 + 画布镜像 + 门禁自测 + 跨插件对齐 | ✅ 全绿（22 + 12 + 12 + 11 = 57 项） |
| 应用层（真实浏览器） | `pnpm verify:app`（工作树隔离环境） | ✅ 通过（7 项断言，端口 63218 / CDP 63220） |
| 应用层（真实浏览器，任务专属） | `tmp/channel-group-naming-verify.mjs`（临时脚本，复用同一套 bootstrap + CDP） | ⚠️ 部分通过：应用启动、引导通关、工作区渲染、旧词零命中均通过；**画布内级联菜单展开断言未覆盖**（见第四节） |

## 二、应用层真实浏览器验证明细

环境：工作树隔离测试环境（`startTestEnvironment({ root, mode: 'ui' })`），动态端口，无共享 profile 污染，结束时自清理。

| # | 断言 | 结果 | 关键事实 |
| --- | --- | --- | --- |
| 1 | app-runtime-ready | ✅ | 应用服务就绪（origin 动态端口） |
| 2 | same-origin-login | ✅ | 同源 token→Cookie 换发返回 303 |
| 3 | chrome-cdp-listen | ✅ | 真实 Chromium（headless=new）+ CDP 连接 |
| 4 | app-dom-mounted | ✅ | 页面正文挂载（`body.innerText.length > 0`） |
| 5 | onboarding-dismissed | ✅ | 通过界面按钮「继续 / 选择工作区」走通首启引导层 |
| 6 | canvas-route-rendered | ❌ 未通过 | 见第四节原因说明 |
| 7 | model-trigger-present | ❌ 未通过 | 同上 |
| 8 | new-group-names-visible | ❌ 未通过 | 同上 |
| 9 | legacy-vendor-words-absent | ✅ | 渲染出的可见文案中 **零命中** `AutoDL`、`号池`、`Pidoi`、`Evolink`、`高速档`、`画质档`、`特惠版`、`进阶版`、`高价档`、`顶配满血版` |
| 10 | screenshot-png-verified | ✅ | 真实 PNG 截图，头信息与尺寸校验通过 |

原始结果：`docs/evidence/channel-group-naming-verify.json`
截图：`docs/evidence/channel-group-naming-app-home.png`
通用应用级验收报告：`docs/evidence/worktree-app-qa-report.json`

## 三、数据层门禁明细（本次整改的核心保证）

`node scripts/verify-channel-group-naming.mjs`：

```
✅ 渠道分组命名门禁通过：18 个模型族 / 34 个分组，label 全部命中白名单，禁用词零命中，画布镜像一致。
```

六类规则：`LABEL_NOT_ALLOWED`（白名单）、`LABEL_DUPLICATE_TIER`（族内独占）、`STANDARD_LABEL_MISSING`（基准档必备）、`LABEL_SHAPE_INVALID`（构词法）、`FORBIDDEN_WORD`（供应商名 / 采购层黑话 / 促销话术 / 价格自述）、`MIRROR_MISMATCH`（中枢与画布镜像逐字一致）。

门禁自测含 5 组反向用例（注入供应商名、白名单外 label、重复档位词、缺基准档、镜像漂移），全部按预期失败。

## 四、未覆盖项与原因（如实记录）

**画布内模型级联菜单的展开断言未在浏览器内完成。** 具体表现与原因：

1. 应用加载后停在首启引导层与工作区首页；通过界面按钮可正常通关（断言 5 已证明）。
2. 进入「创作画布」需经「项目 → 打开工程 → 选中素材节点 → 展开模型选择」多步交互；本次自动化尝试中，hash 直达（`#/workspace/ws_qa_media`）与导航点击均未落到画布视图（探针显示 `[class*="wf-"]` 与 `canvas` 元素计数为 0，URL 停留在根路径）。
3. 依据仓库规则「不要靠猜选择器、必须先真实观察」，未继续盲试坐标与猜测选择器。

因此画布内文案断言改由以下两条**等价覆盖面**承担，并在 PR 中标注：

- 数据层门禁：直接校验中枢与画布镜像的 `label` / `badge` 全部命中白名单且禁用词零命中（渲染层读取的就是这份数据）。
- 端到端测试：`plugins/omnimux-workflow/tests/e2e/channel-group-naming.e2e.test.mjs` 断言级联菜单源与镜像数据的分组文案。

**Dev 真机（45120）验收归人工**，按仓库契约不构成 Agent 侧交付前提，本任务不代签。

## 五、未评价项

- 未验证改名对历史工程保存态的影响（`label` 为展示层，`id` / `wireGroup` 未改动；迁移面未实测）。
- 未在真实计费链路上验证分组选择后的扣费（本任务不触碰定价字段）。
