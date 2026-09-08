# #778 CI shared backup 可用性调查

日期：2026-09-08（Asia/Shanghai）。状态：只读调查完成；#778 的 CI shared 工具供应链尚未闭合，不能宣称 CI 可行或通过。

## 结论

1. **本地候选 CI 配置会调用 managed 测试，但已运行的远端 CI 没有这个入口。** 指定树的 dirty `quality-gate.yml` 调用 `test:managed-tarball`；该脚本显式列出 transaction 测试。只有前置步骤成功、该候选工作流实际进入 Actions 执行面后，才会尝试运行。配置存在不等于已经执行或通过。
2. **当前候选工作流没有安装、下载、挂载或校验真实 shared backup 的步骤。** Python/pnpm 安装和 npm QA 依赖均不能提供用户机器上的 `/Users/x/.agents/skills/agent-backup/scripts/backup.py`。更换 HOME 也不会带来该文件。
3. **在本次允许核查的真源中，没有找到现成可复现的远端 pin 发布或支持的 CI 安装来源。** 已知支持方式是调用预先存在的本机物理脚本；资产库是发现软链，不是分发服务。不能据此编造 Git 仓库、pip/npm 包名或下载 URL。
4. **最小下一步是补齐真实工具的分发来源和授权，而不是重做架构。** 在此之前保留 CI 阻塞结论；不以跳过真实测试、另一实现或 stub 回执替代。

## 证据范围与版本

- 指定树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- 本地 HEAD：`580234923268673562cacb5cd01aebdb780339e1`；调查开始时已有 dirty 和未跟踪文件。
- 本次只读取允许的 CI/package 入口、shared 包元数据、资产库来源/同步入口及 GitHub 只读历史。未读取或评审 148 正在修改的 managed-tarball/archive/graph/cache 实现和测试内容；未以其变化中内容作最终证据。
- 本地候选入口指纹：
  - `.github/workflows/quality-gate.yml` SHA256：`3f0c85e7f4256ca7ec0da87a3117d264ec8500281728230d9b7ddcfe15d7e8a6`。
  - `package.json` SHA256：`4bc2385d8ba9e184bc7a33c3deba2eddb77b6e7ed461f87e09c2405620f8c58d`。
- 本地 HEAD 版本的上述两文件均无 `managed-tarball` / `agent-backup` 字样。因此本地候选入口不能归为 HEAD 已提交事实。
- 远端固定取证 SHA：`74a2fd377aaacadf1f08cfce863787aa35d8a560`，来自本次 API 查询到的最新已完成 Quality Gate push run；不声称该 SHA 永远是 main 最新值。

## 当前 CI 是否会执行 managed 交易测试

### 本地 dirty 候选配置：会尝试调用，未验收执行

[`quality-gate.yml`](../../.github/workflows/quality-gate.yml)：

- 3–9 行：PR 到 main、push main、merge_group 触发。
- 18 行：`ubuntu-latest`，不是用户本机 runner。
- 48–63 行：仅临时安装 acorn/esbuild/pngjs/yaml/jsdom/react/react-dom，再链接 node_modules；没有完整 monorepo 安装，也没有 shared backup 依赖。
- 92–101 行：Python `3.14`、pnpm `11.7.0`。
- 103–121 行：`Test managed tarball transactions` 无独立跳过条件，隔离 HOME/TMPDIR/Corepack/npm 路径，最后执行 `corepack pnpm --config.verify-deps-before-run=false test:managed-tarball`。

[`package.json`](../../package.json) 第 48 行显式展开为：

```text
node --test scripts/managed-tarball.test.mjs scripts/managed-tarball-transaction.test.mjs scripts/managed-tarball-l2.test.mjs
```

该入口没有显式列出 `managed-tarball-recovery.test.mjs`、`managed-tarball-t02.qa.test.mjs`、`materialize-cache.test.mjs` 或 shared Python QA。是否由其他测试间接加载、最终矩阵是否调整，属于 148 的变化中内容，本次不推断。此前置步骤失败时，后续默认 success 条件也会阻止执行，不能保证每次触发都到达交易测试。

### 已运行的远端配置：没有 managed 测试入口

