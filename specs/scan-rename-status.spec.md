# scan 把 git 的零填充重命名分数判成非法状态

## 背景

`scripts/test-change-review.mjs` 的 `analyzeTestChanges` 用一条正则校验 `change.status`：

```
/^(?:A|M|D|T|[RC](?:100|[1-9]?\d))$/
```

`R`/`C` 只接受 `100` 或 1–2 位数字。但 git 的 `--name-status -M` **用零填充三位**报告相似度——实测部分重命名输出 `R073`（200 行文件删掉 50 行后改名）。于是 `readEvaluationChanges`（生产者，直接读 git 输出）与 `analyzeTestChanges`（消费者）对接时必然抛 `unsupported-change-status`。

后果：`node scripts/test-change-review.mjs scan <root> [base]` 在存在部分重命名的仓库上直接失败。CI 侧目前只调 `readEvaluationChanges`（`verify-test-standard-declarations.mjs`），不经过这条校验，所以线上门禁不受影响；但 CLI 与评估域清单这条链路是坏的。

## 用户操作旅程

1. 开发者在任务工作树里跑 `node scripts/test-change-review.mjs scan . origin/main`，改动里含一个部分相似度的重命名 → 期望：正常输出评估域清单，而不是 `unsupported-change-status`。
2. 完全相同的重命名（`R100`）→ 期望：行为不变。
3. 未填充分数的 `R73`（git 也可能产出）→ 期望：接受。
4. 畸形状态 `R000` / `R999` / `R101` / `X073` → 期望：仍然拒绝。

## 变更点

`scripts/test-change-review.mjs`：把 `R`/`C` 的分数从「`100` 或 1–2 位数字」放宽到「1–100，允许零填充三位」：

```
[RC](?:100|0[1-9]\d|00[1-9]|[1-9]\d?)
```

覆盖 `100`、`073`、`007`、`99`、`9`；排除 `000`、`999`、`101`。分数本身在这条链路里不被使用（只用到 `R`/`C` 前缀与后续 `A`/`D` 判定），所以放宽不改变任何语义，只是把生产者的真实输出认下来。

## 假设

- 假设 1：git 确实产出零填充三位。依据：在本仓 `--name-status -z --find-renames` 上实测，200 行文件删掉 50 行改名后输出 `R073`。这条已被新增的集成测试**断言住**（测试会检查 `changes` 里存在 `/^R0\d\d$/`，否则失败），所以将来 git 改格式会让测试红，而不是静默失效。
- 假设 2：`R000` 不会被 git 产出。依据：相似度为 0 的文件对不会被判定为重命名。因此把 `000` 排除在合法集合外不影响真实输入。
- 假设 3：放宽不会让畸形输入混进来。依据：分数范围仍限 1–100，且 `A`/`M`/`D`/`T` 分支未动；新增用例覆盖了 `R000`/`R999`/`R101`/`X073`/`R073x`/空串六个拒绝分支。

## 证伪方式

- 若 `R073` 仍被拒，改动未生效。
- 若 `R100`/`R9` 的判定发生变化，或 `A`/`M`/`D`/`T` 被波及，则改动溢出。
- 若集成测试里 `changes` 不含 `/^R0\d\d$/`，说明这条测试没有守住真实回归（此时它应当失败，而不是通过）。
- 若 `analyzeTestChanges` 对重命名的 `oldPath`/`path` 归属变了（原先 `R100` 的用例断言 `oldPath`），则改动破坏了语义。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 本脚本测试 | `node --test scripts/test-change-review.test.mjs` | **6/6 通过**（4 → 6，新增 2 条） |
| 门禁套件 | `pnpm test:gates` | 471 / 459 通过；**12 条失败与改动前逐条同名**（既有环境/内容问题） |

逐条实测：

| 状态 | 改动前 | 改动后 |
| --- | --- | --- |
| `R073` / `R007` / `C073` | 抛 `unsupported-change-status` | **接受** |
| `R100` / `R99` / `R9` | 接受 | 接受（不变） |
| `R000` / `R999` / `R101` / `X073` / `R073x` / `''` | 拒绝 | 拒绝（不变） |
| 真实部分重命名（fixture 仓 + `readEvaluationChanges`） | 抛错 | **正常产出 1 条 `R0xx` 记录，`oldPath`/`path` 正确** |

## 新产品基线

无影响：只改测试评估工具，不涉及产品默认值、模型、路径或本地状态。

## 文档影响

无。`docs/contracts/anti-agent-fake-completion-guard.md` §3.1 已经写明「`scripts/test-change-review.mjs` 的评估域清单目前是独立工具，其 `scan` 尚未接入 CI」——本次只修它的解析 bug，不改变它是否接入 CI 的状态，所以那句话不需要动。
