# P1：快照静默丢型号校验 + 语音转写豁免显式化

- Issue：#3763（父任务 #3719）
- 前置：P1a（#3719 / PR #3723）与 P1b（#3734）已合入——成员资格/线路/价格已切到网关快照。
- 工作树：`.worktrees/snapshot-coverage`，分支 `agent/snapshot-coverage-issue-3763`。

## 这一步要什么

1. **随包快照的「静默丢型号」变成硬门禁。** `scripts/verify-auto-serving.mjs` 的 `offlineGatewayCheck()` 原来拿
   `buildModelCatalog({snapshot})` 与同一份 snapshot 求交，恒真；换成「基线（`QA_BASE` 或 `HEAD` 的随包快照）
   vs 当前随包快照」：任何在售型号消失即 `snapshot_model_dropped` 并点名，不设 50% 比例阈值。取不到基线只记
   warning，不假红。
2. **断言真的被执行。** 新用例进 CI 执行的 `node --test` 链，并同步 `scripts/governance-manifest.json` 的分类。
3. **转写豁免显式化。** `whisper-1` 的 `gatewayMembership:false` 从 `stt.js` 的隐式硬编码改为
   `auto-serving-manifest.json` 的 `gatewayMembershipExempt`（原因 + 复核时间）声明；运行时读声明决定豁免，
   未声明的型号仍被成员资格闸拒绝；豁免集合进 P1a 只读诊断。
4. **转写默认值四处对齐门禁。** `PRIMARY_KIND_OPERATIONS` 补 `speech_to_text`，并把四处默认值
   （`catalog-defaults.json`、`media/route.js`、workflow `speechToText` schema、`stt.js` 的 `FILE_UPLOAD_MODEL`）
   纳入跨插件默认对齐。
5. **`verify:models` 退役联网分支。** 删除无条件拉取 `/api/pricing` 与带密钥的 `/v1/models` 路径，保留无密钥的
   patch×`CHAT_MODELS` 断言，模型存在性改用随包快照判断。

## 新用户基线

- 全新机器、未登录、离线：随包快照仍提供完整目录（P1a 的 bundled floor），转写默认值 `whisper-1` 由清单显式豁免
  才放行；没有该声明时，转写提交会以「该模型已下架」被拒，而不是静默回落到别的模型。
- 本任务不引入任何开发机私有路径、本地端口或模型别名；`verify:models` 不再需要 `OMNIMUX_API_KEY`，也不再读
  `~/.config/omnimux/dsh.env`。

## 验收

- 反例：把随包快照里某个在售型号临时删掉（内存注入，不改仓库文件）→ `verifyAutoServing()` 报
  `auto_serving_snapshot_model_dropped` 并点名该型号；补回后放行。
- 基线不可得（无 git / ref 不存在）→ 只有 warning，`ok === true`、`exitCode === 0`。
- 豁免：未在清单声明的型号仍被成员资格闸拒绝；声明的型号放行；诊断能读出豁免集合。
- 四处转写默认值人为改成不一致 → 跨插件对齐门禁红，并点名不一致的来源。
- `node --test scripts/verify-auto-serving.test.mjs scripts/verify-cross-plugin-model-alignment.test.mjs`、
  `pnpm verify:model-contracts`、`pnpm check:boundaries`、`pnpm test:gates` 全绿（既有失败与主检对照说明）。
- `pnpm verify:models` 在无密钥、无网络下退出 0，且源码里不再出现 `fetch(` / `homedir` / `OMNIMUX_API_KEY`。

## 假设

- 随包快照（`plugins/omnimux/src/catalog/cloud/bundled/pricing.json`）是「仓库当前承诺在售」的真源；
  `enable_groups` 非空即「在售」。因此「基线在售集合 − 当前在售集合」正是「提交静默丢型号」的可观测定义，
  不需要联网、也不需要账户视图。
- `git show <ref>:<path>` 在 CI 与本地工作树里都能拿到基线文件；`QA_BASE` 由 CI 注入 PR base SHA，本地缺省
  `HEAD`（即「与上一个提交比」）。
- 转写型号不出现在匿名随包快照里，是网关侧的事实而非本地遗漏；因此本步不做收敛，只做「显式声明 + 可观测 +
  有门禁」，等账户视图发布转写型号后再回收豁免。
- 四处转写默认值都必须是**运行时可读的常量**（而不是注释或文档），否则对齐门禁只能扫文本、抓不到真实漂移。

## 证伪方式

- 若删掉随包快照里的一个在售型号后 `verifyAutoServing()` 仍然 `ok === true`，说明「基线 vs 当前」没有真正接线
  （或基线读取失败被静默当成通过）。
