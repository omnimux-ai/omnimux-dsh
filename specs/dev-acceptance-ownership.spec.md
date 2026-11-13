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

### `impact-matrix` 的 Dev 文案与 `dev.target`（后续已由 #4099 落地）

本 PR 内这两个文件保持 base 原样；其 Bot-owned 文案与机器字段迁移已在 follow-up **#4099** 落地（`dev.reason`/`summary` 为桌面端 Bot 口径、`dev.target: 'desktop-bot'`、`ci-verdict.mjs` 校验与 8 处断言级联、`impact-matrix.test.mjs` 用例名静态化）。

当时无法一并处理的原因是两条测试门禁互斥（`dynamic-test-options-needs-review` 与 `test-assertion-removed-or-rewritten` 不可声明放行），该缺陷已由 #4100 定位、#4102 修复（归因迁移走文件级 `:: *` 声明通道），细节见 `specs/gate-attribution-migration.spec.md`。

## 3. 不变量

- 合并前 L0 与隔离 worktree 浏览器证据的要求不变；
- Dev 验收仍不阻塞合并/清理，只是执行者与证据归属改变；
- 生产 `~/.omnimux` 与用户真实项目目录不受影响。
