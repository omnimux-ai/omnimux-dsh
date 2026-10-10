# 可信检查：模型契约完整性自证与渠道限制对账（#3248）

## 目标与授权
父任务 #3247。用户于 2026-10-08 批准完整实施计划，本子任务只修门禁与测试，不改变运行时模型/渠道能力、不生成媒体、不物化或重启桌面应用、不改生产。

## 当前缺陷与用户旅程
参考素材缺陷未被合入前检查发现：路由文件为数组、文本契约根为对象，现有两个解析器都返回空列表，真实文件测试仍返回通过；槽位折叠测试自行制造结果，没有调用检查器。渠道镜像只比较价格/稳定性，不比较输入与参数限制。
旅程：维护者改一项模型输入声明或渠道限制 → 运行真实检查 → 报告源、匹配、实际检查和明确未配对条目 → 合入前拦新增错误或结构异常，不把旧语义欠账当成功能力。

## 可测验收
1. 复用 verify-modality-matrix 的 parseRouteModalities，读取结构变化、缺文件、空模型源必须 throw。
2. 文本契约用正式加载器，提供真实文本模型集合；合法 fixture 与真实加载结果行为一致。
3. 每条 route 多模态模型恰好归 matched/unpaired；新增 unpaired 必失败，唯一历史未配对源须精确身份、原因和Issue基线，已配对后基线必须删除；matched 恰好参与 deep check；必需 catalog/matcher/layout/whitelist 上下文缺失是不可基线化失败。检查数不得静默归零，合法空产品范围须显式声明且不能对有匹配源跳过。
4. 保持既有语义检查，输出结构化 code/modelId/operationId 身份；旧提示词来源/组合声明缺口采用精确身份、原因、Issue基线。新增发现失败、陈旧/重复/无原因基线失败，结构错误不准豁免。不为了变绿改变规则适用范围。
5. 真实文件测试断言计数和覆盖，不只 assert ok；无 vision、槽位容量/格式缺失、缺 prompt声明、画布空槽反例调用真实 checker。
6. 调用 CLI 报告 source/matched/checked/canvas/unpaired/known/new/stale 计数；无上下文或配置错误返回非零退出码。
7. verify:model-contracts 链与 test:gates 接入检查/测试；两文件由manual升为ciRequired。已有约束不放宽。
8. Cross-plugin channel constraints deep equal 与字段顺序无关；新增/删减嵌套参数、图片上限差异可判红，等值不同键序通过。

## 产品基线
门禁依赖本仓真实路由声明、契约、画布公开消费数据和本地依赖；无凭据无网络生成。读不到源明确失败，不采用开发机profile、代理或模型服务兜底。

## 实施边界
write scopes：scripts/verify-multimodal-contract-completeness.mjs 及其 test、scripts/verify-cross-plugin-model-alignment.mjs 及其 test、scripts/governance-manifest.json、package.json，以及现有CI命令接入必要位置。父任务中枢/消费端改造不混入；#3244 未提交工作树不可改。
历史语义缺口单独跟踪Issue，不伪造其已修。全仓扫描仅报告无关项，不扩大修复。

## 检查命令
在本任务工作树执行：node --test scripts/verify-multimodal-contract-completeness.test.mjs scripts/verify-cross-plugin-model-alignment.test.mjs；pnpm verify:multimodal-contracts；pnpm verify:cross-plugin-models；pnpm verify:model-contracts；pnpm test:gates；git diff --check。保留真实退出码、用例数、已知问题明细；不自动跑无关全仓套件。

## 风格与文档
使用ESM、明确参数和返回类型JSDoc、具名错误、无静默catch成功。旧状态不改写为PASS。规则说明保持在本门禁文档与任务规格，不扩写根AGENTS，不触及UI无需浏览器。CI wiring 使用现有 verify:model-contracts 入口，不创建第二执行清单。

## 回退与完成
回退整个PR即可恢复检查行为，无用户数据迁移和运行期变化。需负向对照、独立评审、required CI 与Merge Queue，确认实际MERGED后scripts-only收尾。此阶段不等于参考图产品修复完成。
