---
issue: 3321
parent: 3301
status: implementing
risk-tier: R1
---

# #3321：阶段 C 的最小 C1 证据核心

## 目标与成功标准

只新增标准 Node 库模块，供后续已有运行器消费；本切片不改变现有运行器、CI 或合入许可，不代表阶段 C 完成。

- 固定显式真实 Git 根、base/head 与唯一 comparison；实际候选覆盖已跟踪、暂存新增及未忽略新增文件的原始字节、Git 可执行模式、链接文本和删除。内容摘要不含 HEAD、时间、暂存状态；前后扫描漂移拒绝。
- 重读目标提交对象的原始内容及模式才能建立内容等价映射；不接受调用者自报目标摘要，也不篡改旧快照。
- 输出排除仅接受固定运行目录中的本次精确原件路径与已有固定摘要路径；生成物沿现有分类规则。忽略目录中的旅程通过明确 extraInputs 单独固定，不能隐藏任意源码。
- 封套按白名单构造，具名、唯一、非空、严格布尔断言；区分 smoke/reproduction/task。必须检查实际完成、用例非零、零跳过、清理完成后才能通过；原件为受控相对路径真实字节摘要。
- 校验只证明声明完整性；执行来源由消费方独立观察传入，绝不从封套自称 runner 升级可信，也不授予任何权限。

## 边界与首版决策

实现只写本任务树 scripts/evidence-contract.mjs、此规格，以及主树唯一任务报告。无正式 *.test 写入、提交、远端、安装、真实运行、凭据、官方源码或全局配置访问。标准 Node 与本机 Git 是唯一前置条件；新用户缺 Git 或仓对象时明确拒绝，无开发机隐式服务或路径默认值。

首版采用同步只读 Git/文件操作和小白名单结构，不提供 CLI、通用依赖注入、任意源码排除、服务、签名或授权 token。非 UTF-8 Git 路径、gitlink、冲突、稀疏检出、启用的 clean/smudge/编码/text/eol/ident 转換、特殊文件明确 unsupported；不会执行过滤器。仅叶子链接读取链接文本，不沿其目标取字节。未知内嵌秘密不宣称已扫描，明确凭据文件/目录、私钥/.env 输入在读取前拒绝；token前缀的普通CSS/TS/说明不等于凭据，不能仅按前缀误拒或用任意源码排除绕过。

用途 history 校验完整性；candidate 必须由消费方提供当前独立快照；ci 必须提供独立 CI 上下文和观察来源。current-runtime 在 C1 未接入实际生命周期持有者，明确 unsupported，不凭 JSON 进程号伪造支持；pre-e2e 与输入关联复用留后续切片。

## 接口与风格

具名导出 captureCandidate、mapCandidateToCommit、sealEvidence、validateEvidence；ESM，内部 canonical JSON/domain-separated SHA256，错误只输出稳定原因码，不附源码、Git stderr 或秘密路径。关键输入/返回用 JSDoc。清理属于运行器，模块只记录结果，不接管资源。

## 结构与文档影响

源码位于 scripts/evidence-contract.mjs，此规格拥有本首切片使用约束；主报告保留实际检查、局限与父审查入口。既有活合同不改，消费者尚未接入，不冒称已升级行为。

## 验证策略与命令

在实现前运行内存导入/接口断言取得缺实现证据；实现后采用 Node 内联断言及任务树内自有临时 Git 仓，finally 校验真实路径再清理。夹具不执行受禁同步脚本或内容。覆盖原始二进制、模式、删除、新增、链接、提交映射、错根、捕获与运行漂移、输出原件变动、额外旅程、断言空/重复/非布尔、范围、检查跳过/零用例、清理失败及来源不升级。

可执行最小静态命令：node --check scripts/evidence-contract.mjs；git diff --check。正式定向测试和 test:gates 按用户限制由父代理后续按 QA 运行，本代理不运行含外写的完整 gates、不制造覆盖率或完整产品验收结论。

## 不覆盖与后续

未覆盖运行器接入、构建/安装/加载身份、实际浏览器/进程存活、真实 CI/MQ、独立评审认证、授权撤销、依赖闭包、恶意改动后恢复的原子快照攻击。父代理独立读差异和实际运行后决定整合；正式测试保护解除前不绕路写测试。

## C1 实施约定与本轮实证

捕获必须显式传 root/base/head，head 须对应当前 HEAD；完整候选树与 extraInputs 分别摘要。输出精确路径限制为 `.workbuddy/evidence/contract/<taskId>/<runId>/` 下单层 json/log/txt/png 原件，及现有三个固定报告摘要；不接收目录、通配符或代码文件排除。映射传 `{root,base,head}`，严格重读提交 blob 与模式、base 内容及额外输入；返回新附件，不改历史快照，也不让旧报告直接适用新 HEAD。Git 无可选写锁、继承 GIT_* 清空、禁止过滤和 replacement objects；全局 Git 配置与全局属性不读取。首版 Git 需要支持 `check-attr --source`，不支持时拒绝而非降级。

封套只接受固定检查字段 name/scope/required/status/reason/exitCode/tests/skipped/assertions 与固定清理字段 name/owner/status/reason；消费者提供 requiredChecks 与 expectedAssertions，不能自封预期断言。producer 仅声明，独立 observation 需绑定 taskId/runId/reportDigest；stub 或 imported-artifact 不升级来源。history/candidate/ci 校验不产生许可；current-runtime/pre-e2e 明确 unsupported。候选用途首版要求完整快照一致，不能只给同内容摘要替代当前身份；提交等价映射的消费接入另切片。

本轮先最小端到端，随后短内联自有临时 Git 夹具分别通过 7 项捕获检查、13 项封套断言、7 项 CI/范围断言、8 项 Git/额外输入断言与 5 项最终闭环断言；全部零跳过、临时目录确认删除。两次较长命令因 hook 超时未执行，不计通过；一次非法字节文件名夹具创建遭文件系统拒绝，随后用自有 Git index 原始路径记录验证非 UTF-8 拒绝。未编写正式测试、未跑 test:gates 或实际运行器，不据此声称阶段 C 或合入验收完成。完整事实与未知见主树唯一实施报告。
