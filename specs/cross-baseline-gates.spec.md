# 已复现综合检查基线维护 #1772

## 目的与授权
用户明确选择单独修复阻碍 #1762 交付的既有检查问题。仅文档配对元数据、过期打包声明、预设与 Alpha 测试夹具及测试工具环境；不新增产品功能、不改变生产发布策略、不物化生产。基线 e56cfb313。

## 成功标准
双语配对经过语义核对后元数据检查通过，不只刷新哈希。包声明须与真实打包内容一致；缺少真实必需资源仍失败，不能空文件或忽略检查。专家预设测试验证共享生成器真实输出的 prefix 与 persona 且无 text。Alpha 夹具覆盖现有政策名单，保留开发包含和生产排除反例。工具定位允许真实 Node 与 corepack 分处不同目录、保持禁网，不硬编码个人路径或跳过失败。

## 设计选择
优先修过期声明和测试夹具，不改生产行为。viewer 若可证明 assets 与 assets/** 打包完全等价，则优先简单目录声明，避免增加通用 glob 实现；否则先失败边界测试再最小检查器修复。未知资源用途先调查再决定。预设优先真实产物断言而非调用者源码字符串匹配。

## 范围
A：browser/viewer 双语 sidecar 与必要配对文本；apps/forms/viewer package files 字段；仅必要时 verify-package-files 及测试。
B：verify-agent-presets.test.mjs、sync-release-policy.test.mjs，必要测试 helper 工具定位；生产 writer、sync脚本与名单只读。
不改 #1762 排序源码，不复制 #1768 Stage 修复到此树，不改官方 DSH 或共享配置。

## 实施计划
先在独立树复现定向红证据；核实文档语义、包用途与真实writer/fixture；逐项最小修复并定向绿；独立审查；父代理整合后完整 test:gates、Stage 及最终排序浏览器验证。全部通过前 PR1770 保持草稿。运行日志与未知写 .agent-reports/；Git 与合入归父代理。

## 验证命令
node scripts/verify-bilingual-docs.mjs
node scripts/verify-package-files.mjs
node --test scripts/verify-package-files.test.mjs scripts/verify-agent-presets.test.mjs
node --test scripts/sync-release-policy.test.mjs
pnpm test:gates
完整环境固定已存在真实工具及离线 Corepack 缓存，记录实际版本；检查失败不得以其他检查成功替代。

## 持久资产准备补充（父代理批准）
根 package.json 的 test:gates 与 check:package-files 仅前置 `node plugins/omnimux-forms/scripts/build-client.mjs &&`，保留后续检查原样，并将新增 package-preparation.test.mjs 加入 test:gates 原测试列表持续执行。复用现有构建复制真实示例，不修改检查器或共享配置。新增 scripts/package-preparation.test.mjs：验证两个入口必须先准备；隔离缺产物目录运行真实构建后源/目标媒体 SHA 相等；真实示例源缺失必须构建失败，不能执行后续检查。测试先红后绿，临时目录自清理，不运行完整门禁、不执行 Git 写入。实施报告位于 .agent-reports/preparation-implementation.md。

## 风格与边界自审
沿用现有 Node 测试与配置格式；不用新依赖或泛化框架。范围是候选上限，不要求全部改动。无待用户决定的常规实施项；若需新增功能、真实配置或发布，停止该动作报告。
