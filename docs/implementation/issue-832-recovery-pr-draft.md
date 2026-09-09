# #832 离线恢复 runbook / 本地 PR 草稿

## 当前交付快照（2026-09-09 12:25，覆盖下方历史计划的当前状态）

**BLOCKED / 不可合并；仅准备 Draft PR，不 merge、不部署。** 下方原始恢复计划与第6节旧草稿完整保留，记录当时的654测试、48推荐与远端限制，不是当前事实；发布 PR 使用本节最新口径。

- 已读取[最终第二轮分页独立 QA](issue-832-pagination-round2-qa.md)及其新增4项测试。固定源码 HEAD `1e86ec64e81332fa4aaaa022745dd2b6db724975`，独立实绩 **687 tests / 687 pass / 0 fail / 0 cancelled / 0 skipped，8 suites**；无新源码 bug，QH1原反例通过。工程683、历史654不重写、不叠加；本轮不重复测试。
- 用户已接受「采用真实近似 Skill，缺失暂不展示」，以[最终准入名单](issue-832-home-recommendations-approved-list.md)为准，不要求凑16/9项。实际 **homepage=1 / global featured=49**；首页唯一 `sk-bggg-data-amazon`（BGGG Amazon Data / Amazon评论采集，不冒称完整评论优化）。旧48精选身份/资格保持；首页增量仅1张真正新封面 `catalog/covers/home/bggg-data-amazon.png`。
- 资源比较边界：round2对 `1e4510308a2d2bfd0c079bf25659efad10b62f9c` 验证旧310个catalog对象及48张封面不变；当前总311对象/193 Skills。整条任务分支相对远端共同祖先还包含早期3张封面替换，不能将“首页增量旧48保持”误称为“整个PR未改旧封面”。
- 最新远端 base 已 fetch：`origin/main=e3f71ae6097c49ed507130d7ece566f73ad78386`；共同祖先 `867b192ecf6aa35be4e1639db7351a89bea782c7`；输入HEAD相对远端 ahead8/behind5，提交QA后ahead9/behind5。任务差异原55文件，加两份QA后57文件；远端新增路径与任务路径无交集。不自动 merge/rebase，不修改主树。
- 已只读核对最新远端 Git/PR 合同（updated 2026-09-09）及 plugin-qa：合同原文「测试、L2 或浏览器验收失败阻止合并和交付声明；Agent 在既有范围和风险内继续诊断、修复、复验。」任务授权覆盖push/PR，合同未禁止未验Draft；用户本轮明确允许在此条件下push及Draft，明确禁止merge/部署。不自打qa:pass，不绕required checks。
- 本轮仅提交 `issue-832-pagination-round2-qa.md` 与 `home-pagination-round2.qa.test.js` 两份QA产物；本文追加更新留在本地不纳入该commit。业务源码、历史QA原文不改。
- **运行仍BLOCKED，依赖 #839** 正式受管兼容viewer制品/receipt及实际任务消费证据；未重复viewer哈希、Host启动或采用未纳管包。L2 / ego-browser / verify:live、宽屏/分屏/375px、中英/深浅、草稿附件保护、Tab及真实图片路由未签字。旧tgz不代表分页修复。
- 恢复时第5节“全48推荐”应执行当前双集合验收：首页1、全局49（旧48保留）、1张首页新封面，另验证早期3张修订封面；分页须验证实际第二页、跨页去重及搜索/分类。其余状态保护矩阵保留。新运行必须绑定实际最终HEAD，不改旧报告SHA。
- PR标题：`[BLOCKED] fix(market): Skill workshop, home recommendations and pagination (#832)`；正文关联 `Closes #832` 与 `Blocked by #839`，明确Draft/不可合并、R1、离线PASS不等于整体PASS。实际commit、PR URL及CI初始状态在发布后追加；不等待CI结束。

### 实际远端回执（2026-09-09 12:27 Asia/Shanghai）

