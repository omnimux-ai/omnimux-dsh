# #3619 移除创作页顶栏「检查生成输入」临时预检入口

## 目标与交付边界
#3274/#3275 为验证中枢预检合同，在创作页顶栏常驻了「检查生成输入」入口与只读草稿弹窗（`GenerationProductDraft`）。它没有用户场景：不选任何条件也能打开，最优结果只是「输入预检通过，尚不能生成」，并把分支 JSON、参数名导航、`outputId/outputVersion`、MIME 冲突等内部合同直接暴露在创作页主界面。真实生成早已走节点底栏（Prompt / 模型 / 参数 / 生成，按节点执行）。

本片只做移除：顶栏不再渲染该入口与弹窗，并删除仅被它消费的组件、preview 模块、单测、e2e journey 与 `generationDraft.*` 双语字典键。不改中枢 `/omnimux/generation-products` 与 `/preview` 契约，不改节点生成流程、执行器、模型路由与价格。

## 有界写集
- `plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.tsx`：删除 import、`draftOpen` 状态、入口胶囊与弹窗挂载。
- 删除 `plugins/omnimux-workflow/src/canvas/editor/components/GenerationProductDraft.tsx`、`generationProductPreview.ts`、`generationProductDraft.test.mjs`。
- 删除 `plugins/omnimux-workflow/tests/e2e/generation-consumer-preview.e2e.test.mjs` 与其 journey，替换为移除验收 e2e。
- `plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts` / `dict.en.ts`：移除 `generationDraft.*` 键（两语同步，`DictKey` 由 zh 派生）。
- `plugins/omnimux-workflow/src/canvas/theme/components.css`：删除该弹窗独占的 48 行死规则（含永不成立的 `:has()` 选择器）。
- `plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.test.mjs`：补入口与主题样式的回归断言。
- 退役被移除入口打断的旧验收 `plugins/omnimux-viewer/tests/e2e/media-mime-selection.e2e.test.js` 与其 `test-support/media-mime-selection-3278/`（该 journey 完全由草稿弹窗驱动；素材 MIME 验收已由 `src/media-viewer/picker-mime.e2e.test.js` 与 `media-mime-selection.test.js` 承担）。
- 本 spec 与任务专属证据（`.workbuddy/evidence/header-removal-3619/<runId>/` 运行证据 + 入库的 `docs/evidence/workflow-remove-draft-entry-3619.md` 与截图）；不改 `scripts/`、CI、契约与 manifest。

## 用户旅程与验收
AC1：打开创作页，顶栏胶囊区不再出现「检查生成输入」；`document.querySelector('.wf-generation-draft-entry')` 为空，且不存在任何 `generationDraft` 文案。
AC2：画布功能不变：适应视图、缩放、对齐网格、小地图开关仍渲染可用（e2e 断言顶栏 5 个真实控件的 title 集合），画布图仍挂载；节点工具栏与节点底栏生成入口不受影响。注：`layoutMode` 分支在 `origin/main` 上就未被 `CanvasEditor` 传入，属既有死接线，本片不声称其可用、也不修复。
AC3：删除后仓库内不再有该弹窗的引用（`rg generationDraft|GenerationProductDraft|generationProductPreview|wf-generation-draft` 仅命中历史 spec/证据与本任务 e2e/spec）；被打断的第二消费方（viewer #3278 journey）随本片退役，其素材 MIME 覆盖由 `picker-mime.e2e.test.js` 承接。
AC4：双语字典键数一致，类型检查、插件单测、构建与 `verify:stages`、`verify-anti-slop` 通过；e2e 断言顶栏入口缺失与画布控件仍在。

## 假设
假设该入口在实现层没有第二个消费方：`GenerationProductDraft`、`generationProductPreview.ts` 与其字典键只服务这一处弹窗，删除后不会影响节点生成、执行状态胶囊或任何中枢调用，顶栏移除空胶囊容器不会改变其余控件的布局与命中区域。**已证伪一处**：`plugins/omnimux-viewer/test-support/media-mime-selection-3278/legacy-journey.mjs` 曾以该弹窗驱动素材 MIME 验收；该 journey 随本片退役（见写集），其验收职责由 viewer 既有 MIME 用例承接。

## 证伪方式
若删除后仍有文件 import `generationProductPreview`/`GenerationProductDraft`（`rg -n` 命中非历史 spec/证据），或类型检查/构建报缺失导出，或隔离 worktree 的真实浏览器里顶栏出现空白胶囊、其余控件错位、节点生成按钮不可用，则假设被证伪，需回退该删除并改为仅隐藏入口。可执行验证：`node --test "src/**/*.test.mjs"`（插件 cwd）、`tsc -p tsconfig.canvas.json --noEmit`、三个 build 脚本、`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`，以及 worktree 内真实浏览器证据。

## 文档与基线影响
文档影响：仅本 spec 与任务证据；历史规格 `specs/generation-consumer-preview.spec.md` 与其证据保留为历史记录，不追改。新用户基线：正常安装登录后进入创作页即可验证；移除不依赖任何本机 dev 状态，缺失时无新增错误路径。

## 非目标
不删除中枢接口、不改节点生成与执行、不发布生产版本、不动主检出上他人未提交的改动。
