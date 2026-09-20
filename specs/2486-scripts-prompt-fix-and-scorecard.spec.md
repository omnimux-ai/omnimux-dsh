# 任务规格：分镜脚本提示词修复、回归门禁与可视化打分表

- Issue: #2486
- 目标：修复分镜脚本提示词生成缺陷，防止画面描述中文与手法代号泄露；补齐自动化校验门禁（41 -> 44 项）；交付单文件 HTML 可视化打分表，供第一关业务验收。

## 一、核心变更清单

1. `scripts/workflows/batch-shoot.v0.js.txt` & `batch-shoot.v1.js.txt`:
   - 强化 `buildPrompt`：
     - 明确约束 `visual` 必须为全英文提示词（English visual prompt for image generation models），包含主体、景别、运镜、光影与环境细节，严禁使用中文；
     - 明确说明手法名称/代号仅为叙事结构和分镜卡点节奏参考，严禁把手法代号英文单词写进 `visual` 中作为画面主体；
     - 强化手法核心动作指引，使手法结构更好体现在分镜与口播中。
2. `scripts/workflows/prepare-args.mjs`:
   - 自动在写入 `args.json` 的同时生成包含 `dryRun: true` 的 `args-dry.json`，确保 dryRun 模式天然与 full 模式区分且开箱可用。
3. `scripts/workflows/verify-batch-shoot.mjs`:
   - 增加 3 项回归安全门禁（总检查项 41 -> 44）：
     - 检查 v1 `buildPrompt` 明确包含英文画面要求（English visual prompt 约束）；
     - 检查 v1 `buildPrompt` 包含禁止手法 ID 泄露为画面的提示词规则；
     - 检查 `args-dry.json` 包含 `dryRun: true` 且与 `args.json` 不相同。
4. `deliverables/omnimux-batch-shoot-run-20260920/scorecard.html`:
   - 单文件交互式 HTML 打分表：
     - 支持 12 条脚本按卡片/表格切换查看；
     - G1~G8 八维度评分（1-5分），包含前置说明与打分标准；
     - 实时计算每条均分与全批次均分；
     - G7 平台合规为一票否决项，勾选违规直接标记整条未通过；
     - 支持一键导出评分 JSON 与 Markdown 报告。

## 二、验收标准

1. `node scripts/workflows/verify-batch-shoot.mjs` 输出 44/44 通过；
2. `node scripts/workflows/prepare-args.mjs` 正常生成 `args.json` 和 `args-dry.json`，指纹与首跑逐位一致（同 seed=20260920）；
3. 检查 `args-dry.json` 包含 `dryRun: true`，`args.json` 不包含 `dryRun: true`；
4. `scorecard.html` 在浏览器中打开无脚本报错，交互流畅，支持打分与导出。
