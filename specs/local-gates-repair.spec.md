# 《本地门禁可跑通修复规格（Spec）》

- **状态**：**已批准（用户直接指令「研究具体什么问题，解决修复掉」）**
- **生效工作树**：`.worktrees/local-gates-repair`
- **生效分支**：`agent/local-gates-repair`
- **归档路径**：`specs/local-gates-repair.spec.md`

---

## 一、需求背景与目标（Objective）

本机 `pnpm test:gates` 有 25 处失败。逐个定位后分成三类，**都不是本次改动引入的，也都不是 CI 会发现的**——CI 的 `quality-gate.yml` 只跑它自己那份显式清单，这三个测试文件都不在其中：

1. **证据夹具只在 CI 里造**（`evidence-contract.test.mjs`、`guard-quality-loop.test.mjs`，约 10 例）：这两个测试要求 `EVIDENCE_FIXTURE_REPO/ROOT/SHA` 等环境变量，而夹具由 workflow 内联 bash 现场 `git init` 生成并写入 `$GITHUB_ENV`。本机没有任何等价步骤 → 抛 `EVIDENCE_FIXTURE_ENV_REQUIRED`。
2. **预检回归**（`sync-targets.test.mjs`、`sync-release-policy.test.mjs`，2 例重测试）：这两个测试最后一次改动是 2026-10-05 16:50（#3158），而 17:22 的 #3161「宿主包代际按目标应用解析，对不上就响亮失败」让物化后的启动预检要求**目标应用必须存在**。本机没装 `/Applications/DSH Desktop.app` → `--dsh` 与 `--all` 退出 1、`--all` 还会整体回滚。测试只断言「目标选择」和退出码 0，与「应用必须已安装」无关。
3. **预设 YAML 依赖本机 PyYAML**（`verify-agent-presets.test.mjs`，约 8 例）：该测试 `spawnSync('python3', ['-c', 'import yaml ...'])` 解析 `presets/**/agent.cordis.yml`。PATH 上的 Homebrew python3 没有 PyYAML（`/usr/bin/python3` 有），于是所有 YAML 用例全挂。该文件同样不在 CI 清单里。

目标：让 `pnpm test:gates` 在本机**无需额外手工准备**即可跑通；不降低任何断言严格度；不放宽安全门禁。

## 二、行为契约（Acceptance Contract）

- **C1** 本地门禁入口必须自带证据夹具：运行前生成与 CI 等价的合成 git 夹具（一个提交、含 `.gitignore` 与 `source.txt`），并把 `EVIDENCE_FIXTURE_REPO/ROOT/SHA` 注入被测进程。CI 的清单与夹具逻辑不变。
- **C2** 夹具只写临时目录，运行结束自清理；不得触碰主检出或用户 profile。
- **C3** 启动预检在「目标应用由 Profile 归属**推导**得出且该路径不存在」时，降级为**明确的跳过**（退出 0 并打印 ⚠ 原因）；在「`--app` 或 `OMNIMUX_PREFLIGHT_TARGET_APP` **显式**指定却不存在」时仍**硬失败**（配置错误）；在「应用存在但宿主包代际不匹配」时仍**硬失败**（保留 #3145 意图）。
- **C4** 预设 YAML 解析不得依赖本机 Python 三方库：改用仓库已依赖的 `yaml` npm 包完成等价解析（含 `!js` 标签处理），断言与用例名保持不变。
- **C5** 不得为了让门禁变绿而删除、跳过或弱化任何断言；无法在仓库侧修的，必须显式记录为前置条件并给出可执行指引。

## 三、用户操作旅程与验收用例

维护者在本机执行：

```bash
pnpm test:gates
```

| 用例 | 期望 |
| --- | --- |
| AC-1 | 无需手工设 `EVIDENCE_FIXTURE_*`，证据契约与质量闭环用例全过 |
| AC-2 | 未安装底座应用时，`sync-stable.sh --dsh/--all` 退出 0 且输出中仍出现目标 Profile 路径 |
| AC-3 | 显式 `--app <不存在路径>` 仍退出 1；已安装应用代际不匹配仍退出 1 |
| AC-4 | 预设 YAML 用例在本机（无 PyYAML）全过，且用例名与断言不变 |
| AC-5 | 夹具目录运行后不残留；主检出 `git status` 干净 |

## 假设

