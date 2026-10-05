# 上游哨兵：模型目录比对 + 零成本链路探针（Issue #3097）

## 目标

把「上游改名/下线/渠道异常」这类不在代码里的故障，从「用户先发现」变成「哨兵先报警」：定期比对上游模型清单与本地三处登记，差异即报。

## 现状

- 已发生案例：上游把 `index-tts` 改名 `indextts-2` 并下线旧名，中枢目录/厂商表/提交守卫仍登记旧名，任务失败由用户任务日志先发现（10-04 #3063）。
- 现有 `verify-model-contracts` 只做离线契约静态校验，不与上游真实清单比对。
- `omnimux models` 可直接取上游清单（JSON 数组）。

## 改动范围

1. 新增 `scripts/upstream-sentinel.mjs`：
   - 输入：`--offline`（跳过探针，只比对目录，供无网/CI 用）、`--report-dir <path>`（默认 `.agent-reports/upstream-sentinel`）。
   - 步骤：① `omnimux models` 取上游模型 ID 集；② 读 `plugins/omnimux/src/catalog/contract/dispositions.json`（dispositions[].id）、`auto-serving-manifest.json`（models[].id / productId）、`plugins/omnimux/src/vendors/*.js` 里出现的 `"[a-z0-9-]{4,}"` 候选 ID；③ diff：`local-only`（本地登记但上游无，需人工确认下线/改名）、`upstream-only`（上游有但本地未登记，评估接入）、`probes`（零成本越界请求期望 4xx，证链路通；5xx/超时标 unreachable）。
   - 探针只发**故意越界参数**（如 `model=__sentinel_invalid__`）触发 400，不发真实生成请求，不产生计费。
   - 输出：`.agent-reports/upstream-sentinel/<YYYY-MM-DD>.md` + `.json`；`local-only` 非空或探针 unreachable → exit 1；clean → exit 0。
   - 依赖注入：`createUpstreamSentinel({execImpl, fetchImpl, readImpl, now, uuid})`。
2. 新增 `scripts/upstream-sentinel.test.mjs`：无差异→exit 0；local-only 非空→warn exit 1；探针 4xx→pass、5xx→unreachable。
3. `governance-manifest.json` 登记两脚本（manual）。
4. `docs/contracts/plugin-qa.md` + `AGENTS.md`：「除视频生成外，图片/音频等真实任务验证对 Agent 放行；视频生成需任务级特批」落字。

## 边界

- 哨兵只读上游清单与发 4xx 校验探针，不提交真实生成请求、不改任何登记文件（只输出报告供人工/任务处理）。
- 视频生成真实验证红线落字，不在本票实现视频验证。

## 成功标准

- 人为把 `dispositions.json` 加一个不存在模型名，哨兵检出 `local-only` 并 exit 1；
- 探针 4xx 判连通、5xx/超时判 unreachable；
- 测试绿、`git diff --check` clean、AGENTS.md 不超预算。