- [Quality Gate run 34232332644](https://github.com/omnimux-ai/omnimux-dsh/actions/runs/34232332644)，event `push`，head `74a2fd377aaacadf1f08cfce863787aa35d8a560`，conclusion `success`。
- 只读 jobs API 返回步骤包括 QA dependencies、syntax/contracts、diff-aware L0、regression、model contracts、host bundle、upload、verdict；**无** managed transactions、setup Python、setup pnpm 或 shared 安装步骤。
- [该 SHA 的工作流](https://github.com/omnimux-ai/omnimux-dsh/blob/74a2fd377aaacadf1f08cfce863787aa35d8a560/.github/workflows/quality-gate.yml) SHA256 为 `36eda666d33c5c961cb473b77afd08ceb7c62113f75edb7f76c4244feddb255b`，与本地 HEAD 工作流相同。远端工作流和 package 均无 managed/shared 引用。
- GitHub API 返回默认分支可见的 13 个该工作流修改提交（2026-08-28 至 2026-09-07）；逐一读取其工作流内容，均无 `agent-backup`、`backup.py`、`sharedbackup` 或 `managed-tarball` 字样。此为已核查历史范围，不是对全部分支、全部外部系统的穷尽否定。

## Runner 如何获得确切 shared 工具

**当前没有已配置的获得方式。** 工作流只有本仓 checkout 与 Python/Node/pnpm/npm 依赖准备；`.github/` 全部文件搜索无 `agent-backup`、`backup.py`、shared backup 引用，package 依赖也没有该工具。没有工具来源、固定版本/资产标识、校验和消费路径之间的闭合关系。

本地候选步骤把 HOME 改为 `$RUNNER_TEMP/managed-tarball-home`。这只隔离环境，不会安装 `$HOME/.agents/skills/agent-backup`，也不会使 macOS 的 `/Users/x/...` 路径出现在 Ubuntu runner 上。本次未检查变化中实现的具体路径解析规则，因此不宣称某个尚未核实的变量或参数已经能解决路径注入。

即使 Python 满足 shared 文档所述 POSIX、Python 3.10+ 标准库要求，也只解决解释器条件，不解决脚本来源或交易测试可用性。

## 物理真源与既有安装/发布证据

| 证据 | 核查结果 | 能证明 / 不能证明 |
| --- | --- | --- |
| `/Users/x/.agents/skills/agent-backup` | 实际目录，不是 symlink；该目录及各级父目录均无 `.git` | 本机物理包存在；无可据此引用的 Git commit/remote |
| `scripts/backup.py` 元数据 | mode `0644`；SHA256 `e744e95c03e3b60471621341e9a9610c674944bc04c83a4b4a978274f25605d7`，与用户提供值一致 | 确定本机脚本字节身份；hash 不是分发地址 |
| 包文件清单 | `SKILL.md`、`scripts/backup.py`、两份 Python tests，另有 `.agent-backups/` 恢复材料 | 未见 package.json、pyproject、安装器或发布清单；恢复材料不是发布资产，本次未读取其 payload |
| `SKILL.md` 8、19、21–25 行 | 声明用户级物理真源、禁止项目复制，调用绝对路径脚本 | 支持本地预装使用；没有远端获取命令、版本 pin 或发布 URL |
| `/Users/x/Desktop/Project/OPC/资产库/index.json` 46078–46089 行 | `id=user-agent-backup`；`sourceRepo=null`；path/linkTarget 指向物理包 | 索引只有本地来源，未提供远端仓库或版本 |
| `/Users/x/Desktop/Project/OPC/资产库/skills/user-agent-backup` | symlink，resolve 到该物理包 | 资产库不包含第二份实现，也不会自动供应云 runner |
| `/Users/x/Desktop/Project/OPC/资产库/scripts/sync-skills.py` 2、62–65 行 | 将本地物理包列入 EXTRA_PACKAGES，脚本职责为扫描并建软链 | 这是本地发现/挂载入口，不是该工具的安装发布源 |
| 资产库 `Github/catalog.json` | `agent-backup` 无命中 | 索引中未找到对应仓库；不等于互联网绝不存在同名工具 |
| `omnimux-ai/omnimux-dsh` releases API | 本次查询返回 0 个 release | 此仓未提供现成 release 资产；不能推断其他未知仓也没有 |

未搜索/采用任何同名第三方实现。未知外部源的存在、发布权限、许可与再分发许可，仍然未知。

## 最小下一步与准确授权边界

**下一步 owner：主理人协调 shared 工具所有者。** 先取得一条明确答复：是否已有可供 Actions 读取、能定位到上述真实脚本版本的受支持来源。要求给出真实位置、不可变版本/资产标识、校验信息和允许的消费方式；不要让 Agent 猜仓库 URL。

若仍无现成来源，当前授权内的可执行结果就是登记这项依赖阻塞，并继续其他不依赖它的工作。要真正解除阻塞，需要新的、范围明确的授权：

1. **shared 分发动作**：仅为真实 shared 工具提供一个经所有者确认的受控 CI 分发资产/来源；明确目标位置、可见性、具体文件和版本。不默认新建独立仓库，不另造实现，不把整个用户目录或恢复数据打包，不把源码复制进产品仓。发布或迁移真源、改共享包/资产库、创建远端资源均不属于此前两文件最小修复授权。
2. **CI 消费动作**：来源真实存在后，再授权最小 CI 获取、校验、调用路径接线，以及隔离 runner 验证。需要下载、写 runner/global 路径或修改 workflow 时须明确覆盖对应动作；目前不得先改 CI 填入臆测地址。实际路径接线应等 148 冻结实现后核对，不并发评审其变化内容。
3. **验收边界**：必须观察新配置在干净 Linux runner 取得确切工具并运行真实交易测试；隔离测试须使用其受支持的私有 state/registry 边界，不能碰本机生产全局 index/expiry。此处只列后续验收条件，本次未运行。

这些动作有脚本再分发/可见性、执行任意下载内容和 shared 真源分叉风险；以固定真实资产、校验后调用、最小文件集控制。若不授权分发与 CI 接线，则保持 #778 CI 阻塞；已有本机真实 QA 可以保留，但不能替代云 CI 证据。不得为绿灯删测试、自动 skip、伪造回执、复制另一实现或改用本机 runner 绕过缺口。

## #786 / PR #792 与本次结论的关系

用户提供的正式合入事实已由 [PR #792 API](https://github.com/omnimux-ai/omnimux-dsh/pull/792) 核实：`merged=true`，merge commit `9b0ab28906e72b69ac1c5dcd47c3ddaee59d0865`，`merged_at=2026-09-08T12:59:16Z`。此事实只证明该 PR 合入，不证明未进入远端入口的 #778 managed 测试，也不证明 shared 工具已能被 Actions 安装。

## 本轮操作与验收限制

- 唯一项目文件写入为本调查文档；未改源码、CI、package、测试、shared/global 路径，未执行 capture 或其他 backup 命令。
- 未调用子代理、未运行交易测试、未 commit/push/fetch、未触碰 Host/Dev、未下载或发布工具资产；GitHub 操作仅 GET 查询。
- 未重试已熔断的旧架构评审。此报告不构成 managed 实现/交易矩阵的独立 QA 签收。
- 文档检查限于本文件空白检查、相对链接存在性与所列证据指纹；无需也未执行全仓测试。
