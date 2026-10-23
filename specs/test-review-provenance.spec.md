# 《独立评审 Agent 来源证明：旧测试标准变更的自治通道（Spec）》

- **状态**：**用户已授权实施（"执行方案 2"）**
- **生效工作树**：`.worktrees/common-test-review-provenance`
- **生效分支**：`agent/common-test-review-provenance`
- **归档路径**：`specs/test-review-provenance.spec.md`
- **前置事实**：拦截规则由 `cf51789d8`（PR #3579，2026-10-21，Closes #3539）引入；该 PR 自述"改写既有断言本次保守拒绝，**后续可单独设计**"——本规格即该后续设计。

---

## 一、目标与非目标

**目标**：让"改行为的人"不再是"改判据的人"，同时**不要求人类介入**。旧断言期待值变更可被放行，当且仅当该变更由**另一个 Agent 会话**（`DSH_SESSION_ID` 不同）独立落笔，且判据来源可回放。

**非目标**：不新建人类批准令牌系统；不允许删除/改用具名用例（`test-case-removed-or-renamed` 维持拒绝）；不放行新增执行风险；不改变"业务源码改动需任务规格"这一既有门禁。

---

## 二、机制

1. **身份信号**：PreToolUse hook 读取 `process.env.DSH_SESSION_ID`。实测：子 agent 会话获得**独立** id（`d302ea21-…` ≠ 主会话 `session-c36b153c-…`），且 hook 进程由宿主派生、其 env 不受被拦截命令内部赋值影响。
2. **编辑账本**（hook 写入，agent 不可伪造来源）：hook 在每次 `edit|write` 命中业务源码时，向 `.dsh/agent-edit-ledger.jsonl` 追加 `{at, sessionId, path, afterDigest}`。该文件由 hook 写入；agent 虽可写该路径，但账本记录的是 hook 自己观察到的 `sessionId`，不是命令参数。
3. **评审存证**：独立评审会话执行 `node scripts/attest-test-review.mjs --file <test> --before <sha256> --after <sha256> --spec <path> --evidence <path>`。脚本只从 `process.env.DSH_SESSION_ID` 取身份（**不接受任何 `--session` 覆盖**），校验 `--before` 等于该文件当前内容摘要、`--after` 等于评审者打算写入的内容摘要，然后把 `{at, reviewerSessionId, file, beforeDigest, afterDigest, specPath, specDigest, evidencePath, evidenceDigest}` 写入 `.dsh/test-review-attestations.jsonl`。
4. **放行判定**：hook 处理 test 路径的 `edit|write` 时，若 delta 含"既有断言指纹缺失"，则查存证：
   - 必须存在一条存证，其 `file`/`beforeDigest`/`afterDigest` 与本次"文件现状 → 拟写入内容"精确匹配；
   - 存证的 `reviewerSessionId` 必须**等于**本次编辑会话的 `DSH_SESSION_ID`（存证只能被其作者会话使用）；
   - 且该 `reviewerSessionId` **不得**出现在账本中任何"写入被评审业务文件"的 `sessionId` 里（作者不得自审）；
   - 三者同时满足 → 放行**仅** `test-assertion-removed-or-rewritten` 这一项；用例名删除、新增执行风险等其余判定不变。
5. **审计留痕**：每次放行在 `.dsh/test-review-attestations.jsonl` 追加一条 `used` 记录（含编辑会话、文件、前后摘要、命中的存证 id），使"谁在何时用哪份存证放行了哪次标准变更"可回放。

---

## 三、不变量（Invariants）

- INV-1：无存证时行为与今日完全一致（改写即拒绝）。
- INV-2：作者会话无法用自己的存证放行自己改过的业务文件的判据。
- INV-3：存证只能放行它所精确描述的 (file, before, after) 三元组，不能泛化到其它文件或其它内容。
- INV-4：新增用例、追加断言、新增安全 import 的既有放行语义不变。
- INV-5：既有 `scripts/test-authoring-inspection.test.mjs` / `scripts/guard-anti-cheat.test.mjs` 断言全部保持（只允许追加断言）。

