# 质量五步闭环门禁加固：真实验收证据硬化与防形式主义拦截

- 任务分支：`feat/quality-gate-evidence-hardening`
- 涉及文件：`scripts/guard-quality-loop.mjs`、`scripts/guard-quality-loop.test.mjs`
- 基线：`origin/main`

## 一、背景与问题根因

### 1.1 现状与漏洞
现行质量门禁脚本 `scripts/guard-quality-loop.mjs` 存在以下严重漏洞：
1. **证据黑名单缺失**：只按文件扩展名 `png|jpg|jpeg|webp|json|log|txt|md` 判定，完全不校验文件名。导致智能体（Agent AI）普遍使用通配的首页冒烟图 `app-home.png` / `app-home.jpg` 充当所有前端任务的“真实验收证据”，根本未进入被测功能页面；
2. **证据目录泛滥**：门禁代码中扫描了 `tmp/` 目录 (`collectEvidenceFiles(resolve(root, 'tmp'), 0, acc)`)，导致 AI 在临时目录跑完测试后随手清理，甚至没有任何持久化资产入库；
3. **交付命令（commit / push / PR）缺失证据同捆校验**：当前仅在 `ui.length > 0 && e2e.length === 0` 时拦截，只要有 E2E 测试文件，即使整个改动集完全没有提供任何实机验证截图，也会被直接放行；
4. **报错缺乏主动重定向（Active Steering）**：拦截发生时仅抛出简短拒绝，没有给出结构化、格式化、可直接无脑执行的行动台阶引导。

### 1.2 加固目标
1. **黑名单硬拦截**：显式拒绝 `app-home.png`、`app-home.jpg`、`app-home.webp` 等通配首页图作为有效验收证据；
2. **收敛证据扫描目录**：彻底剔除 `tmp/` 与系统临时目录，证据必须位于 `docs/evidence/` 或 `.agent-reports/` 或 `.workbuddy/evidence/`；
3. **前端交付同捆强校验**：当改动集合包含前端界面源码（`isUiSourcePath`）时，除了必须包含 E2E 测试外，必须同时包含至少一个位于 `docs/evidence/` 或 `.agent-reports/` 下的有效证据文件；
4. **格式化重定向报错**：给出直接可照抄执行的重定向台阶指引，引导 Agent AI 走向正确的真实验收路径。

---

## 二、验收标准（Acceptance Criteria）

### AC-1：通配首页图硬拦截
- **给定**：当前任务产生了需求规格 `specs/*.md`；
- **当**：在证据目录中仅存在 `app-home.png` 或 `app-home.jpg` 或其变体时；
- **则**：`hasEvidenceAfterSpec` 判定为 `false`，试图编写 E2E 测试或提交代码时必须被物理拦截。

### AC-2：临时目录（tmp/）不再作为有效证据
- **给定**：当前任务产生了需求规格 `specs/*.md`；
- **当**：仅在 `tmp/` 目录下生成证据文件，而受控目录（`docs/evidence/` 等）中无新文件时；
- **则**：`hasEvidenceAfterSpec` 判定为 `false`，物理拦截。

### AC-3：前端界面改动同捆证据校验（Delivery Gate）
- **给定**：当前任务的变更集合（`taskChangeSet`）中包含前端界面源码（`isUiSourcePath`）；
- **当**：执行提交/推送/建 PR 命令（`isDeliveryCommand`）时：
  - 若变更集合中无 E2E 测试文件 → 触发 `missing-e2e-for-ui-change` 拦截；
  - 若变更集合中有 E2E 测试文件，但无受控目录下的有效证据文件（`docs/evidence/` 或 `.agent-reports/` 且非通配首页图）→ 触发 `missing-evidence-for-ui-delivery` 拦截；
  - 若变更集合中同时包含 E2E 测试文件与有效专属证据文件 → 门禁判定 `allow` 放行。

### AC-4：非前端界面改动豁免证据同捆要求
- **当**：任务变更集合仅包含后端服务、命令行脚本或纯文档时；
- **则**：不强制要求同捆提交证据图片。

### AC-5：清晰的重定向行动指引
- **当**：触发 `missing-evidence-for-ui-delivery` 时；
- **则**：标准输出包含可直接执行的步骤指引（导航页面、保存截图至 `docs/evidence/<task>-verified.png`、`git add` 并重新提交）。