- 若基线读取失败时门禁变红，说明「取不到只记 warning」没有落地。
- 若把 `auto-serving-manifest.json` 的 `gatewayMembershipExempt` 删掉后转写仍能提交成功，说明 `stt.js` 里还留着
  隐式豁免；若把该声明加到一个未上架型号上仍被拒，说明运行时没有读清单。
- 若把四处默认值中的任意一处改成别的型号而跨插件对齐门禁仍然全绿，说明那一路没有被纳入检查。
- 若 `node scripts/verify-models.mjs` 的源码或运行时仍会发起网络请求（含 `fetch(`、`homedir()`、
  `OMNIMUX_API_KEY`），说明联网分支没有真正退役。

## 旧标准变更

- `scripts/verify-cross-plugin-model-alignment.test.mjs` :: `baseline repository contracts pass cross-plugin model alignment verification`
  - 原断言：`report.alignment.defaultModelsChecked === 4`（text / image / video / audio 四类默认对齐）。
  - 理由：`PRIMARY_KIND_OPERATIONS` 补入 `stt: 'speech_to_text'`，默认对齐从四类变五类；同时新增
    `sttDefaultsChecked` 覆盖四处转写默认值。
  - 新期望：`defaultModelsChecked === 5`，`sttDefaultsChecked === 4`，其余断言（白名单 5、能力 seam 1、
    aspectRatio ≥ 8）不变。

## 证伪实验记录

按 [anti-agent-fake-completion-guard §3.4.1](../../docs/contracts/anti-agent-fake-completion-guard.md) 与
[plugin-qa · 门禁面](../../docs/contracts/plugin-qa.md)：本次新增/修改的守卫逐条给出「造出反例 → 变红 → 已回退 → 回退后绿」。
所有反例都造在内存或 `/tmp` 副本里；涉及临时改动仓库文件的两次实验都用 `/tmp` 备份还原，并用 `git diff --stat` 复核为字节一致。

### E1 收紧型 · `scripts/verify-auto-serving.mjs` 的 `snapshot_model_dropped`

- 反例：内存注入一份删掉在售型号 `suno` 的随包快照（另加「保留行但 `enableGroups=[]`」的变体）。
- 造之前：`verifyAutoServing()` → `ok=true exit=0`，`gateway.dropped=[]`。
- 造之后：`ok=false exit=1`，`auto_serving_snapshot_model_dropped model=suno`；清空线路的变体同样报该码。
  真实失败输出：`auto_serving_snapshot_model_dropped model=suno :: The shipped gateway snapshot no longer sells a model the bas...`
- 已回退：内存注入，仓库文件从未改动；`verifyAutoServing({baseline: base, bundled: {snapshot: base}})` → `ok=true exit=0`。
- 基线不可得的放宽分支另验：`{baseline: null}` 与 `{baselineRef: 'no-such-ref'}` 都是 `ok=true exit=0` +
  唯一 warning `auto_serving_baseline_unavailable`（不假红）。

### E2 收紧型 · `plugins/omnimux/scripts/catalog-snapshot.mjs --check --baseline <ref>`

- 反例：`/tmp/snap-drop/pricing.json`（删掉 `suno`）配 `--check --dir /tmp/snap-drop --baseline HEAD`。
- 造之前：`--check --baseline HEAD` → `exit=0`，`baseline HEAD: 11 raw models, 11 on sale, 0 dropped`。
- 造之后：`exit=1`，真实失败输出 `❌ 1 on-sale model(s) disappeared from the bundled snapshot vs HEAD: suno (raw ids: 1/11)`。
- 已回退：反例只在 `/tmp`；回退后 `--check --baseline HEAD` 再次 `exit=0`。
- 基线不可得：`--baseline nope-not-a-ref` → `exit=0` + `⚠️ baseline not readable, drop check skipped`。

### E3 收紧型 · `scripts/verify-cross-plugin-model-alignment.mjs` 的转写四处默认值对齐

- 反例：临时把 `plugins/omnimux-workflow/src/shared/speechToText.ts` 的
  `DEFAULT_SPEECH_TO_TEXT_MODEL` 改成 `seedasr-auc`（其余三处不动）。
- 造之前：`node scripts/verify-cross-plugin-model-alignment.mjs` → `✅ Cross-Plugin Model Alignment OK: 5 whitelist models, 5 defaults, ...`。
- 造之后：`❌ Cross-Plugin Model Alignment FAILED (1 issue(s)): - [cross_plugin_stt_default_mismatch] ... workflow speechToText request schema declares "seedasr-auc" but hub catalog-defaults has "whisper-1".`
- 已回退：`cp /tmp/speechToText.ts.bak` 还原，`git diff --stat` 只剩本步有意的 13 行新增；回退后再次 OK。
- 另外三个来源在 `scripts/verify-cross-plugin-model-alignment.test.mjs` 的新用例里逐条注入反例（catalog-defaults → `media_route_mismatch`；
  schema / file-upload → `stt_default_mismatch`；声明消失 → `stt_default_missing`），全部实测变红。

