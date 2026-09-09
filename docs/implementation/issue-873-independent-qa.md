# Issue #873 独立 QA 报告

## 结论

- 验收对象：指定工作树 `common-sync-source-873`，base/HEAD 均为 `f167598747c7296a1b71a571e80babcf88032094`，审查该 SHA 上未提交 diff；没有更新任务树远端 refs。
- 专项：第二轮 **64/64 PASS**；普通源身份实现未发现已复现源码缺陷。覆盖率未采集，不虚报百分比。
- 完整 gates：当前 **143/149，6 FAIL**；固定 base 同条件 **143/149，完全相同6 FAIL**，新增失败为0。此结论只证明本次依赖条件下没有新增 gates 失败，不代表完整 gates 已通过。
- 总体 **IS_PASS: NO / Routing: Known Issues**。可供主理人准备 Draft PR；不得标记 ready、qa:pass、合并或物化。当前会话未 commit/push/PR/部署，也未委派。
- Engineer 后续：把真实 `sync-source-identity.test.mjs` 接入持续执行门禁；补齐正式依赖/资源后复验完整 gates。身份函数本身当前路由 NoOne，不要求无证据修改实现。

## 行为审查和独立测试

执行实现仅修改 `scripts/sync-to-app.sh:91–121`。状态读取失败/dirty 在 fetch 前拒绝；显式 `+refs/heads/main:refs/remotes/origin/main` fetch 不成功即退出；完整 commit SHA 不等即退出。主检出与 linked worktree 使用各自工作索引。原 target-bound bypass 拒绝逻辑、managed 前置分流未改。产品源码 diff SHA256 为 `b144cc420ad0d47150444c01be37194c1782e776719d6153bed6e7ee267790e8`，QA 前后相同。

新测试实际创建 bare origin、primary、linked branch，真实 commit/push/fetch/detach/merge；仅下游 materializer 替换为无副作用 marker。拒绝断言同时检查退出1和未出现 marker，不以 regex 替代 Git 行为。

已实跑：clean main、named linked tree、detached fetched-main；主树 dirty 不影响 linked 且原文件不变；staged/unstaged/untracked/conflict；ahead/diverged/behind；缓存相等但远端更新；窄 fetch refspec；remote缺失/fetch失败/远端main缺失；非Git；旧布尔旁路和非法目标前缀。

QA 对 `scripts/sync-source-identity.test.mjs` 增加3项：损坏真实 index 导致 status 失败；detached 最新tip但缓存tracking落后仍经fetch准入；dirty普通源在managed参数下仍走独立dispatch。managed测试仅证明dispatch未被普通门禁拦截，不声称复验完整managed交易/MQ路径。

第一轮专项60/61：树内TMPDIR中的非Gitfixture删除.git后向上发现父仓，仍拒绝但错误原因不符。路由QA self，设置fixture `GIT_CEILING_DIRECTORIES=temp`，不改预期/不改源码。第二轮64/64（identity15+bypass4+lifecycle3+scope10+release9+targets23）。

持续门禁缺口：`package.json:52` 的test:gates明确列表与 `scripts/verify-ci-gates.test.mjs` 均不调用新identity测试；`.github/workflows/quality-gate.yml:133` regression列表亦未登记。lifecycle只检查字符串，不提供持续真实Git保障。建议Engineer最小登记新套件，而非增加新的静态regex。

## 可复现命令与隔离

以下均从任务树执行。`Q=$PWD/.qa-873`，所有下载、HOME、缓存、临时fixture、测试profile/store和固定base副本均在任务树内；未写主树、外仓、实际用户profile/store。node_modules仅为指向树内deps的软链。没有创建外仓kit副本或伪造CPython/assets。

