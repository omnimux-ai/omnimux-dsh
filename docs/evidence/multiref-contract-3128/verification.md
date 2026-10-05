# Issue #3128 · 图生图契约对齐 —— 验证证据

- 任务工作树：`.worktrees/workflow-multiref-contract-issue-3128`
- 分支：`agent/workflow-multiref-contract-issue-3128`，基线 `origin/main` @ `7aad4c19e`
- 关联：#3109（上游素材可见性）、#2850（标准图像线路权限拒绝阻断真实验收）、#3128
- 只读取证报告：`.agent-reports/gpt-image-25-multiref-contract-20261005/{01-hub-contract,02-upstream-contract,03-canvas-alignment}.md`

## 1. 结论

`gpt-image-2.5#multi_reference` 在画布上不可见，**直接原因是中枢目录状态**（`research.status: draft`，`listed` 五项合取中唯一为假；`execution.status: stub` 不参与判定）。但**上架之后仍会坏**：`slotBindings` 的未初始化值 `{}` 在显示侧被当作「未初始化」自愈装填、在执行侧被当作「显式为空」跳过装填，于是卡槽显示已装填、按钮可用，请求里却没有那张参考图，两端都不报错。

本任务修复该阻断缺陷（未初始化才自愈装填并落盘），并把目录声明里与上游公布契约不符的注记改正。

## 2. 变更

| 文件 | 变更 |
| --- | --- |
| `plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts` | V1 且 `slotBindings` 为 `undefined`（未初始化）时执行与显示侧同一个 `autoFillSlots` 并落盘；无占位者时保持原有 `{}` 形状；待命边照旧排除 |
| `plugins/omnimux/src/catalog/specs/image-models.yaml` | `gpt-image-2.5#multi_reference`：删除与官方和本仓实现均不符的「已落地 Edits 路由」注记；把 `limitSource` 写清为本仓保守策略（上游合同只公布 `reference_images {min:0,max:16}`） |
| `plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs` | 新增 4 项一致性断言 |
| `specs/multiref-contract-alignment-3128.spec.md` | 本任务规格 |

未改动任何既有测试与断言；未改动 `listed` 状态（上架属独立闭环，见 §7）。

## 3. 内核与一致性测试

```
node --test plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs
→ tests 4 / pass 4 / fail 0
```

覆盖：未初始化 V1 节点重算后落盘自愈装填且提交侧选中同一占位者；待命边不被装填；无可装填供给保持 `{}`；用户显式清空（`{}`）不被改写。

既有断言零翻转（含被 #3109 记录为不可改的三处）：

```
node --test src/canvas/store/canvasStore.catalogHydrate.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotAutofillRegression.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  tests/canvas-default-operation.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs \
  tests/effectiveInputDisplay.regression.test.mjs
→ tests 107 / pass 107 / fail 0
```

## 4. 全量回归

```
# omnimux-workflow
node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"
→ tests 2407 / pass 2405 / fail 2

# omnimux（中枢）
corepack pnpm --filter omnimux test
→ tests 3131 / pass 3131 / fail 0
```

两项失败为**既有环境问题**，与本次变更无关：把本次源码改动 `git stash` 后重建产物再跑同一对文件，仍是 11 pass / 2 fail：

```
git stash push -- plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts plugins/omnimux/src/catalog/specs/image-models.yaml
node --test src/workflow/m2-fixes.test.mjs src/workflow/routes.smoke.test.mjs
→ tests 13 / pass 11 / fail 2   （失败项：prefix migration、workspace CRUD round-trip）
```

首次全量跑出现的 12 项 `ERR_MODULE_NOT_FOUND` 是工作树缺构建产物所致，执行 `plugins/omnimux-workflow/scripts/build-host.mjs` 后消失。

## 5. 静态与契约门禁

```
node node_modules/typescript/bin/tsc -p tsconfig.canvas.json --noEmit   → exit 0
node node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit     → exit 0
corepack pnpm verify:model-contracts
  → exit 0；admission errors=0 warnings=0；listedOperations=28（未改变上架状态）
```

目录指纹由 `e1dadb077baac74b` 变为 `9ffb9e0ada6ec232`（注记文本参与指纹），因此触发**跨插件闭环**：`plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json` 的 `catalog_fingerprint` 随之过期。按官方离线导出重新生成并核验：

```
node scripts/export-voice-previews.mjs --out /tmp/...   # env:{}，无网络
→ 与已入库快照逐键对比：changed keys = catalog_fingerprint（93911291f90394df → c41745bc0c3fee24）
  preview_fingerprint 不变；voices 509 条逐字节不变
node scripts/export-voice-previews.mjs --check <快照>   → exit 0（byte-identical）
corepack pnpm --filter omnimux-assets test              → tests 778 / pass 778 / fail 0
```

同步前该套件为 777/778，唯一失败即「packed exporter 与仓库副本必须一致」；同步后全绿。

## 6. 真实浏览器验证（工作树内，真实 Chrome）

脚本：`/tmp/omx-inv/browser-evidence-3128.mjs`（任务本地，未入库）。页面内运行**真实** `recomputeCanvasSlots`，再用**真实** ConfigPanel + 真实 i18n 字典 + 真实 `src/canvas/theme/*.css` 渲染重算结果；仅 `useUpstreamMedia` / `useModelParameterSchema` / `canvasStore` / `generationPreferencesStore` / `i18n` / `ui` 六个边界为内存桩（与 #3109 的 e2e 桩同构）。

实测 DOM 事实：

| 用例 | operation | 落盘绑定 | readyToSubmit | 已装填卡槽 | 未使用提示 | 预览图 |
| --- | --- | --- | --- | --- | --- | --- |
| 正例 | `multi_reference` | `reference_image: [{edgeId:'e-ref', sourceNodeId:'img1'}]` | true | 1 | 0 | 42×42 px |
| 对照 | `text_to_image` | `{}` | true | 0 | 1（`no_matching_slot`） | — |

对照用例的提示文案为「HTufQo8a4AA6tsR · 当前生成方式不支持该素材」，即 #3109 的行为未被削弱。

截图（960×673，含真实主题样式，人眼复检无破版）：
- `multiref-filled-3128.png` —— 正例：参考图卡槽已装填并显示上游预览
- `multiref-control-3128.png` —— 对照：无图片槽，素材以「未使用」条目呈现

已知局限：桩化的 `useModelParameterSchema` 让面板底部模型名显示为「暂无可兼容模型」，属harness 桩产物，不是产品行为；本用例的判定依据是卡槽状态、落盘绑定与提交就绪，与该处文案无关。

## 7. 未覆盖 / 不在范围

- `research.status` 由 draft 升 verified 并激活上架：按上架铁律需 ①契约定义 ②**授权真机最小生成验证并留证** ③升格并绑证据 ④渠道组与画布白名单 ⑤门禁核验。其中 ② 目前被 #2850（上游图像分组权限 403）阻断，需单独授权。
- 把 `max` 由 1 提到上游 16 并支持多图参考：需同时改 `map.js` 的 OpenAI 发包分支与画布多槽交互，属能力扩展。
- 上游未公布 `GET /v1/images/generations/{task_id}` 而本仓在轮询它（`openai-media.js:155`）：记录为风险，本次不改。
- 其他三个模型（`gpt-image-2.5-hd`、`grok-imagine-image-2-0`、`grok-imagine-image-quality`）的 `multi_reference` 注记含同样的「Edits 路由」表述，本次未改（未核验其实现，不做无据断言）。
