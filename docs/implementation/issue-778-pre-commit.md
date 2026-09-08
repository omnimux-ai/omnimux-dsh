# Issue #778 — 提交前分层门禁与 package.json 收敛报告

## 1. 目标与背景

- **任务目标**：依据用户明确授权的「分层门禁」策略，在任务工作树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778` 完成 #778 提交前门禁与 package.json 收敛。
- **基线审查**：
  - 任务工作树路径：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`
  - 关联 Issue：`#778`（单包 tarball 纳管提交前门禁收敛）
  - HEAD Commit：`580234923268673562cacb5cd01aebdb780339e1`
- **执行原则**：
  - 不使用任何子代理，直接在指定任务工作树内完成修改与验证；
  - 严格不执行 `git commit` 或 `git push`，所有变更保持工作树内干净规范状态，交由主理人统一操作。

---

## 2. 修改详情

### 2.1 `package.json` 脚本收敛与分层定义

在 `package.json` 中配置清晰分层测试脚本，将原本单一且未完整覆盖的 `test:managed-tarball` 拆解为单元测试与事务恢复测试两层，并提供完整聚合入口：

```json
    "test:managed-tarball:unit": "node --test scripts/managed-tarball.test.mjs scripts/materialize-cache.test.mjs scripts/managed-tarball-l2.test.mjs scripts/managed-tarball-preparation.test.mjs",
    "test:managed-tarball:transaction": "node --test scripts/managed-tarball-t02.qa.test.mjs scripts/managed-tarball-transaction.test.mjs scripts/managed-tarball-recovery.test.mjs",
    "test:managed-tarball": "corepack pnpm test:managed-tarball:unit && corepack pnpm test:managed-tarball:transaction",
```

- **`test:managed-tarball:unit`（69 项）**：
  包含无宿主外部依赖的核心单测（归档防护、离线缓存机制、L2 隔离负例与 DirectoryAnchor 祖先绑定及无进程等价图证明），运行迅速（约 40 秒），可作为 CI/CD 云端环境高可靠门禁。
- **`test:managed-tarball:transaction`（81 项）**：
  包含宿主端到端真实 pnpm 安装、事务发布 rename 14 点故障注入、中断恢复及独立 QA 专项测试用例，运行耗时较长（约 10 分钟），用于本地深度验收。
- **`test:managed-tarball`（150 项聚合）**：
  聚合上述两组测试套件，供本地提交前执行完整回归验证。

### 2.2 `.github/workflows/quality-gate.yml` CI 工作流收敛

将 CI 中的受管归档测试步骤收敛为运行单元测试套件，彻底解耦云端环境对宿主机特定分发链或过长事务耗时的依赖：
- **步骤名称**：由 `Test managed tarball transactions` 更新为 `Test managed tarball unit suite`；
- **执行命令**：由 `test:managed-tarball` 收敛为 `corepack pnpm --config.verify-deps-before-run=false test:managed-tarball:unit`；
- **环境配置**：完整保留 Python 3.14 与 fixed pnpm 11.7.0 的环境准备及干净 sandbox 环境变量设置。

---

## 3. 实测验证与通过证据

### 3.1 CI 干净环境模拟验证（`test:managed-tarball:unit`）

在隔离空目录（模拟 GitHub Actions runner 干净沙箱）下验证 `test:managed-tarball:unit`：
- **测试构成**：
  - `scripts/managed-tarball.test.mjs`
  - `scripts/materialize-cache.test.mjs`
  - `scripts/managed-tarball-l2.test.mjs`
  - `scripts/managed-tarball-preparation.test.mjs`
- **实测结果**：
  ```text
  ℹ tests 69
  ℹ suites 0
  ℹ pass 69
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 39263.624459
  ```
- **判定**：**100% PASS**（69/69 通过，耗时约 39.2 秒，exit code: 0）。

### 3.2 本地全量聚合验证（`test:managed-tarball`）

在工作树环境中执行聚合命令 `corepack pnpm --config.verify-deps-before-run=false test:managed-tarball`：
- **第 1 阶段（Unit Suite）**：
  - 测试数：69 项
  - 结果：69 pass / 0 fail
  - 耗时：41,991.67 ms（约 42.0 秒）
- **第 2 阶段（Transaction & Recovery Suite）**：
  - 测试数：81 项（含 QA 16 项、Recovery 19 项、Transaction 46 项）
  - 结果：81 pass / 0 fail
  - 耗时：617,444.35 ms（约 10.29 分钟）
- **聚合统计**：
  - **总项数**：150 / 150 PASS（0 fail / 0 cancelled / 0 skipped / 0 todo）
  - **总退出码**：exit code: 0
- **判定**：**100% PASS**。

---

## 4. Git 工作树与文件规范审计

执行 `git status --short` 审查当前工作树：
```text
 M .github/workflows/quality-gate.yml
 M docs/contracts/dev-pipeline.md
 M docs/contracts/ops-entry.md
 M package.json
 M pnpm-lock.yaml
 M scripts/git-wt.test.mjs
 M scripts/sync-bypass.test.mjs
 M scripts/sync-plugin-scope.test.mjs
 M scripts/sync-release-policy.test.mjs
 M scripts/sync-stable.sh
 M scripts/sync-targets.test.mjs
 M scripts/sync-to-app.sh
?? docs/implementation/
?? docs/qa/
?? docs/specs/issue-778-managed-tarball-architecture.md
?? docs/specs/issue-778-managed-tarball-class.mermaid
?? docs/specs/issue-778-managed-tarball-followup.md
?? docs/specs/issue-778-managed-tarball-prd.md
?? docs/specs/issue-778-managed-tarball-sequence.mermaid
?? scripts/backup-shared.qa.test.py
?? scripts/managed-tarball-archive.py
?? scripts/managed-tarball-l2.test.mjs
?? scripts/managed-tarball-preparation.test.mjs
?? scripts/managed-tarball-recovery.test.mjs
?? scripts/managed-tarball-t02.qa.test.mjs
?? scripts/managed-tarball-transaction.test.mjs
?? scripts/managed-tarball.mjs
?? scripts/managed-tarball.test.mjs
?? scripts/materialize-cache.mjs
?? scripts/materialize-cache.test.mjs
?? scripts/materialize-graph.mjs
```

- **规范性检查**：
  - 执行 `git diff --check`：输出为空，无多余空格、无行尾空白、无编码异常。
  - 工作树内无临时测试产生的临时目录或构建垃圾文件残留。
  - 所有新增实现代码、规格文档（PRD/架构/时序图/类图）、QA 报告及实施笔记均按规范归档。

---

## 5. 结论与交付建议

1. **就绪判定**：**READY FOR COMMIT**。#778 本地门禁配置收敛与分层策略已完全就绪，CI 路径与本地完整回归均获 100% 绿灯验证。
2. **后续动作**：保持工作树未提交状态，交由主理人（Coordinator）统一组织 commit、创建 PR 并推进 Merge Queue。