---

## 四、假设

1. 子 agent（`subagent` / `spawn_teammate`）与主会话拥有不同的 `DSH_SESSION_ID`，因此"独立评审"可被机械区分——已实测确认（见 §二.1）。
2. hook 进程的 `DSH_SESSION_ID` 来自宿主派生时的环境，被拦截的 bash 命令内部对同名变量的赋值不会污染 hook 自身的身份判定。
3. 账本与存证文件只作为"来源证明"使用，不构成执行沙箱：它们防的是"同一会话自证自批"，不防"agent 直接改 guard 源码"。
4. 评审者会话的输入可以被人为限制为"规格 + 旧行为证据"，但机制无法证明它没看过作者实现；因此本机制提供的是**职责分离**，不是"独立复核质量"的保证。

## 证伪方式

1. 若在**同一会话**内先写业务源码、再自行存证并改写断言仍被放行 → INV-2 不成立，机制失效。
2. 若**不存证**直接改写既有断言被放行 → INV-1 不成立，等于回退成"随意改写"。
3. 若存证 A 能放行文件 B（或不同前后摘要）的改写 → INV-3 不成立，存证可被泛化滥用。
4. 若删除具名用例名、或新增执行风险（`eval`/动态成员等）因存证存在而被放行 → 非目标被突破。
5. 若既有 guard 测试出现任何失败（说明改动削弱了既有标准）→ INV-5 不成立。
6. 端到端反证：在"作者会话 + 独立评审会话"的真实两会话流程下走完一次断言期待值变更，且无人类介入；若必须人类落笔才能通过 → 方案未达成目标。

---

## 五、验收用例

1. **AC-1 无存证**：作者会话改写既有断言 → deny（`test-assertion-removed-or-rewritten`）。
2. **AC-2 自审**：作者会话写业务源码后，自己存证并改写该业务文件对应测试的断言 → deny（作者不得自审）。
3. **AC-3 独立评审**：评审会话（不同 sessionId、未写过该业务文件）存证后改写同一断言 → allow。
4. **AC-4 摘要不匹配**：存证描述的是另一份 `after` 内容 → deny。
5. **AC-5 用例名删除**：即使有存证，删除具名用例 → deny。
6. **AC-6 追加覆盖**：新增用例、追加断言在任何情况下仍 allow（不回归）。
7. **AC-7 审计**：每次放行落一条 `used` 记录，含存证 id 与前后摘要。

---

## 六、新用户基线

纯仓库内门禁脚本改动，不依赖本地模型服务、开发端口、开发 profile 或绝对检出路径。全新用户 clone 后 `pnpm test:gates` 即可复现全部判定；无存证目录时按 INV-1 退化（拒绝），不会静默放行。

---

## 七、残留风险（必须随 PR 一并评审）

1. **guard 自身可被 agent 修改**：`scripts/guard-anti-cheat.mjs` 不是 test 路径，本机制挡不住"先放宽 guard、再改断言"。唯一兜底是 PR 代码评审 + 既有 guard 测试（受 RULE-01 保护、只能追加）。
2. **存证内容自述**：评审者是否真的只看了规格与证据，机制无法证明；本机制只保证"身份不同、内容精确、可回放"。
3. **跨工作树**：账本/存证位于 `.dsh/`（不入库），因此判定是**本机会话级**的；跨机器或清空 `.dsh/` 后存证消失 → 退回 INV-1 拒绝（fail-closed，可接受）。

---

## 八、验证计划

```bash
node --test scripts/test-authoring-inspection.test.mjs   # 既有断言保持 + 追加新用例
node --test scripts/guard-anti-cheat.test.mjs
pnpm test:gates
node scripts/test-change-review.mjs scan . origin/main    # 评估域变更清单（供评审）
```
