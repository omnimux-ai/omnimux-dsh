# 质量五步闭环门禁硬化验证证据（Issue #1870 / PR）

- 任务分支：`feat/quality-gate-evidence-hardening`
- 涉及文件：`scripts/guard-quality-loop.mjs`、`scripts/guard-quality-loop.test.mjs`
- 规格文档：`specs/quality-gate-evidence-hardening.spec.md`

## 一、变更概述与治理针对性

针对 Agent AI 在前端界面任务中存在的“形式主义以首页冒烟图打卡（`app-home.png`）”与“截图写入 `/tmp` 随手删除未入库归档”两大漏洞，实施了**物理级代码门禁拦截（Hard Gate）与主动重定向（Active Steering）**：

1. **首页通配图硬黑名单**：
   - 在 `scripts/guard-quality-loop.mjs` 中定义 `BANNED_SMOKE_EVIDENCE_NAMES`；
   - 显式拒绝 `app-home.png`、`app-home.jpg`、`app-home.webp`、`home.png` 等通配首页图作为功能验证证据。
2. **彻底剔除临时目录**：
   - 证据扫描路径中完全移除 `tmp/`，证据必须物理持久化存放在受控目录（`docs/evidence/` 或 `.agent-reports/`）。
3. **前端交付同捆强校验（Delivery Gate）**：
   - 当任务变更集合包含前端界面源码（`isUiSourcePath`）时，除了必须包含 E2E 测试外，强制要求变更集合中必须包含受控目录下的有效专属证据（`isTaskEvidencePath`）；
   - 缺失专属证据时触发 `missing-evidence-for-ui-delivery` 物理阻断，并输出直接可照抄执行的重定向台阶。

---

## 二、测试与验证结果

| 测试项 | 执行命令 | 结果 | 关键断言说明 |
| :--- | :--- | :--- | :--- |
| 质量门禁全套单元测试 | `node --test scripts/guard-quality-loop.test.mjs` | **23 / 23 全部通过** | 覆盖规格判定、源码判定、同捆校验与黑名单 |
| 首页通配图黑名单回归 | 测试用例 `REGRESSION: app-home.png smoke screenshot and tmp/ are rejected as valid evidence` | **通过** | `app-home.png` 与 `tmp/` 产生证据被严格拒绝 |
| 前端改动缺专属证据拦截 | 测试用例 `UI change without evidence blocks delivery even if e2e test exists` | **通过** | 有 E2E 但缺专属证据时，物理拦截 `commit`、`push`、`gh pr create` |
| 前端改动齐备专属证据放行 | 测试用例 `UI change with both e2e test and task evidence passes completeness gate` | **通过** | 同时包含 E2E 与 `docs/evidence/*.png` 专属证据时，正常放行 |
| 跨工作树目标判定一致性 | 测试用例 `CONVERGENCE: delivery commands honour git -C <task repo> for the change set` | **通过** | `-C` 目标仓库的变更集同捆证据校验准确生效 |
| 语法与空白检查 | `git diff --check` | **通过** | 零格式问题与多余空白 |

---

## 三、拦截示例与重定向效果验证

当 Agent AI 修改了前端代码却未提交专属证据时，触发输出如下结构化行动引导：
```
🚫【质量五步闭环硬门禁：界面实测证据同捆拦截】本任务改动了前端界面代码，但变更集合中没有提交专属实测证据，禁止交付！
📌 判定规则：改动集合含界面源码时，必须同时提交 docs/evidence/ 或 .agent-reports/ 下的专属实测截图/证据文件。
⛔ 严禁使用通配首页冒烟图（app-home.png）或 /tmp 临时截图充数：证据必须具备任务专属特征并持久化入库！
👉 正确行动指引（请按以下步骤操作）：
  1. 在无痕真实浏览器中进入本次改动的功能页面；
  2. 模拟真实用户执行核心交互（点击、切换、输入）；
  3. 将专属实操截图保存至：docs/evidence/<task>-verified.png；
  4. 执行：git add docs/evidence/<task>-verified.png；
  5. 重新执行提交/交付命令。
```
