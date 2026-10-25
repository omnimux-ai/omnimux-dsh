# Spec: 清除 0.2.1 服务契约下 settingsScope 的最后遗留（#3775）

- Issue: #3775（P1，跨插件验证；本次实际改动只落在 `omnimux` 一个包）
- 来源：Issue #3775 验收「确认 0.2.1 服务契约下没有 webRuntime / settingsScope 遗留」
- 前置：#3773 已把 `settings` 服务从硬 `inject` 改为按需 `ctx.get`，并移除了
  `settings-value-reader.js` 里的 `ctx.inject(['settingsScope'], …)` 分支。
- 本任务性质：**验证为主**。全量扫描结论见交付报告；本规格只覆盖验证中发现的功能级真遗留。

## 背景

`#3773` 删掉了 `settingsScope` 的生产分支，但漏掉一个仍然驱动该服务的 e2e 用例：

`plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js:74` 的
`E2E: 0.1.5 settingsScope value keeps the same bypass behaviour` 仍用
`fakeCtx({ settingsScope: binder })` 驱动 reader。模块已不再 `inject` 该服务，
因此 `read()` 恒返回 `undefined`，登录门不再放行 —— 该用例**在本机稳定失败**
（实测 `node --test tests/e2e/settings-value-reader.e2e.test.js` = 2 pass / 1 fail）。

它不在 `plugins/omnimux/scripts/run-tests.mjs` 的 `src/**` 收集范围内，
所以 `pnpm --filter omnimux test` 不会暴露它；这是一个长期躺在仓库里的红用例。

## 范围

- 修改 `plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js`：把失败的
  `0.1.5 settingsScope …` 用例改写为**移除回归用例**——仅提供 `settingsScope` 的宿主
  不再产生任何放行，登录门保持 `prompt`；并断言该宿主下 `read()` 返回 `undefined`。
- 在 `specs/compat-settings-value-reader.spec.md` 追加「0.1.5 分支移除」记录，
  使该规格不再声称支持两代服务，并记录 `adopt()` 优先保护为何保留。
- **不改运行期代码**：`plugins/omnimux/src/**` 一行未动。
- 不改 `auth-gate.js`、不改设置 schema/UI、不改 `plugins/` 下其他 21 个包。

### 明确不在本次范围（已判定、留作后续）

