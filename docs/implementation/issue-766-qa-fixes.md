# #766 第一轮 QA 缺陷返修报告 (F01–F04)

## 任务背景与执行状态

- **写树与分支**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`，base/HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。
- **工程师**：寇豆码
- **执行规则**：严格保留全部未提交增量；不 commit、不 push、不部署，不操作真实 OPC 与共享 profile；严禁删除或放宽 QA 测试断言。
- **写面限定**：`plugins/omnimux-assets/**` 及 `docs/implementation/issue-766-qa-fixes.md`。

---

## 缺陷返修与根因修复明细 (F01–F04)

### 1. 【F01 / High】新建目录安装后属性变更未在提交前拒绝（修复 QA-DIR02 3 项失败）
- **现象与根因**：
  在原代码中，新建目录在 `ensureDirectory` 安装后未持久化最终终结后的 identity 与属性（`finalizeDirectories` 调完 `directory_metadata` 后未写盘更新）；`verifyInstalled` 开头直接 `if (!receipt?.sha256) return` 跳过目录；`verifyDirectories` 仅遍历了预检时已存在的 `this.plan.targetDirectories`，遗漏了本次任务新建的目录；导致在 `verifying`、`commit_intent` 以及 `before_root` 三个边界若新建目录的 mode 被外部篡改（例如从 0750 改为 0711），系统未察觉依然发布提交成功（epoch 变 1）。
- **具体修复改动**：
  1. `src/storage-migration.js`:
     - 在 `ensureDirectory` 中持久化新建目录的 `createdIdentity`（prepared 阶段）及 `installedIdentity`（installed 阶段）；
     - 在 `finalizeDirectories` 中，执行 `directory_metadata` 终结属性后，立即通过 `stat` 和 `metadata` 获取目标目录的最终身份属性，标记 `phase: 'finalized'` 并持久化 `finalizedIdentity` 与 `finalizedMetadata`；若对应顶级条目 entry 存在，同步更新 entry receipt 的 `afterIdentity` 与 metadata；
     - 在 `verifyDirectories` 中，不仅校验 `this.plan.targetDirectories`，同时扫描并复核本任务所新建的所有非 reused 目录（核验 `dev, ino, mode, mtimeNs` 与 extended metadata）；
     - 在 `verifyInstalled` 中支持目录校验：当 `!receipt.sha256` 且条目属于目录时，核验真实目标目录的 `dev, ino, mode, mtimeNs` 及 provenance/extended metadata；
     - 确保在 `verifying`、`commit_intent` 以及 `before_root` 三个关键阶段，若新建目录的 mode/mtime 发生外部变更，均直接抛出 `AssetsError('plan-stale', ...)` 拒绝提交，进入可恢复失败（`failed_recoverable`），保持 epoch 为 0，绝不二次 chmod 覆盖外部修改。
- **验证结果**：
  `QA-DIR02` 在 `verifying`、`commit_intent`、`before_root` 三项测试全部通过。

### 2. 【F02 / High】删除资产会误删仍被裸ID input_refs 引用的文件（修复 QA-GC01 1 项失败）
- **现象与根因**：
  在 `src/library.js` 的 `recycleManagedFiles` 中，只收集了活跃 assets、`artifacts.json` 的 `content_ref` 和 `mappings.json` 的 `relative_path`，未解析 `artifacts.json` 中的 `artifact.input_refs`。当删除资产时，若某个 artifact 仍通过裸 ID（如 `'asset0'`）引用该资产，该资产的文件未被列入保留列表，从而被错误回收 unlink。
- **具体修复改动**：
  1. `src/library.js`:
     - 在 `recycleManagedFiles(removed)` 读取 `artifacts.json` 时，深度遍历每个 artifact 的 `input_refs`；
     - 对 typed URI（`asset://...`）解析出相对路径并加入 `references` 保护集；
     - 对裸 ID，若匹配当前被删除资产 `removed.id` 或其包含的子文件 ID，将 `removed.files` 中的全部对应 `relative_path` 提取并加入 `references` 保护集；若匹配 mappings 则提取 mapping 相对路径；
     - 在 GC 计算候选回收项时，被引用的媒体文件命中 `references`，被安全移入 `retained`，阻止被 unlink。
  2. `src/storage-migration.js`:
     - 在 `buildLedgers()` 建立 target 库的 `file_inventory` 时，同步解析 `artifact.input_refs` 中的裸 ID，若引用了 library 资产，将其文件的 `owners` 列表中追加 `artifact.id`，形成账本层面的双向保护。
- **验证结果**：
  `QA-GC01` 在 typed URI 和裸 ID（`asset0`）两个对照项下 100% 全部通过，原引用的 `a.png` 完整保留。

### 3. 【F03 / Medium】空ID容器按路径误删外部替换的inode（修复 QA-GC02 1 项失败）
- **现象与根因**：
  在 `src/library.js:505–511` 中，对容器目录 `data/files/${removed.id}` 的删除调用了 `storageSync('rmdir', { root: vaultRoot, rel, expected: {} })`；而 `src/storage-fs.py:575–580` 对空的 `expected` 未校验 inode，导致当外部把真实容器目录 rename 并新建了一个外部空目录时，该外部替换的空目录按路径被误删。
- **具体修复改动**：
  1. `src/storage-fs.py`:
     - 在 `rmdir` 操作中强化所有权校验：要求必须提供包含 `ino` 和 `dev` 的 `expected` 凭据；若无凭据直接抛出 `StorageError('plan-stale', 'rmdir requires verified container identity credentials')`；
     - 严格比对真实容器目录的 inode 与 dev：`if str(info.st_ino) != str(expected['ino']) or str(info.st_dev) != str(expected['dev']): raise StorageError('plan-stale', 'container directory inode changed')`，若 inode 改变则拒绝删除。
  2. `src/library.js`:
     - 在 `materializeIncomingFiles` 与 `materializeFileSync` 中，在成功向 `data/files/${assetId}` 写入文件后，查询并记录该容器目录的真实 inode 与 dev 凭据到 `state.file_inventory`（`kind: 'directory'`）；
     - 在 `recycleManagedFiles` 中，仅在持有已确认创建凭据（`containerExpected?.ino && containerExpected?.dev`）时才执行 `rmdir`，并传入 `{ ino, dev }` 凭据；无凭据时不执行 rmdir；当外部替换新 inode 时被 Python 端安全拒绝，保留外部空目录。
- **验证结果**：
  `QA-GC02` 测试通过，外部新建的空目录 inode 被完整保留未被删除。同时原有的 `remove recycles the managed copy and never unlinks the original` 正常删除自建容器目录同样 100% 通过。

### 4. 【F04 / Medium】失败任务的UI错误计数恒为0（修复 QA-UI02 1 项失败）
- **现象与根因**：
  在 `src/storage-migration.js` 中，`progress.errorCount` 仅在 `preflight` 初始化时设置为 0，全生命周期未在发生可恢复错误时累加。导致在发生实际失败（如 copying 错误）时，虽然任务状态转为 `failed_recoverable` 且携带了错误 message，但 `progress.errorCount` 恒为 0，UI 与 Controller 呈现错误数为 0。
- **具体修复改动**：
  - 在 `src/storage-migration.js` 的 `launch` 方法中，在 catch 块捕获到错误并将阶段流转至 `failed_recoverable` 或 `recovery_required` 时，准确累加错误数：`this.task.progress.errorCount = (this.task.progress.errorCount || 0) + 1`；在其它将状态变更为 `failed_recoverable` 的位置同步递增；
  - 随后调用 `await this.phase(nextPhase)` 自动持久化保存，确保客户端与 Controller 在刷新读取任务状态时，能够读取并渲染非零的错误计数。
- **验证结果**：
  `QA-UI02` 测试通过，`c.snapshot().task.progress.errorCount >= 1` 断言成功。

---

## 编译、构建与全包验证结果

### 1. Client Bundle 重新编译
- 命令：`node scripts/build-client.mjs`
- 结果：成功输出 `plugins/omnimux-assets/lib/client.js`（257157 bytes，文件大小 257173B），无构建错误。

### 2. 私有包重新打包与一致性验证
- 命令：
  ```bash
  npm pack --ignore-scripts --json > .final-pack.json
  node scripts/verify-private-package.mjs
  ```
- 结果：
  ```json
  {
    "size": 48580935,
    "unpackedSize": 132868862,
    "entryCount": 3372,
    "sha256": "572a0da5b70dd1e1a7d5b389b26eebbb8fb1134e6c0fe62af17275cc3f492acf",
    "bothCpuPayloads": "all ordinary non-cache files match",
    "extractedNoPathProbe": {
      "supported": true,
      "python": "3.13.15",
      "chunkBytes": 1048576
    }
  }
  ```
- 最新 tgz 包哈希与元数据：
  - 文件名：`omnimux-assets-0.2.0.tgz`
  - 压缩包大小：`48,580,935 Bytes`
  - 解包总字节：`132,868,862 Bytes`
  - 文件条目数：`3372`（严格排除 caches、pyc、tests、evidence 及临时文件）
  - SHA256：`572a0da5b70dd1e1a7d5b389b26eebbb8fb1134e6c0fe62af17275cc3f492acf`
  - 双 CPU 载荷全部匹配，解包后在无 PATH 隔离环境下探针执行正常。

### 3. 全包单元测试验证（无 PATH Python 隔离环境）
- 执行命令：
  ```bash
  PATH=/nonexistent-assets-python:$(dirname $(which node)) node --test src/*.test.js src/client/*.test.js
  ```
- 运行统计结果：
  ```
  ℹ tests 352
  ℹ suites 64
  ℹ pass 352
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 14382.69
  ```
- 结果判定：**原有 333 项测试 + QA 新增全部 19 项测试（总计 352 项）全部 100% 通过（0 failed, 0 skipped, 0 cancelled, 0 todo）**。

### 4. 平台与门禁检查结果
- `git diff --check`：通过（0 警告，0 空白违规）
- `node scripts/verify-stage-contracts.mjs`：10 Stage / 8 注册侧栏通过
- `node scripts/verify-plugin-boundaries.mjs`：2154 source 文件边界通过
- `node scripts/verify-package-files.mjs`：12 个插件文件规则全部合规通过
- `node scripts/verify-plugin-agent-tools.mjs`：98 工具 0 错误 0 警告通过
- `node scripts/verify-slot-contracts.mjs`：1644 client files 0 违规通过
- 六文件安全 gates 门禁：71/71 项测试 100% 全部通过

---

## 边界说明与后续交接

1. **已修复边界**：
   - F01：覆盖新建目录（含中间创建的非顶级空父目录及顶级空目录条目）在 verifying、commit_intent、before_root 三个中断窗口的外部篡改检测与安全拒绝机制；
   - F02：打通从全局产物 `artifacts.json` 的 `input_refs`（无论是 typed URI 还是裸 ID）到底层库 GC `recycleManagedFiles` 的全链路保留计算；
   - F03：建立真实容器目录 inode 所有权核验机制，无凭据或 inode 被外部替换时不误删外部空目录；
   - F04：恢复可恢复失败态下的实际 `errorCount` 进度累加，修复客户端 UI 显示 0 错误缺陷。
2. **真实环境保留边界**：
   - 依赖 #778 解除事实的真实 L2 / ego-browser 及真实 macOS 原生 picker 仍待上游环境就绪后验证，本工程返修未用替身冒充浏览器证据；
   - 保持所有修改局限于当前任务工作树，未提交、未 push、未部署。
3. **交付状态**：
   - **IS_PASS: YES**（代码工程返修与无 PATH 全包测试完全通过，具备移交第二轮整体 QA 验收条件）。
   - 交回主理人以推进第二轮整体 QA 验收。