- QA commit：`c70436bbfcc57e6476598604ffa9c7946b33370b`，仅2文件/156行新增；普通push成功，远端任务分支与本地HEAD一致。
- Draft PR：[#855](https://github.com/omnimux-ai/omnimux-dsh/pull/855)，`state=OPEN`、`isDraft=true`、`mergeStateStatus=BEHIND`；base `e3f71ae6097c49ed507130d7ece566f73ad78386`，head同上。关联Closes #832与Blocked by #839，无merge/部署。
- 实际CI初始状态：[Quality Gate & Auto QA run 34311019804](https://github.com/omnimux-ai/omnimux-dsh/actions/runs/34311019804)，`Static L0 QA & Tests=IN_PROGRESS`，startedAt `2026-09-09T04:27:11Z`，conclusion为空；不是PASS。本轮只取初始状态、不忙等或建立CI轮询。
- 工作树唯一未提交文件为本文；历史原文保留、最新草稿在PR正文。未启动任何后台job。

## 历史状态与固定范围（原文保留）

2026-09-09：**仅文档交付；运行未验、远端未提交，整体仍 BLOCKED，不具备 qa:pass / 合入 / 归档条件。** 本轮不启动环境、不重复 viewer 哈希核验、不重跑 654 测试、不改业务代码，不 push / 创建 PR / merge / 物化。

- 任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`；分支 `agent/market-skill-header-issue-832`。
- 固定审查 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；本轮输入 HEAD：`8ea7c3d2f0391e772f0b0174e0450e4febd8556b`。
- 源码提交：`95e127e7a64191265d70fb2e2cbfeb1733461023`；独立 QA 审查 head：`37211b40f0978a9deb101b7143c5e21974b41079`。源码提交至输入 HEAD 的差异仅三份报告，故保留既有离线结果，不冒充新 HEAD 的运行证明。
- 本地 `origin/main` 缓存为 `d2e1fb0b33dd68a1254c810a40399f66728d8263`，分支 ahead 4 / behind 1；本轮未 fetch，不声称审查了最新远端 base。将来获得远端交付授权后再刷新 base、核对差异及适用证据。
- 依据：[工程报告](issue-832-engineering.md)、[最终独立 QA](issue-832-qa.md)、[依赖交接](issue-832-dependency-status.md)、[plugin-qa](../contracts/plugin-qa.md)、[dev-pipeline](../contracts/dev-pipeline.md)、[Git/PR 合同](../contracts/plugin-git-pr.md)。历史首轮授权阻断已被后续任务私有初始化授权取代；运行兼容阻断未解除。

## 1. 恢复触发与授权

仅在依赖 owner **正式交付兼容受管 seed** 后，由 #832 运行 QA 执行以下步骤。交付回执须能关联同 pin 兼容 QA、包版本/归档身份、seed/source/installed/lock/receipt 与真实 Host 兼容证据；Issue 关闭、候选包说明或旧 COMMITTED receipt 均不替代这些事实。没有新交付就保持停止，不再空跑 start、restart-host 或旧哈希检查。

新 L2 名 `skill-header-832-refresh` 是**同一 #832 的新私有初始化，属于本次既有开发凭据/settings 整文件继承授权**；不是新业务任务，也不要求对同一范围重复授权。目标仅 `~/.dsh-dev/tasks/skill-header-832-refresh`，只读消费已正式交付的 Dev seed，只 link 原 SOURCE 的 `omnimux-market`。不扩写外仓、官方底座、共享 seed / Dev / Prod，不接管兼容包升级，不输出秘密，不发模型/付费请求。

旧 `~/.dsh-dev/tasks/skill-header-832` 保留全部数据、凭据与日志；新环境不是旧 profile 的保数据刷新。不执行 `rm`、手删 node_modules、复制旧会话或手工搬包。`dev-env.sh:684–693` 已有 node_modules 跳过克隆；重复 start/restart-host 不能升级旧依赖。若必须迁移旧业务状态，另走正式受管方案及对应授权，不隐式增加迁移。

## 2. 正式启动一次（条件满足后执行，本轮未执行）

执行目录必须是上述任务树。先确认 Git 无无关 dirty、依赖回执满足第 1 节，且新任务根和同名 legacy profile **均不存在且不是 symlink**；存在则停止，不能借 start 的停止/迁移分支覆盖已有任务。确认 `DSH_SRC` 仍为交付证据覆盖的正式底座，不临时切 pin/clone。

以下为终端步骤，不另存或创建替代脚本。显式锁定 Dev seed 防止正式脚本 fallback 到 Prod；确认 `/Users/x/.dsh-dev/.credentials.yaml` 与 `/Users/x/.dsh-dev/settings.yaml` 是既有获准来源且存在，仅检查存在性，不读内容（settings 的 fallback 不受 ALLOW_SEED_FROM_PROD 控制）。

```sh
# 在任务树的独立终端执行；任何检查失败即停止。
set -euo pipefail
pwd
git status --short --branch -uall
git rev-parse HEAD
test ! -e /Users/x/.dsh-dev/tasks/skill-header-832-refresh && test ! -L /Users/x/.dsh-dev/tasks/skill-header-832-refresh
test ! -e /Users/x/.dsh-dev/profiles/omnimux-dev-skill-header-832-refresh && test ! -L /Users/x/.dsh-dev/profiles/omnimux-dev-skill-header-832-refresh
test -f /Users/x/.dsh-dev/.credentials.yaml && test -f /Users/x/.dsh-dev/settings.yaml
DSH_DEV_HOME=/Users/x/.dsh-dev OMNIMUX_DEV_LEGACY_HOME=0 ALLOW_SEED_FROM_PROD=0 \
OMNIMUX_L2_SEED_PROFILE=/Users/x/.omnimux-dev/profiles/omnimux \
DSH_SRC=/Users/x/Desktop/Project/Github/deepseek-harness \
bash scripts/dev-env.sh start skill-header-832-refresh omnimux-market \
  --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832
```

参数来自 [dev-env.sh](../../scripts/dev-env.sh):133–171、654–767：`--source` 接收工作树根并解析成其 `plugins/`，等价于原 `OMNIMUX_PLUGINS_DIR="$PWD/plugins"`。不是改 SOURCE 到 refresh 目录。正式脚本负责私有继承、受管克隆、依赖安装、池内端口分配、Host/watch；失败保存脱敏摘要后停止，不删 viewer、不造成功 env、不原样反复重试。不要把可能含认证链接的原始 stdout/host.log 贴进文档。

## 3. 绑定文档提交后的 HEAD，而非旧源码 SHA

先完成本报告的本地提交，再以 `git rev-parse HEAD` 取得实际新 HEAD；文档不硬编码自身提交 SHA，避免递归 amend。启动成功后从正式输出及新 profile 的 `port.txt`、`host.pid` 取得实际值，核对 Host PID/启动时间/监听端口/命令中的 profile，以及唯一在研 link 的 realpath。不能沿用旧 44201 或 PID99970。

`dev-env.sh start` **不生成** `.l2-dev.env`；七字段格式来自 [git-wt.sh](../../scripts/git-wt.sh):254–262，消费校验来自 [live-qa.mjs](../../scripts/live-qa.mjs):9–47。用文件工具在任务树写此本地忽略文件（不提交），数值替换为已核验实际值；不加引号，解析器不做 shell 解引用：

```text
TOPIC=skill-header-832-refresh
PLUGIN=omnimux-market
PORT=<实际池内端口>
URL=http://127.0.0.1:<同一实际端口>
COMMIT=<本报告提交后 git rev-parse HEAD 的完整值>
SOURCE=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832/plugins
PROFILE_DIR=/Users/x/.dsh-dev/tasks/skill-header-832-refresh/profiles/omnimux-dev-skill-header-832-refresh
```

写入前不把模板当身份；写入后调用已有正式校验，无替代 verifier：

```sh
node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs'
import { resolveTarget, verifyL2Runtime } from './scripts/live-qa.mjs'
const env = Object.fromEntries(readFileSync('.l2-dev.env', 'utf8').split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
console.log(verifyL2Runtime(resolveTarget({ target: 'l2', url: env.URL }, process.cwd())))
EOF
```

每次提交变化均重新绑定并新建运行请求；不得只把旧报告 SHA 改成新 HEAD。若仅文档提交且 Host/source 未变，无需无意义重启，但仍需当前 HEAD 的新请求/同次证据；Host身份或端口变化则旧运行证据失效。

## 4. 正式 ego / verify:live

运行 QA 先加载 ego-browser skill，复用同一 ego task space 与选中 Tab，使用本树 `scripts/ego-live-qa.mjs` 的 `createEgoPage` 和 `openL2EgoPage(tab, { url: 实际干净URL })`。严格按 [plugin-qa 页面准备示例](../contracts/plugin-qa.md#页面准备与认证恢复) 填实际 task/Tab/绝对模块路径；登录链接只在模块内存中交换，不打印 token，不换 IAB。缺工具能力或 task 被接管即 BLOCKED。

页面认证、QA 会话/工作区准备好后，在任务树执行：

```sh
pnpm verify:live market --target=l2 --url=http://127.0.0.1:<实际池内端口>
```

`package.json:68` → `scripts/agent-live-qa.mjs` → `live-qa.mjs:57` 确认：唯一 positional 为 `market`，只支持 `--target`、`--url`、可选 `--evidence-dir`。不加 `--issue` / `--commit` / `--session` / `--profile`；commit/profile 从 Git/env 获取。默认完整目录 `.workbuddy/evidence/live-qa/<run-id>/` 足够，若用 evidence-dir 也只能在该根下。`market` 的真实入口为 `[data-omnimux-market-entry]`、Tab `omnimux-market:plaza`（[live-stage-contracts.mjs](../../scripts/live-stage-contracts.mjs):122–150）；不要用 `skill` 或 `all` 冒充本次范围。

CLI **exit 2 / PENDING 是正常请求准备，不是 PASS**；exit 1 是失败，先读脱敏错误，不盲重试。若 pnpm 仍触发无关依赖 bootstrap，停止该 bootstrap；可用 `node scripts/agent-live-qa.mjs market --target=l2 --url=...` 调用完全相同正式入口，记录实际命令，不能另造探针。

在同一 ego task/Tab 的后续 `ego-browser nodejs` heredoc 中重新构造绑定该 Tab 的正式适配页，导入同一模块并执行：

```js
cliLog(await runPreparedQa('<CLI返回的本树绝对 requestPath>', { tab }))
```

请求有效期15分钟、只消费一次；过期/已消费/HEAD变化用新请求，不复用旧 run/PNG。共享探针会收集真实 runtimeProof 与加载 bundle 指纹（不是重复 viewer seed 哈希调查）。核对 runId、HEAD、URL、profile、Host PID/startedAt、task/Tab 前后一致、可解码 PNG、实际非空内容与关闭重开、原会话/workbench 恢复；`ready`、HTTP200 或 pending 均不算验收。

## 5. 业务验收与状态保护（待填，默认未验）

在新 L2 创建合成 QA 会话/工作区，不复制真实业务会话。先记录 QA 原 session/workspace、草稿、附件、右栏 tab/尺寸；单击和连点创建后再返回原会话逐项比对。新环境不会自动继承旧任务会话，“工作区继承”指当前 QA 会话的选中工作区，不是跨 profile 数据迁移。

| 待验项 | 操作与通过条件 | 结果 / 证据路径 |
|---|---|---|
| 布局矩阵 | 宽容器、分屏、375px；中英×深浅；三层页头、键盘focus、分类横滚、搜索无重叠，截断不溢出 | 未验：____ |
| 全48推荐 | 建48行 slug清单逐一对照实际卡片、截图索引、完整详情标题/说明及无H3；三张新封面语义正确；不以3图文件展示代替48图实测 | 未验：____ |
| Tab/分类/搜索 | Skill与我的Skill、精选、分类和搜索交集；返回全部、刷新、切Tab后推荐安装项保留，未知项不伪推荐 | 未验：____ |
| 创建单击/连点 | 继承当前工作区，仅预填 `/skill-creator`；消息数/请求证据确认无自动发送；无重复意外会话；原草稿/附件及右workbench保留 | 未验：____ |
| 安装入口 | 打开/关闭/重开、无效选择/失败反馈；错误保留、不伪成功，可重试 | 未验：____ |
| 确认安装 | 在私有L2授权范围内可控失败，未installed、我的列表不增、确认框保留、原错误可见；重试清错，请求中按钮/关闭禁用，成功才mark/关闭 | 未验：____ |
| 宿主tab | 重复打开唯一、关闭状态清空、重开恢复；隐藏插件X不影响宿主关闭；原会话/workbench恢复 | 未验：____ |

安装仅用任务测试条目和既有安装链，不上传敏感文件、不修改共享安装目录、不触发模型或付费行为。失败可控方式、目标路径和请求证据须记录；若无法安全得到真实失败/成功，标明该分支 BLOCKED，不能以 VM 单测代签。现有“本地文件安装”只按文件名解析 slug，不上传 zip 字节，不宣称任意 zip 安装已实现。

普通 Client/Stage diff 的 Electron 追加层 **N/A**。只有后续验收实际涉及 Electron 壳、`data-dsh-desktop-*`、平台门控、原生拖拽/窗口布局等 Web 无法证明的行为时，按合同补 `pnpm verify:cdp` 与真实 renderer/CDP 报告；不可把 web截图冒充 Electron，也不为普通UI重复增加壳层测试。验收完成后先确认报告，再按 ego skill 独立最终 heredoc `completeTaskSpace(id, { keep: false })` 并核对 done；保留本地证据，不删除旧L2。

## 6. 可直接填写的本地 PR 草稿（未发布）

**建议标题**：`fix(market): restore Skill workshop hierarchy and install retry (#832)`

Closes #832

### 变更摘要

恢复 Skill 工坊三层页头、统一入口命名、创建/安装既有入口、响应式卡片两行文本；恢复已安装推荐 Skill 的精选归属；安装失败不伪成功并允许重试；仅替换三张指定封面，保留48推荐和其余45图。仅 market 业务变更；本轮追加恢复文档，不改实现。

### Changed-file 范围（本地固定 base → 输入 HEAD）

共20文件；本报告加入后21文件。以下按 `plugins/omnimux-market/` 为相对前缀分组，另列完整 docs 路径：

- 实现8（7源+1生成）：`src/client/apply.js`、`css.js`、`i18n.js`、`plaza-shell.js`、`session-create.js`、`skill-picker-logic.js`、`skill-plaza.js`，以及生成 helper `lib/client/skill-picker-logic.js`（7源+1生成）。
- 测试6：`src/client/skill-header.qa.test.js`、`src/client/skill-header.test.js`、`src/client/skill-workshop-ui.test.js`、`src/client/workbench-seat.test.js`、`src/tests/client-bundle.test.ts`、`lib/tests/client-bundle.test.js`。
- 图片3：`catalog/covers/brand-promo-video-generator.png`、`catalog/covers/clip-export.png`、`catalog/covers/dot-matrix-brand-wordmark-motion.png`。
- 报告3：`docs/implementation/issue-832-engineering.md`、`docs/implementation/issue-832-qa.md`、`docs/implementation/issue-832-dependency-status.md`；本轮新增 `docs/implementation/issue-832-recovery-pr-draft.md`。
- 未改：`catalog/index.json`、其他45图、workflow业务源码/跟踪产物、根manifest、正式scripts/contracts、官方DSH、外仓和共享seed。未做全仓额外审查。

### 证据登记

| 层 | 现状 | 提交PR前填实际证据 |
|---|---|---|
| 离线独立QA | 既有654/654通过、0 fail/skip/cancelled；Stage/Slot/边界/UI/Registry通过；本轮未重跑 | `issue-832-qa.md` 第二轮；保留原 head 与源码SHA |
| 本轮文档 | 仅 doc diff-check + 链接/命令只读核对 | 本地文档commit：____；检查退出码：____ |
| 依赖交付 | BLOCKED，尚无新兼容seed接收事实 | 版本/归档/受管receipt/同pin兼容QA：____ |
| L2身份 | 未验 | HEAD/dirty、SOURCE、profile、URL、Host PID/startedAt、唯一link：____ |
| 正式ego探针 | 未验 | runId/request/report/PNG、task/Tab、runtimeProof、恢复断言：____ |
| 业务矩阵 | 未验 | 第5节逐项结果；48 slug完整索引：____ |
| Electron | N/A，普通Client无壳平台变更 | 若变更面扩大，补适用理由及CDP：____ |
| 远端/CI/MQ | 未push、未创建PR、未验证CI、未merge | 获准后填远端base/head、required checks清单与结果、独立最终验收、PR/MQ receipt：____ |
| 合入后Dev | 未物化、未验；本轮禁止 | 仅未来获准且确认合入后填main/merge SHA、45120同探针证据：____ |

风险建议：R1（触及一级页入口/呈现，按实际范围保守定级）；本轮单独文档增量为R3，不降低整项UI验收门槛。私有L2初始化授权不等于共享seed升级/删除数据/外仓写入授权。本轮明确禁止远端写入，合同中的默认收尾流程不能覆盖该限制，不自打 qa:pass。PR创建、合入、App物化和业务验收分开登记。

**最小下一步 / Owner**：依赖 owner 提供正式兼容 seed 回执；#832 运行 QA 核对一次交付条件后，用新名、原 SOURCE 正式 start 一次，绑定本报告提交后的 HEAD，完成同次 ego/verify:live 与第5节矩阵。没有新交付则不启动。本报告不创建轮询/后台任务，也不宣称持续等待。
