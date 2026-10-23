# Spec: 任务私有测试环境装配修复（Issue #3655）

- Issue: #3655
- 风险级别: R1（`scripts/` 变更，门禁/测试基础设施）
- 背景: UI 任务在隔离 worktree 内跑任务私有测试环境（`scripts/test-env-bootstrap.mjs` 的 task-source 装配）连续失败，拿不到真机验收证据，被「先有实机证据才能提交」的硬门禁卡死；#3646（3D 导演台）现场已确认。

## 1. 目标与用户结果

普通 UI 任务按仓库标准流程建 worktree、跑标准依赖安装后，调用
`startTestEnvironment({ root, mode: 'ui', evidenceContext, candidate, taskPlugins })`
能完成 task-source 装配并启动运行图（`evidenceLevel=task-source-installed`），失败时给出可操作的原因而不是空错误码。

## 2. 根因（实测确认）

1. **归档检查在 Python 3.15 上必挂**：`scripts/managed-tarball-archive.py` 的 `_scan` 用
   `gzip.GzipFile(fileobj=self.frozen)`；`TemporaryFile()` 是读写模式，Python 3.14+ 由 fileobj 推断为写模式，
   `read()` 抛 `[Errno 9] read() on write-only GzipFile object`，退出码 3。
   `test-env-bootstrap.mjs` 把这个失败压成 `PREPARE_ARCHIVE_INSPECTION_FAILED`，现场无法定位。
   旁证：`scripts/director-acceptance-3289.mjs` 已带「绕开 Python 3.15」的 PATH 兼容代码，说明这是已知的本机解释器不兼容。
2. **候选输入复制把「已构建产物」当成非法输入**：worktree 按标准流程 `pnpm install` 时，包的 `prepare`
   脚本会生成 `lib/`、`dist/`；这些路径被候选策略排除，不在 `candidate.entries` 里，而 `copyTree` 对任何
   不在候选集合里的文件直接抛 `PREPARE_INPUT_UNSUPPORTED`。于是「装过依赖的 worktree」必挂，错误信息不含路径。
3. **缺依赖时报错不可操作**：worktree 未装依赖时，逐包构建才失败并压成 `PREPARE_BUILD_FAILED`；使用者无法知道
   该在工作树里跑 `pnpm install --frozen-lockfile`。

## 3. 改动

- `scripts/managed-tarball-archive.py`：`GzipFile(..., mode='rb')` 显式只读，跨 3.12–3.15 一致。
- `scripts/test-env-bootstrap.mjs`：
  - 以「捕获的候选条目」为唯一输入集：候选目录前缀之外的目录、候选集合之外的文件（构建产物/被策略排除的文件）
    一律跳过并记入 `observations.skippedInputs`；仅候选自带的符号链接或特殊文件仍拒绝，且错误带相对路径。
  - 新增纯函数导出 `candidateDirectoryIndex` / `classifyCandidateEntry` / `missingPackageDependencies`，供回归测试。
  - 归档子进程失败时把 `status`、`signal`、`stderr` 尾部写进错误 `hint`（截断），输出非 JSON 也给出原因。
  - 构建前检查打包目标包的依赖是否已安装；缺失时抛 `PREPARE_DEPENDENCY_REQUIRED` 并点明要执行的安装命令。
- `scripts/test-env-bootstrap.test.mjs`：新增条目分类与缺失依赖判定的回归用例。
- 既有 `scripts/managed-tarball.test.mjs` 的 inspect/extract 用例本身就是 Python 3.15 归档缺陷的回归（修复前在本机必红），不重复新增。

## 4. 假设

- 候选捕获（`captureCandidate`）给出的 entries 就是本任务允许进入 stage 的完整源码集合；工作树里其余文件都是可重建产物或被策略排除的本地状态，跳过它们不削弱装配的完整性校验（后面的 pack 清单与字节比对仍在）。
- `gzip.GzipFile(mode='rb')` 在所有受支持解释器（3.12–3.15）上行为一致，且不改变归档校验语义。
- 任务工作树的依赖安装是既有前置条件而非本脚本职责，因此「缺依赖」只做早期、可操作的拒绝，不自动安装。

## 5. 证伪方式

- 若「跳过非候选文件」放过了本应拦截的候选漂移：`captureCandidate` 的 candidate-after 比对、pack 清单与归档字节核对会失败；在干净 worktree 内跑 `node --test scripts/test-env-bootstrap.test.mjs` 与端到端 diag 可观测。
- 若 Python 模式修复无效：`node --test scripts/managed-tarball.test.mjs` 在 Python 3.15 下重新出现 `read() on write-only GzipFile` 失败。
- 若端到端装配仍不可用：`diag`（同 #3646 现场脚本）应返回 `RESULT=OK` 且 `summary.evidenceLevel === 'task-source-installed'`；否则按新错误 `hint` 定位。

## 6. 验收

1. 干净任务 worktree（`worktree.sh new` + `pnpm install --frozen-lockfile`）内，`startTestEnvironment({ mode: 'ui', candidate, taskPlugins: ['omnimux-workflow'] })` 返回 `RESULT=OK`、`evidenceLevel=task-source-installed`，`cleanup()` 正常。
2. Python 3.15 下 `node --test scripts/managed-tarball.test.mjs` 通过。
3. `node --test scripts/test-env-bootstrap.test.mjs scripts/test-env-bootstrap-fresh.test.mjs scripts/test-env-root-diagnosis.test.mjs` 通过。
4. 变更只落在 `scripts/`：不含 UI 业务代码、不放宽真机证据门禁、不改 acceptance runner 的既有语义。

## 7. 非目标

- 不改 UI 业务代码，不处理 #3646 的 UI 收敛本身。
- 不重构 `task-runtime-install.mjs` 的安装/校验语义，不改 `director-acceptance-3289.mjs` 的既有 PATH 兼容逻辑（修复落地后它仍可工作）。
- 不为通过而放宽真机证据门禁，不改任何冻结断言。

## 8. 新用户基线

本变更只影响仓库内的测试装配脚本，不出现在新产品安装路径上；不存在依赖 Dev 机器状态的默认行为。脚本自身在缺依赖或解释器不兼容时会显式失败并给出修复命令，不会静默回退到 Dev profile 或伪造通过。

## 9. 文档影响

`docs/contracts/plugin-qa.md §工作树测试配置准备` 描述的行为不变（准备器职责、证据边界、模式语义均未改），本次只修复实现缺陷与错误可读性，因此不改合同文档；若后续要移除 `director-acceptance-3289.mjs` 的 PATH 兼容代码，另行开任务。