`plugins/omnimux/src/client/settings-value-reader.js:1-12` 与
`plugins/omnimux/src/client/ModelsSettingsCard.jsx:51` 的注释仍把已退役的
`settingsScope` 写成当前机制。这是**文档级真遗留**，但两处都在
`src/client/` 下，改动会把本任务变成「客户端/UI 变更」，
按 [plugin QA](../../docs/contracts/plugin-qa.md#本地最小命令选型agent-默认)
必须附隔离工作树**功能路径浏览器证据**；而本任务可用的工作树浏览器运行器
（`scripts/worktree-web-qa.mjs`）只覆盖侧栏 chrome 几何，与本次改动无关，
拿它当证据属于「首页打卡冒充」。

因此本次只**报告**这两处（交付报告给 `文件:行号` 与判定），不改；
建议随下一个本就携带浏览器证据的客户端 PR 一并修正（各一行注释）。

## 假设

1. `settingsScope` 在 DSH 0.2.1 全量 344 个运行时包中 0 命中（既有证据：
   `docs/evidence/2026-10-24-dsh-0-2-1-rc-3-four-api-surfaces.md` §4.1/§4.3），
   因此「仅提供 `settingsScope` 的宿主」在 0.2.1 上等价于「该服务不存在」，
   回归用例钉住的是移除后的真实行为，不是臆造场景。
2. `configForms` 路径的行为不变：`forms.get(entryId)` 返回带 `getSnapshot()` 的
   controller，快照带 `status` 且非 `ready` 时不读旧值。本任务不触碰该逻辑。
3. 本任务不改任何 `src/**`，因此不改变任何导出面、构建产物或运行期行为；
   `pnpm --filter omnimux test` 的收集范围（`src/**`）也不包含被改的文件。

## 证伪方式

1. 若改写后的 e2e 用例在**未修改**的 `settings-value-reader.js` 上就通过，说明它没有
   真正钉住移除行为（例如断言过弱），必须加强到「仅 `settingsScope` 宿主下
   `read()` 为 `undefined` 且登录门为 `prompt`」为止。
2. 若 `node --test plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js`
   出现任何 fail，说明改写与实现不符，按实现修正断言而不是放宽断言。
3. 若 `git diff --stat origin/main` 显示 `plugins/*/src/**` 有任何一行改动，
   说明范围声明与实际不符，必须回退该改动或补上对应的浏览器证据。
4. 若 `rg -n "settingsScope" plugins/omnimux/src` 在改动后仍命中非测试文件，
   说明「不在范围」的两处注释还在（预期如此），交付报告必须列出它们而不是声称清零。

## 验收

1. `node --test plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js` 3/3 通过
   （改前 2/3）。
2. `node --test plugins/omnimux/src/client/settings-value-reader.test.js plugins/omnimux/src/client/settings-value-reader-status.test.js`
   8/8 通过（行为不变）。
3. 全量静态面（22 个包）：`webRuntime` / `webStartup` 0 命中；`settings` 服务无任何硬
   `inject`，读取全部为按需 `ctx.get`；`settingsScope` 只剩测试脚手架与两处注释。
   逐插件判定见交付报告。
4. 真实宿主面：22/22 插件在 `0.2.1-rc.3` 宿主里组合进 profile（`--dump-config` 零 skip）
   且 `apply(ctx)` 演练通过；证据见 `.workbuddy/evidence/issue-3775/`。

## 风险

R1。改动仅限一个不在默认测试收集范围内的 e2e 文件与规格文档；不改运行期行为、
不触碰凭据/支付/发布路径。最坏情况是该用例断言方向写错，由 §证伪方式 2 兜住。

## 旧标准变更

- `plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js` :: `E2E: 0.1.5 settingsScope value keeps the same bypass behaviour`

**原断言**：`fakeCtx({ settingsScope: binder })` 驱动 reader，断言
`bypassed?.runtimeBypass === true` 且登录门 `phase === 'closed'`（即「旧宿主上
settingsScope 值仍能放行」）。#3773 已删除该模块的 `ctx.inject(['settingsScope'])`
分支，reader 在该宿主上不再取到任何 controller，`read()` 恒为 `undefined`，
登录门不再放行 —— 该用例在本机稳定失败（实测 2 pass / 1 fail）。

**必须改的理由**：`settingsScope` 服务在 DSH 0.2.1 已不存在（344 个运行时包 0 命中），
被断言的行为已不是产品契约；保留旧断言等于让一个必然失败的用例长期躺在仓库里，
且它不在 `src/**` 收集范围内，默认 `pnpm --filter omnimux test` 不会暴露。
按门禁要求，本变更只改**该用例的断言方向**：从「旧服务放行」改为「旧服务不再放行」，
把 #3773 的移除固化成回归保护。

**实际改法**：用例改名为 `E2E: retired settingsScope service no longer bypasses the login gate`；
新增两条断言 —— `read()` 返回 `undefined`（退役服务绝不被读取）、
`bypassed === null` 且 `getSnapshot().phase === 'prompt'`（旧宿主不再放行、登录门维持提示）。
`fakeCtx` 的 `settingsScope` 分支**保留**：它正是用来模拟「只有退役服务的宿主」的夹具。

**新期望证据**：`node --test plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js`
3/3 通过（改前 2/3）。

## 新用户基线

不适用：本任务不新增产品路径，也不改变任何依赖外部配置的默认值。改动后
`settings-value-reader` 的失败模式与改动前一致 —— `configForms` 缺席时
`read()` 返回 `undefined`，登录门按旧行为提示登录，不崩、不拦截生成。