```bash
Q="$PWD/.qa-873"
git archive f167598747c7296a1b71a571e80babcf88032094 | tar -x -C "$Q/base"
git init -q "$Q/base"
git -C "$Q/base" fetch -q ../.. f167598747c7296a1b71a571e80babcf88032094
git -C "$Q/base" reset -q --mixed FETCH_HEAD
# base仅在任务私有仓写git元数据；最终git diff为空
HOME="$Q/home" npm_config_cache="$Q/npm-cache" npm install --prefix "$Q/deps" --ignore-scripts --no-audit --no-fund
HOME="$Q/home" COREPACK_HOME="$Q/corepack" corepack prepare pnpm@11.7.0 --activate
HOME="$Q/home" npm_config_cache="$Q/npm-cache" npm install --prefix "$Q/deps" --ignore-scripts --no-audit --no-fund @chakra-ui/react@3.37.0 jsdom@30.0.1
export HOME="$Q/home" TMPDIR="$Q/scratch" COREPACK_HOME="$Q/corepack" COREPACK_ENABLE_NETWORK=0
export npm_config_cache="$Q/npm-cache" npm_config_store_dir="$Q/store"
node --test scripts/sync-source-identity.test.mjs scripts/sync-bypass.test.mjs scripts/simulate-multi-agent-lifecycle.test.mjs scripts/sync-plugin-scope.test.mjs scripts/sync-release-policy.test.mjs scripts/sync-targets.test.mjs
corepack pnpm --config.verify-deps-before-run=false test:gates
# 在 Q/base 以同一组绝对env执行完全相同gates命令
git diff --check
bash -n scripts/sync-to-app.sh
node .qa-873/compare.mjs
```

deps目录清单与lock保存完整。已安装pngjs7.0.0、esbuild0.28.2、acorn8.15.0、react/react-dom18.3.1、yaml2.9.0、Chakra3.37.0、Emotion11.14.0、jsdom30.0.1。两边共用同一树内依赖目录和仓内form-contract（其源码未变化），因此结果是在相同依赖条件下比较。Node v25.8.0 / pnpm11.7.0；jsdom30.0.1声明Node ^22.22.2 || ^24.15.0 || >=26，安装有EBADENGINE警告，未用它解释未经验证的失败。

依赖首次安装exit0；第二阶段安装20秒超时SIGTERM，读日志后后台完成exit0。`npm view dsh-ui-kit version dist.tarball --json` exit1，registry.npmjs.org 返回404，未转向写外仓或stub。

## 两轮实际结果

| 检查 | 当前 | 固定base | 退出码 |
|---|---:|---:|---:|
| 第一轮专项 | 60/61 | 不适用 | 1 |
| 第一轮完整gates | 125/133 | 125/133 | 两边1 |
| 第二轮专项 | 64/64 | 不适用 | 0 |
| 第二轮完整gates | 143/149 | 143/149 | 两边1 |
| bash -n / git diff --check | 通过 | base tracked diff为空 | 0 |

第一轮临时目录名含`tmp`，触发guard测试明确禁止的临时目录豁免，导致独立guard测试文件在注册16个case前失败，故总数133不是149。第二轮改为树内`scratch`后149项全部注册执行，无跳过/取消。pngjs、Corepack相关失败已消失。

## Known Issues（第二轮结束，不进入第三轮）

两边失败名称和错误原因一致：

1. `stage selection and actual runtime discovery reject empty or unknown targets`：form-contract导入缺少`zod`，ERR_MODULE_NOT_FOUND。
2. `stage-specific loading and failure markers cannot pass as valid empty content`：market client-factory构建不能resolve `dsh-ui-kit`。
3. `verify:live creates one pending, SHA-bound ego-browser request and never reports PASS`：form-contract缺zod，预期pending但得到错误。
4. `verify-stage-contracts passes on all first-level Stage and StageStore files`：form-contract缺zod，预期exit0实际1。
5. `verify-package-files passes on all plugins`：缺 `plugins/omnimux-assets/runtime/cpython-3.13.15+20260807-darwin-arm64`、`...-darwin-x64`、`plugins/omnimux-forms/assets/examples`。
6. `verify-package-files unit tests pass`：live-monorepo检查复现相同3个文件缺口（内层7/8）。

这些是实证相同条件基线残余，不笼统归类为“环境无关”。zod可按仓内manifest继续合规准备；kit需要已批准来源、两平台CPython需要真实供应品，forms examples应通过原构建/生成链生成。QA严格两轮上限，本轮不再修改依赖重跑，不伪造资产、不删除检查或降低断言。

## 证据与剩余验收

原始日志保存在 `.qa-873/evidence/`：`targeted.log`、`targeted-r2.log`、`current-gates-r1.log`、`base-gates-r1.log`、`current-gates-r2.log`、`base-gates-r2.log`、`comparison.json`、依赖安装日志与`kit-registry.json`。该目录、deps/cache/base/scratch及node_modules软链均为任务QA制品，**不得整目录提交**；保留用于复核，不清理其他工作树。

主理人/Engineer剩余动作：登记真实身份回归套件；准备zod、批准kit、真实CPython和forms生成资源，保持固定base同条件对照；required CI/MQ仍须通过；本次脚本QA不提供实际App物化/运行验收，未来部署仍需独立授权和干净最新fetched-main身份。
