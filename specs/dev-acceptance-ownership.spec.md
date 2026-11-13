# 规格：Dev 真机验收归属改为桌面端 Bot（治理同步）

## 1. 背景与授权

OmniMux 团队分工调整：Dev 构建物化 + CDP 实机 e2e 验收由**桌面端 Bot**负责；人工只做最终确认。本改动为治理性文档/规则同步，由 X 在 OmniMux 开发组明确授权。

## 旧标准变更

`scripts/auto-pipeline.test.mjs` 中三个用例的名称随归属变更改写（断言语义随之调整）：

- `scripts/auto-pipeline.test.mjs` :: `human development acceptance remains independent of complete document evidence`
- `scripts/auto-pipeline.test.mjs` :: `merged handoff preserves the worktree and defers the agent gate to isolated-worktree browser evidence`
- `scripts/auto-pipeline.test.mjs` :: `post-merge delivery treats Dev as human-owned and never opens an agent Dev gate`

原断言：三个用例名分别声明「human development acceptance 独立于文档证据」「merged handoff 把 agent gate 推迟到隔离 worktree 浏览器证据」「post-merge delivery 把 Dev 视为 human-owned」；其中 handoff 用例的 `nextAction` 断言匹配 `Dev 45120 real-device acceptance is HUMAN-owned` 与 `must not block, be waited on, or be claimed`。

必须改的理由：归属从 human 改为桌面端 Bot，旧用例名与断言表达的是已废止口径；`auto-pipeline.mjs` 的 `nextAction` 文案已同步为「owned by the desktop Bot … humans do final confirmation」，测试必须匹配新口径，否则回归必红。

新期望证据：
- `human development acceptance …` → `Dev acceptance remains non-blocking and final human confirmation is independent of complete document evidence`；
- `post-merge delivery treats Dev as human-owned …` → `post-merge delivery assigns Dev acceptance to the desktop Bot and never opens an agent Dev gate`；
- handoff 用例断言改为 `/Dev 45120 real-device acceptance is owned by the desktop Bot/` 与 `/humans do final confirmation/`；
- 实跑 `node --test scripts/auto-pipeline.test.mjs` → 24/24 pass。

### `impact-matrix` 的 Dev 文案与 `dev.target` 本 PR 不动（门禁冲突阻塞）

`scripts/impact-matrix.mjs` 与 `scripts/impact-matrix.test.mjs` 在本 PR 内**保持 base 原样**（`dev.reason`/`summary` 仍为「人工职责」口径，`dev.target` 仍为 `'human'`）。其 Bot-owned 文案与机器字段迁移由 follow-up #4099 处理，该 follow-up 当前被门禁冲突 issue #4100 阻塞；本 PR 不做静默回退。

原因（结构性门禁冲突：两条不可声明放行的门禁互相打架，任何「动态用例名 + 断言」的测试文件在结构上无法修改）：

- `dynamic-test-options-needs-review`（`scripts/test-authoring-inspection.mjs:172`）：`it()`/`test()` 第一实参不是字符串字面量（模板字面量用例名）即判风险，且**不可声明放行**，只接受消除；
- 消除后立刻触发 `test-assertion-removed-or-rewritten`（`scripts/test-authoring-inspection.mjs:305-311`）：它按「无主断言桶」逐条比较数量。base 的断言因模板用例名全部落在无主桶，静态化后变成有主 → 无主桶归零 → 判「无主断言被删除」硬拒，且 `changedCases: []` 使任何声明都匹配不到（`scripts/verify-test-standard-declarations.mjs:122-124` 直接判 `declarable: false`）。文件级声明 `- \`<path>\` :: \`*\`` 只在整文件删除（`after === ''`）时开放，不覆盖改写。

复现（本地实跑，base `93f317453`）：
- 仅静态化两处用例名、断言文本全部保持旧口径 → `node scripts/verify-test-standard-declarations.mjs . 93f31745` 仍报 `- [M] scripts/impact-matrix.test.mjs（test-assertion-removed-or-rewritten）该原因不可经声明放行，必须撤回改动`；
- 断言改回旧文本 + 保留静态化，报同一条。

因此本 PR 不触碰这两个文件：治理口径以 `AGENTS.md` 与 `docs/contracts/*` 为单一权威，`impact-matrix` 的旧输出暂不可作为 Dev 归属判定依据；门禁冲突已单独开 issue #4100（两条测试门禁互斥），修好后由 #4099 一次性改文案与 `dev.target`。

## 3. 不变量

- 合并前 L0 与隔离 worktree 浏览器证据的要求不变；
- Dev 验收仍不阻塞合并/清理，只是执行者与证据归属改变；
- 生产 `~/.omnimux` 与用户真实项目目录不受影响。
