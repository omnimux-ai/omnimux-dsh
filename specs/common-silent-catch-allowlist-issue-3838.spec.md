# Spec: silent-catch 增量检查不读 allowlist（#3838）

- Issue: #3838
- 风险级别: R2（门禁脚本；影响所有交付的豁免路径，可逆）
- base: `origin/main` @ `a643e6829`

## 1. 目标与用户故事

维护者视角：门禁提示「确属刻意吞错时写入 `scripts/silent-catch-allowlist.json`」，那写进去就必须真的生效。

用户故事：Agent 遇到 `new-silent-catch` 阻断 → 确认是刻意吞错 → 按提示写 allowlist（path + rule + line + reason）→ 再次 commit 能通过，且该豁免只作用于被点名的行。

## 2. 根因（实测）

`scripts/lib/silent-catch-delta.mjs` 是增量检查实现，但它**完全不读 allowlist**：

```
$ grep -n "loadAllowlist\|allowlist" scripts/lib/silent-catch-delta.mjs
（无输出）
```

导出函数只有 `readBlobsAtRef` / `resolveBaseRef` / `compareHits` / `newSilentCatchHits`，无豁免过滤。

`loadAllowlist()` / `entryMatches()` 定义在 `scripts/verify-silent-catch.mjs`，但那是**全量扫描**路径；`guard-quality-loop.mjs` 走 delta 增量路径，两条路径独立，豁免只在全量路径生效。

实测证据：PR #3810 处理合并冲突时按提示写了 2 条 allowlist（`AssetsStage.jsx` 559/560，SC2），`loadAllowlist()` 校验通过（2 条、0 错误），`git commit` 仍报同一阻断。

## 3. 实现设计

`newSilentCatchHits()` 在返回前过滤掉 allowlist 命中的条目：

- 复用 `scripts/verify-silent-catch.mjs` 已导出的 `loadAllowlist()` 与匹配口径（`path` + `rule` + `line`），不复制第二份实现。
- 过滤只作用于 `hits`（新增命中）；`beforeHits` / 基线比对逻辑不动。
- allowlist 文件缺失或 `entries` 为空 → 行为与现状一致（照旧阻断）。
- allowlist 非法（JSON 坏 / 缺字段）→ 沿用 `loadAllowlist` 返回的 `errors`：不得静默放行全部，按现有故障策略处理并在输出里可见。

## 4. 范围 / 非目标

范围：`scripts/lib/silent-catch-delta.mjs` 的豁免过滤 + 对应单测。

非目标：不改 SC1/SC2 判定口径；不放宽无理由豁免（`reason` ≥8 字、`line` 必填仍由 `loadAllowlist` 强制）；不动存量代码；不改全量扫描路径。

## 5. 验收标准（可观察）

- [ ] 有 allowlist 且命中 → 该条不进 `hits`，`ok: true`。
- [ ] 有 allowlist 但未命中（行号或 path 不同）→ 仍进 `hits`，`ok: false`。
- [ ] 无 allowlist 文件 → 行为与现状一致。
- [ ] allowlist 非法 → 报错可见，不放行全部。
- [ ] `pnpm test:gates` 通过；新增断言通过。

## 假设

- 假设 A：`newSilentCatchHits()` 的调用方（`guard-quality-loop.mjs`）只关心 `hits` 数组是否为空，因此在函数内部过滤即可生效，不需要改调用方签名。
- 假设 B：`loadAllowlist()` 可被 delta 模块直接 import 而不产生循环依赖——`verify-silent-catch.mjs` 不 import `silent-catch-delta.mjs`（当前依赖方向是 delta → verify）。
- 假设 C：行号绑定足够稳定——同一文件里两处相同形态的 catch 按 `path + rule + line` 可区分；行号漂移会让豁免变成僵尸条目（`loadAllowlist` 的 stale 机制可发现），这是刻意的严格设计。

## 证伪方式

- 证伪 A：发现调用方还读取了 `hits` 之外的字段（如 `beforeHits`）并据此判定 → 改为在调用方过滤，或在 delta 内保留原始 `hits` 到另一个字段。
- 证伪 B：import 后出现循环依赖或模块初始化错误 → 把匹配逻辑抽到独立小模块，两边共用。
- 证伪 C：实测发现行号漂移导致豁免频繁失效、维护成本高于收益 → 改为 `path + rule + bodyKey` 匹配（delta 已有 bodyKey 归一化能力），并在 spec 记录理由。

## 8. 证据计划

- 单测：`scripts/silent-catch-delta.test.mjs`（若存在则补充，否则新建）覆盖上述 4 种情形。
- 门禁：`pnpm test:gates`。
- 实机：在 PR #3810 的合并冲突场景复跑一次 commit，确认 allowlist 生效后不再阻断。

## 9. 文档影响

`docs/contracts/anti-agent-fake-completion-guard.md` §3.2.1 若描述了豁免路径，补一句「增量与全量两条路径共用同一份 allowlist」。