### E4 放宽型 · `plugins/omnimux/src/media/stt.js` 的 `gatewayMembershipExempt` 豁免

- ① 被豁免场景确实变绿：清单声明 `whisper-1` 后，`guardSubmit({model:'whisper-1', operation:'speech_to_text'}, {snapshot: {models: []}, ...speechToTextMembershipOptions('whisper-1')})` → `ok=true`。
- ② 豁免范围之外仍然变红：`speechToTextMembershipOptions('seedasr-auc')` 与 `('doubao-asr-bigmodel')` 都返回 `{}`（未声明），
  同一个空快照下 `guardSubmit` → `ok=false code=not_listed reason=gateway-delisted`。
- ③ 额外证明声明是承重的：临时把 `gatewayMembershipExempt` 从清单里删掉后，既有
  `plugins/omnimux/src/media/stt.test.js` 大面积变红（`STT posts exact audio bytes and defaults to JSON after real model admission`、
  `STT whisper-1 passes SRT through the guard and preserves raw subtitle bytes` 等 12+ 用例失败）；还原清单后 26/26 绿，
  `git diff --stat` 只剩有意的那 1 行新增。
- 诊断可读：`createCatalogDiagnostics()` 的返回体新增 `membershipExemptions: [{modelId:'whisper-1', reason:'…2026-11-25…'}]`，
  由 `plugins/omnimux/src/catalog/cloud/diagnostics.test.js` 断言。

### E5 收紧型 · `scripts/verify-models.mjs` 的离线存在性检查（同时删除联网分支）

- 删除的联网分支（日落型，无「范围外」）：改造前 `resolveKey()` + `fetchPricing()` + `/v1/models` 无条件联网；
  改造后源码中不再出现 `fetch(` / `homedir` / 网关凭据读取（`grep` 结果为空），无密钥、无网络下 `exit=0`。
- 新增的离线存在性检查是可失败的收紧型：
  - 反例：临时把 `gemini-3.8-flash` 从随包快照里删掉（`/tmp` 备份）。
  - 造之前：`node scripts/verify-models.mjs` → `verify-models: ok (offline: modality + whitelist + reasoning + shipped snapshot)`，`exit=0`。
  - 造之后：`verify-models: not in the shipped snapshot (gemini-3.8-flash); ...`，`exit=1`，JSON 里 `"missing":["gemini-3.8-flash"]`、`"onShippedSnapshot":false`。
  - 已回退：`cp /tmp/pricing.json.bak` 还原，`git diff --stat -- …/bundled/pricing.json` 无输出（字节一致），再跑 `exit=0`。

## 不做什么

- 不把转写默认值收敛到「在售型号」——随包快照里没有任何转写型号，今天无解。
- 不改随包快照本身，不跑 `pnpm verify:models` 以外的联网校验，不发真实模型请求。
- 不给「静默丢型号」加比例阈值或自动放行通道：提交时比运行时严，任何在售型号消失都必须显式处理。
- 不重构画布侧镜像清单（`MODEL_CHANNEL_GROUPS` ↔ `channelGroups.ts` 的镜像清理是另一步）。

## 实现期偏离与例外

1. **`.github/workflows/quality-gate.yml` 增加一个测试文件到既有 `node --test` 链**：`scripts/verify-auto-serving.test.mjs`
   此前是 governance `manual`、不在 CI。要让新用例真正执行，唯一可行的路径是把它加进 CI 的测试列表并把
   `governance-manifest.json` 的分类改为 `ciRequired`（registry 用 `category-evidence-mismatch` 强制两者一致）。
   该文件属 §3.1 的 CI 配置面，需评审者单独确认；本步只做「把既有测试加进既有测试列表」的最小改动，不放宽任何
   门禁。
2. **`plugins/omnimux-workflow/src/workflow/speechToText/schema.ts` 无法被门禁直接 import**：Node 的 strip-only
   TS 模式拒绝 `errors.ts` 的构造函数参数属性。因此把默认值常量放到无副作用的
   `plugins/omnimux-workflow/src/shared/speechToText.ts`，由 schema 与门禁共同引用。
3. **`stt.js` 新增导出 `FILE_UPLOAD_MODEL` 与 `speechToTextMembershipOptions()`**：前者供门禁读取第四处默认值，
   后者把「清单声明 → SubmitGuard 选项」这一步变成可断言的决定，而不是散落在调用点里的三元表达式。
4. **`catalog-snapshot.mjs` 增加 `--baseline <ref>`**：把同一条严格校验（任何在售型号消失即拒）暴露给重新生成
   随包快照的人，离线、只读、不联网。
