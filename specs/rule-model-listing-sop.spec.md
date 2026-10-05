# spec: 中枢模型上架全链路闭环流程写入 AGENTS.md

## 背景
用户指出：当明确要求中枢接入新模型并上架发布到消费端/画布时，Agent 之前由于默认上下文缺少该流程说明，仅停留在 draft 草稿状态并加入白名单，导致画布侧因未 verified (op.listed=false) 而无法展示。
为防止未来再次发生多轮排查，必须将从草稿到真实生成验证、状态升格、清单与渠道配置、门禁物化的全链路五步闭环流程写入中枢边界契约与 AGENTS.md。

## 改动范围
1. `plugins/omnimux/AGENTS.md`：在 Hard bounds 中增加「Model listing lifecycle」条目，明确要求上架指令必须一条龙走完定义、真机探针、verified 升格、消费端配置与门禁物化。
2. `docs/contracts/model-list-ownership.md`：在 Cross-plugin closure 章节细化 listed: true 准入机制与五步操作顺序。

## 验收标准
- `node --test scripts/verify-agents-md.test.mjs` 全绿（行数与体积在预算内，链接与锚点有效）。
- 提交 PR 并完成合入。
