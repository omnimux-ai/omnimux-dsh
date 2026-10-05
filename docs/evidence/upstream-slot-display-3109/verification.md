# Issue #3109 验证证据：上游已连素材的可见性与消费一致性

- 任务工作树：`.worktrees/workflow-upstream-slot-display-issue-3109`
- 基线：`origin/main` @ `7e54d38a2`
- 采集时间：2026-10-05
- 采集方式：真实组件渲染（esbuild 打包真实 `ConfigPanel` + 真实 i18n 字典，`renderToStaticMarkup`），输入为 Dev 45120 真机快照数据

## 1. 真机复现快照（Dev 45120 只读读取）

| 项 | 值 |
| --- | --- |
| 目标节点 | `29a3cb6c…`：`nodeKind=generate`、`materialType=image`、`status=empty`、`selectedTool=image-to-image` |
| 目标 params | `{ model: 'gpt-image-2.5', operation: 'text_to_image' }` |
| 目标绑定 | `inputBindingVersion=1`、`slotBindings={}`、`slotConflicts=[]` |
| 上游节点 | `b1e5f1ca…`：`nodeKind=import`、`materialType=image`、`mediaAssets[0].url=/omnimux-workflow/api/local-file?path=…HTufQo8a4AA6tsR.jpeg` |
| 边 | `targetHandle='in'`、`edge.data={createdAt:…}`（无 role / targetSlot） |
| 界面（修复前） | 卡槽区只有 1 个追加 `+`，上游图片不可见 |

`gpt-image-2.5` 在中枢目录中只有 `text_to_image` 为 listed（唯一槽位 `prompt`/text）；其 `multi_reference`（含 `reference_image` 图片槽）`research.status=draft`、`execution.status=stub`，对画布不可见。

## 2. 修复前行为（对照，取自方向 B/C 调查报告）

| 环节 | 修复前结果 |
| --- | --- |
| 接收 | `feedAssets.length=1`、`isReadyFeedAsset=true` |
| 布局 | `layout.slots=[prompt(text)]`（operation 派生，与节点 `selectedTool=image-to-image` 无关） |
| 装填 | `autoFillSlots` 以 `slot.type('text') !== asset.type('image')` 拒绝 → 素材只进 `unusedFeed` |
| 渲染 | `records.length=0` → V1 records 分支渲染 0 张已装填卡 + 1 个追加 `+` |
| 提交 | `references=[]`，素材只落进 `unusedFeedEdgeIds`（全仓零消费方）→ 四道就绪闸门放行，**静默丢弃且提交成功** |

## 3. 修复后实测输出（同一份真机快照）

命令：`node /tmp/omx-inv/verify-unused.mjs`（harness 落 /tmp，不提交）

```
{
  "A": { "wells": { "total": 2, "filled": 0, "empty": 1 }, "unused": ["no_matching_slot"],
         "chipText": "data-testid=\"wf-input-unused\" data-unused-reason=\"no_matching_slot\" title=\"不再使用\"> HTufQo8a4AA6tsR · 当前生成方式不支持该素材" },
  "B": { "wells": { "total": 3, "filled": 1, "empty": 1 }, "unused": [] },
  "C": { "wells": { "total": 2, "filled": 0, "empty": 1 }, "unused": [] }
}
VERIFY_OK
```

- **A｜复现快照**：输入区出现 1 条「未使用」条目，文案 `HTufQo8a4AA6tsR · 当前生成方式不支持该素材`；已装填卡 0、追加 `+` 1。→ 上游素材不再静默消失。
- **B｜阳性对照**（同一份 feed，operation 声明 `reference_image` 槽）：已装填卡 1、未使用条目 0。→ 素材可被消费时照常入槽，机制未被削弱。
- **C｜用户主动排除**（`slotStandbyEdgeIds` 含该边）：未使用条目 0。→ 待命池语义不变。

## 4. 回归实测

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 画布类型检查 | `node node_modules/typescript/bin/tsc -p tsconfig.canvas.json --noEmit` | exit 0 |
| 宿主类型检查 | `node node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit` | exit 0 |
| 插件测试套件 | `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"` | 2373 tests / 2371 pass / 2 fail |
| 失败项定位 | `src/workflow/m2-fixes.test.mjs`、`src/workflow/routes.smoke.test.mjs` | 与本次改动无关（路由/工作区 CRUD）；已在 stash 掉本次改动后复现同一失败 |

说明：工作树初次运行有 12 个失败项，全部为缺少被忽略的构建产物 `dist/index.js`；执行 `node scripts/build-host.mjs` 后降至上述 2 个既有环境失败项。

## 5. 真实浏览器验收（工作树内，port 0，自清理）

入口：`node /tmp/omx-inv/browser-evidence-3109.mjs`（任务本地脚本，不进仓库；工作树内以 esbuild 打包真实 `ConfigPanel` + 真实 `canvas/theme/*.css`，起临时静态服务，驱动无头 Chrome 真实渲染并截图）

- 截图：`slot-unused-3109-repro.png`（960×673，同一份 Dev 真机快照数据）
- DOM 实测（真实浏览器内 `getBoundingClientRect`）：

| 断言 | 实测 |
| --- | --- |
| 未使用条目数 | 1 |
| 原因码 | `no_matching_slot` |
| 文案 | `HTufQo8a4AA6tsR · 当前生成方式不支持该素材` |
| 条目尺寸 | 180×44 px（与既有 `wf-effective-text` 条目一致，无破版） |
| 已装填卡 | 0 |
| 追加 `+` | 1 |

退出码 `BROWSER_EVIDENCE_OK`。人眼复检：条目与追加 `+`、提示词框、模型行排版正常，无留白黑洞或错位。

## 6. 未覆盖

- 真机（Dev 45120）界面截图：Dev 属人工验收，Agent 不 gate、不重启。
- 「operation 声明图片槽位时素材照常入槽」的浏览器对照：内核单测与真实组件渲染断言已覆盖（`unusedSupply.test.mjs`、`upstream-unused-supply-3109.e2e.test.mjs`）；浏览器页仅保留复现路径。
- 图生图真正可用：需要 `gpt-image-2.5#multi_reference` 走完上架闭环，见规格 §8。
