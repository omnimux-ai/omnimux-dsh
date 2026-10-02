# specs/tail-dsh-home-stage-ci.spec.md — Issue #2960

## 背景

父任务 #2890 五步走治理收口后遗留两条小尾巴：

1. **测试落盘无统一隔离**：`scripts/run-workspace-tests.mjs` 与 `plugins/omnimux/scripts/run-tests.mjs` 不给测试进程注入 `DSH_HOME`。任何新测试一旦触达 `hubHomeDir()`（media task-store 账本、auth store、plugins manage、apps routes 等），就直接写开发机真实 `~/.dsh`。
2. **侧栏契约门禁缺 CI**：`scripts/verify-stage-contracts.mjs`（真实装配 8 个 Stage + market 全生命周期，经 JSDOM + 真 dsh-ui-kit 缝位）只在本地 `test:gates` 链路跑，quality-gate.yml 无此步骤。此前记录的阻塞原因（CI 无法解析 `file:` 依赖的 dsh-ui-kit）已过时——CI 现为全仓 `pnpm install --frozen-lockfile`，且 `packages/dsh-ui-kit/lib/index.js` 是已跟踪产物。

## 方案（不改业务代码）

- `scripts/run-workspace-tests.mjs`：`packageEnv` 为每个包的测试进程注入 `DSH_HOME=<每包独立 mkdtemp>`；`runPackage` 结束后清理该目录。
- `plugins/omnimux/scripts/run-tests.mjs`：spawn 子进程 env 同样注入隔离 `DSH_HOME`（覆盖 `pnpm --filter omnimux test` 直跑场景），跑完清理。
- `.github/workflows/quality-gate.yml`：在「Repo gate scripts」步骤旁新增 `node scripts/verify-stage-contracts.mjs`。

## 验收标准

- [ ] 探针验证：`DSH_HOME=$PROBE` 运行 `node scripts/run-workspace-tests.mjs omnimux` 结束后，`$PROBE` 内无 `omnimux/media-tasks/`、无 `profile.json`、无 `secrets.json` 等真实落盘残留；且测试进程看到的是注入的隔离目录而非探针目录。
- [ ] `node scripts/verify-stage-contracts.mjs` 在本工作树 8/8 绿（含 market 走 concat-client 真打包路径）。
- [ ] `node --test scripts/verify-governance-registry.test.mjs` 绿（无非登记脚本）。
- [ ] CI quality-gate 新增步骤绿（PR 合并队列判定）。
- [ ] 不改 `hubHomeDir()`、`task-store.js` 等业务源码；不删各测试文件已有的显式 `DSH_HOME` 自建（进程内赋值优先）。

## 非目标

- 不给 market 造 dsh-ui-kit stub（会破坏 `client-bundle.test.ts` 的 kit 内联断言；依赖链在 CI 已可解析）。
- 不改 `verify-slot-contracts`、stage-scroll/inset 等其他门禁的 CI 归属。
