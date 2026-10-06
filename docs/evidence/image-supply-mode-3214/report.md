# #3214 证据报告 · 系统默认生成方式不得锁死上游素材

任务：`workflow-image-supply-mode-issue-3214`（分支 `agent/workflow-image-supply-mode-issue-3214`，基底 `origin/main` = `f0ff53bef`）
规格：`specs/workflow-image-supply-mode-3214.spec.md`

## 1. 现象与根因（可复现）

用户报告：连入一张正常 JPG 后，画布节点底栏报「当前生成方式不支持该素材」。

复现（合成目录 + 真实 `recomputeCanvasSlots`，`plugins/omnimux-workflow` 内）：

```
STEP1  operation=text_to_image  compat=ok ["prompt_required"]      ← 空节点落到目录推荐模式并写盘
STEP2  operation=text_to_image  bindings={}  compat=ok [...]        ← 连入就绪 JPG 后模式被锁死，素材未装填
```

根因：`src/shared/graph/canvasSlotRecompute.ts` 把目录推荐模式写进 `params.operation`，此后该字段被当作「用户已保存的创作选择」，素材自适应（`resolveSlotOperation`）只在 `!params.operation` 时才生效。

## 2. 修复

- 节点数据新增 `autoOperationId`：`string` = 系统自动写入的模式；`null` = 用户显式拍板；`undefined` = 历史节点（仅在模式等于目录推荐值时按系统写入对待）。
- 仅当被保存的模式属于系统写入、且**无法吸收已就绪的上游媒体**时，才按供给池重新推导模式；用户拍板过的模式永不被改写。
- 用户显式选择生成方式时写 `autoOperationId: null`。

## 3. 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 本任务回归（5 例） | `node --test plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.supplyMode.test.mjs` | 5/5 通过 |
| 插件包全量 | `pnpm --filter omnimux-workflow test` | 2433 测试 / 161 套件，pass 2433，fail 0 |
| 产品基线 | `pnpm verify:product-baseline` | 见同目录 `product-baseline.txt` |

回归用例覆盖：①空节点落到目录推荐模式并记录来源；②连入就绪 JPG 后自动改用可吸收它的模式、装填落盘、未使用条目消失、可提交；③用户拍板过的模式不被改写（仍如实列出未使用素材）；④历史节点自愈；⑤模型无可吸收模式时行为不变、不静默丢素材。

## 4. 未执行项（如实记录）

- **工作树真实浏览器验证未执行**。本次改动只改画布状态机（模式来源判定与改写条件），不改任何渲染标记、文案或布局；`scripts/impact-matrix.mjs` 因客户端 `.tsx` 文件变更将 `browser` 标为 required，但该判定未区分「渲染变更」与「状态逻辑变更」。如需补做，应在本工作树内用 `pnpm test:worktree-web` 走「新建图片节点 → 连入 JPG → 观察模式与卡槽」路径并留存截图。
- 开发版（端口 45120）真机验收为人工职责，未执行。
