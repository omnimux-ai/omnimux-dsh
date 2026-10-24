# 中枢模型目录云端化 P0：网关快照解析、缓存与差异报告（影子模式）

- Issue: #3691
- 日期: 2026-10-24
- 上游只读真源: `OmniMux@e6e206fdb`（`scripts/ops/config-baseline/{channels,models,options}.json`，2026-10-19~23 从生产 MySQL 拉取）
- 中枢基线: `origin/main@9a2cb8ad7`（本工作树基线）
- 计划来源: `deliverables/omnimux-catalog-refactor/PLAN.md`（P0 阶段）

## 1. 背景

中枢的模型目录 100% 来自打包静态数据（`src/catalog/specs/*.yaml`、`contract/dispositions.json`、`contract/auto-serving-manifest.json`、`serving/channel-groups.js`、`pricing-calculator.js`）。运行时从不请求网关目录接口，也没有目录缓存。

后果（`docs/evidence/2026-10-21-hub-gateway-drift-audit.md` + 本轮调研）：

1. 近 90 天 63 个提交只是在追网关变化，中位 16 个文件、78% 跨两个以上插件。
2. 手抄的网关分组/价格表有三份（中枢 `channel-groups.js`、画布 `channelGroups.ts`、查看器 `MediaViewerComposerData.js`），第三份不在门禁内且已漂移。
3. 漂移会直接变成用户可见错误：查看器把 `seedance-2-5` 480p 标成「标准版」并设为默认；画布语音转写默认 `doubao-asr-bigmodel` 已不可达。

## 2. 本阶段方案（P0 影子模式）

只建立只读的「网关视图」能力，**不改任何用户可见行为**：

1. `src/catalog/cloud/snapshot.js`：把两种上游输入归一成同一个网关视图——`/api/pricing` 响应（P1 运行时用），以及网关配置基线三元组 `channels.json`/`models.json`/`options.json`（离线可用）。归一化是纯函数，含稳定序列化与内容摘要。
2. `src/catalog/cloud/store.js`：按视图键（匿名 / 账号）落盘 `snapshot.json` + `meta.json`；内容哈希做变更检测；**空列表或解析失败视为「无信息」，保留上一份**（沿用 `catalog/composer-sync.js:89-93` 的失败语义）。
3. `src/catalog/cloud/diff.js`：网关视图与中枢现有目录（`buildModelCatalog()` 输出）算差异，分类为 `unreachable`（中枢在售但网关无启用渠道）、`gatewayOnly`（网关在售但中枢未上架）、`groupMissing`/`groupExtra`（分组漂移）、`priceChanged`。
4. `src/catalog/cloud/report.js` + `scripts/catalog-diff.mjs`：CLI 输出文本/JSON 报告，支持 `--hub-catalog <json>` 注入历史目录快照，用于复现历史漂移。
5. 不接入运行时路径、不改 `modelCatalog.list()`、不改合同与门禁。回滚 = 移除新模块与脚本。

## 3. 验收

- `pnpm --filter omnimux test` 通过，新增 `src/catalog/cloud/*.test.js` 全绿。
- 用网关现役基线跑差异报告，能复现 2026-10-21 对账记录的两类事实：中枢在售但网关不可达的模型、以及分组漂移（`seedance-2-5` 等）。证据写入 `docs/evidence/`。
- 影子模式下 `buildModelCatalog()` 输出与改动前逐字节一致（对比 `--hub-catalog` 与实时投影）。
- `pnpm verify:model-contracts`、`pnpm check:boundaries` 通过。
- 本阶段代码不发起任何网络请求。

## 假设

- 网关 `channels.json` 中 `status=1` 的渠道生成 abilities，`/v1/models` 与选路都以 abilities 为准；因此「模型可达」= 存在 `status=1` 渠道绑定该模型（分组维度取该渠道的 `group`）。
- 配置基线三元组不含 `supported_endpoint_types` 与逐模型 `contract`，只有 `/api/pricing` 才提供；因此基线视图必须显式记录这两项为未知，不能当成「网关不支持」。
- `/api/pricing` 的 `pricing_version` 是网关侧写死的常量且无 ETag，所以变更检测必须由本模块对归一化内容自算摘要，不能采信该字段。

## 证伪方式

- 若用 2026-10-19/20 的基线快照 + `471206b64` 时期的中枢目录跑差异，得不到对账文档记录的 9 个不可达模型，则归一化或差异判据有误（对照物是 `docs/evidence/2026-10-21-hub-gateway-drift-audit.md` §2 的模型清单）。
- 若把网关视图换成空列表后 `store.acceptRefresh()` 仍覆盖了已有快照，则失败保留语义被破坏。
- 若在测试环境拦截 `fetch` 后仍能完成差异报告，说明本阶段没有引入网络依赖；反之说明 P0 越界到了 P1。
- 若 `buildModelCatalog()` 的输出在接入本模块前后出现差异（用同一基线的 JSON 对比），则影子模式被破坏。

## 旧标准变更

- `plugins/omnimux/src/catalog/cloud/snapshot.test.js` :: `splits multi-group channels and string model lists`

原断言：`assert.deepEqual(snapshot.models[1].enableGroups, ['economy'])`。

必须改的理由：该用例由本任务同一轮新增，夹具里 `m2` 同时被 `group: 'default,economy'` 与 `group: 'economy'` 两条启用渠道绑定，正确期望是两个分组；原期望写错，会把「多分组渠道合并」这一被测行为判成失败。属于本任务新增用例的期望值纠正，不涉及任何既有用例的削弱。

新期望证据：修正为 `assert.deepEqual(snapshot.models[1].enableGroups, ['default', 'economy'])`；`m1` 仍断言 `['default', 'economy']`，`retired` 仍不出现在结果中。修正后 `node --test plugins/omnimux/src/catalog/cloud/snapshot.test.js` 全绿。