- 假设 1：`EVIDENCE_FIXTURE_ENV_REQUIRED` 一类失败的唯一原因是本机没有与 CI 等价的夹具与变量注入；若为真，提供本地夹具后这些用例应当直接通过，而无需改任何断言。
- 假设 2：`sync-targets`/`sync-release-policy` 的失败由 #3161 引入的「目标应用必须存在」导致，而不是目标选择逻辑本身坏了；若为真，把「推导路径缺失」降级为跳过（显式指定仍硬失败）后，这两个文件应当恢复通过。
- 假设 3：预设测试失败的唯一原因是 PATH 上的 `python3` 缺 PyYAML；若为真，换成 npm `yaml` 解析后应当全过，且不需要本机安装任何 Python 包。

## 证伪方式

- 证伪假设 1：`grep -rn "EVIDENCE_FIXTURE" scripts/*.test.mjs` 后，若某用例在夹具齐备时仍失败，说明它另有前置条件，假设被证伪（此时按实际报错继续查，不得改用例）。
- 证伪假设 2：`git log -1 --format=%ci 071bd5ab3` 与 `9508af171` 对比；若测试最后改动晚于预检改动，则回归假设不成立。执行 `node --test scripts/sync-targets.test.mjs` 与 `scripts/sync-release-policy.test.mjs` 复核是否恢复。
- 证伪假设 3：`python3 -c "import yaml"` 与 `/usr/bin/python3 -c "import yaml"` 对比；若换解析器后仍失败，说明失败另有原因。
- 汇总验证命令：
  ```bash
  pnpm test:gates
  node --test scripts/verify-profile-preflight.test.mjs
  ```

## 旧标准变更

- `scripts/verify-agent-presets.test.mjs` :: `*`

**原断言**：该文件通过 `spawnSync('python3', ['-c', <内联 Python 脚本>])` 解析 `presets/**/agent.cordis.yml`（含 `tag:yaml.org,2002:js` 自定义构造器），失败时抛 `${rel} yaml parse failed`。所有 YAML 相关用例都建立在这个 Python 解析器之上。

**必须改的理由**：解析器依赖本机 Python 三方库 PyYAML，而该文件不在 CI 清单里、CI 也不安装 PyYAML；本机 PATH 上的 `python3` 没有该库，导致 8 个用例恒挂。仓库已直接依赖 npm 的 `yaml` 包（`test-env-bootstrap.mjs` 即用它），可用它做等价解析。

**实际改法（按仓库门禁要求：只允许新增，不允许删改既有断言）**：保留原有 Python 解析路径与其全部断言原文，只在两个解析入口各插入一行「本机没有 PyYAML 时走仓库内解析」的分支，解析实现放在新增的 `scripts/lib/preset-yaml.mjs`。Python 可用时行为与改动前完全一致。**用例名、断言与期望值全部不变**，因此不属于放宽标准，但按仓库规则仍需逐条声明并接受独立审查。

**新期望证据**：
- 同一批用例在本机（无 PyYAML）全部通过，用例名不变。
- `!js` 标签语义与 Python `SafeLoader` 构造器保持一致（该标签在预设里代表可执行的 JS 片段，解析为字符串）。
- 验证命令：`node --test scripts/verify-agent-presets.test.mjs`。

## 四、不在范围

- 不改 CI 清单（`quality-gate.yml` 的测试列表与夹具逻辑保持原样），不改任何断言期望值。
- 不改 `verify-profile-preflight.mjs` 对「代际不匹配」「显式应用缺失」的硬失败行为。
- 不为本机安装 Python 包或修改 Homebrew 环境（C4 用仓库侧解析替代）。

## 五、涉及文件

- 新增：`scripts/local-evidence-fixture.mjs`（合成夹具 + 注入变量）、`scripts/run-gates-local.mjs`（本地门禁入口）
- 修改：`package.json`（`test:gates` 走本地入口）、`scripts/verify-profile-preflight.mjs`（推导路径缺失降级为跳过）、`scripts/verify-agent-presets.test.mjs`（YAML 解析改 JS，按上文声明）、`scripts/governance-manifest.json`

## 六、验证计划（最小充分命令集）

```bash
node --test scripts/verify-agent-presets.test.mjs
node --test scripts/sync-targets.test.mjs scripts/sync-release-policy.test.mjs
node --test scripts/verify-profile-preflight.test.mjs
pnpm test:gates
```
