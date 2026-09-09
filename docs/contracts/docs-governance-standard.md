---
title: "开发文档工程治理合同"
id: "contract-docs-governance-standard"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
tags: ["governance", "documentation", "engineering-standards"]
supersedes: []
superseded_by: null
related:
  - "docs/README.md"
  - "docs/contracts/plugin-git-pr.md"
---

# 开发文档工程治理合同

本合同规定 `docs/` 的权威边界、分类、metadata 与生命周期。它不把现有脚本没有实现的检查描述成硬门禁。

## 事实与权限分开仲裁

发生冲突时先判断冲突属于哪一类：

| 类型 | 仲裁原则 |
|---|---|
| 当前实现/运行事实 | 以当前 runtime、磁盘、代码、配置和可复现测试为准；文档与事实不符时记录 drift 并修正文档或实现 |
| 能力声明 | 同时核对代码路径、`capabilities.md` 与当前证据；历史日志、截图或 briefing 不能证明当前能力 |
| 行动权限/风险 | 以当前用户指令、适用 `AGENTS.md` 和 [plugin-git-pr](plugin-git-pr.md) 为准；代码“能执行”不代表 Agent 获得执行权限 |
| 架构意图 | 现行 contract 优先于旧 ADR/spec；ADR 保留决策理由，不覆盖后续 living contract |

因此不得用 “Live Code > rules” 推导权限。脚本存在、按钮可点、token 可用或测试可通过都不会授予 push、merge、生产、重启、管理或支付权限。

## 文档层级

| 层 | 路径 | 用途 |
|---|---|---|
| L0 | `AGENTS.md`、`CONTEXT.md` | 仓库常驻硬边界与术语 |
| L1 | `docs/contracts/`、`docs/capabilities.md`、`docs/harness-pin.md` | 现行契约、能力状态与上游锚点 |
| L2 | `docs/decisions/`、`docs/specs/` | 决策理由、产品和技术规格 |
| L3 | `docs/evidence/`、`docs/qa/`、`docs/logs/`、`docs/implementation/`、`docs/briefing.md` | 具时效的证据、实施过程记录与跨会话记忆 |
| L4 | `docs/references/`、`docs/archive/` | 外部参考与历史封存 |

层级不是“一切内容”的单轴覆盖关系：L0/L1 可以定义政策，runtime/code 只能证实现状；L3 证据必须带目标、版本和时间，过期后不得冒充当前事实。

## 目录与命名

| 路径 | 命名与维护方式 |
|---|---|
| `docs/contracts/<topic>.md` | kebab-case，无日期前缀，living |
| `docs/decisions/YYYY-MM-DD-<topic>.md` | 带日期，合入后保留历史 |
| `docs/specs/YYYY-MM-DD-<topic>.md` | 带日期；原型放 `docs/specs/prototypes/` |
| `docs/evidence/`、`docs/logs/` | 带日期，记录当时目标/SHA/环境 |
| `docs/implementation/` | 保留既有路径；实施报告通常为 `type: log`、L3，不因包含方案描述而成为现行规格 |
| `docs/qa/` | 保留既有路径；验收报告为 `type: evidence`、L3 |
| `docs/standards/` | 保留既有路径，按内容职责使用既有 type/层级：现行规则为 contract/L1，操作参考为 reference/L4，验收记录为 evidence/L3；不新增 `standard` type，也不凭目录名提升权威 |
| `docs/references/<topic>.md` | 外部资料和业务参考 |
| `docs/archive/YYYY-MM-DD-<topic>.md` | 已废弃历史及替代关系 |

文件名使用小写 kebab-case；目录 README 例外。不要把运行时状态、开放 PR 清单或临时队列写进 living contract。

## Frontmatter

所有非转发桩 Markdown 第一行使用 YAML frontmatter。当前 `doc:lint` 强制字段是 `title`、`id`、`type`、`status`、`authority`、`date`；living 文档还应维护 `updated`。推荐完整格式：

```yaml
---
title: "文档标题"
id: "contract-unique-slug"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-05"
updated: "2026-09-05"
authors: ["x"]
subsystem: "global"
tags: ["topic"]
supersedes: []
superseded_by: null
related: []
---
```

允许的 `type` 以 `scripts/doc-lint.mjs` 中 `VALID_TYPES` 为准，允许的 `status` 以 `VALID_STATUS` 为准，`authority` 为 L0–L4。不要把希望未来支持的字段写成当前校验器已强制。

## 生命周期

- Contract 持续演进；接口、环境变量、存储路径或权限合同变化时，同一交付中更新对应 contract。
- ADR、evidence 与 log 记录历史。后续变化新增文档或明确 supersede，不改写旧证据使其看似证明新状态。
- 归档时记录 `supersedes` / `superseded_by` 并更新相应索引。需要保留历史链接时使用转发桩；不要为无引用的草稿机械制造桩。
- Briefing 是记忆，不是事实或权限真源；与当前代码、runtime、AGENTS 或 contract 冲突时不得继续引用为结论。
- 新增长流程应进入按需 skill；contract 只保留政策、接口、fail condition 与发现指针。
- `status: accepted` 表示文档/决策的生命周期，不代表实现完成或测试 PASS；验收结论必须读取正文中的适用证据。`updated` 使用实际修订日，不冒充历史测试日期。

## 变更事件与文档责任

每项变更在已有任务或交付报告中用一句“文档影响”说明：已处理的真源路径与必要发现入口，或无文档影响的具体理由；不另建表单或审批制度。

| 变更事件 | 同一交付中的真源处理 |
|---|---|
| 接口、事件协议、配置或权限变化 | 同步所属领域 contract；权限政策仍由适用 AGENTS 与 plugin-git-pr 仲裁 |
| 用户可见行为、入口或验收方式变化 | 同步所属规格/合同及必要发现入口；验收规则引用 plugin-qa，实际结果写入证据报告 |
| 能力状态变化 | 核对当前代码与证据后同步 `docs/capabilities.md` 及所属能力合同，不以实施日志替代能力真源 |
| 架构决定被替代 | 保留原 ADR 的 ID、日期、作者与历史正文，更新生命周期、`superseded_by` 和对应索引，链接已有后继；没有后继时明确缺口，不虚构关系 |

实施者识别影响并同步文档；领域 owner 负责技术内容；QA 负责核对事实、证据及未覆盖项；主理人协调跨域真源与交付完整性。沿用 [Issue 生命周期](agent-issue-lifecycle.md) 的职责划分，不要求每次另组固定团队，也不以协调结论替代独立最终验收。

## 报告证据身份

新报告正文须列明目标、base/head SHA、dirty 状态与涉及路径、执行日期和环境、实际命令及退出码、结果与证据位置、未完成项及下一动作；只写 frontmatter 日期不足以绑定证据。适用验收要求仍见 [plugin-qa](plugin-qa.md)，按合入前静态/测试/独立评审与合入后适用 Dev 验收分别记录；CI `qa:pass` 不代表 Dev 通过。纯文档、流程、脚本无需 App 物化，不创建合入前独立运行环境。

历史报告仅补可核实信息；未知的 SHA、环境、时间或退出码明确标为未知/未记录，不猜测、不拿本次环境回填。未执行、不适用、warning 与失败分别报告，不将其写成 PASS；历史证据和 `accepted` 状态均不能证明当前运行验收通过。

## 当前工具真实能力

| 命令 | 当前实际行为 | 不包含 |
|---|---|---|
| `pnpm doc:lint` | 扫描 `docs/`；检查父目录文件名规则、必填 frontmatter/枚举、Markdown 相对链接的**目标文件存在性**、关键索引存在；违禁术语只告警 | 不校验 `#anchor`，不检查文档是否被索引/孤岛，不验证正文语义 |
| `pnpm doc:index` | 改写/生成目录索引 | 不是只读校验；普通文档修改不得为了“验证”而全仓重生成 |
| `pnpm doctor` | 执行 `scripts/dev-doctor.sh` 的环境检查 | 不运行 `doc:lint` |
| `pnpm verify:all` | `verify:gates` + 测试 + registry + doctor | 当前不运行 `doc:lint`；`verify:gates` 的 `doc:pairing` 不是 doc lint |

文档任务应显式运行并报告真正执行的检查。不能把 `doctor` 或 `verify:all` 成功写成 Frontmatter、死链、锚点或孤岛检查成功。新增锚点/孤岛/required-doc gate 需要单独实现和评审；本合同不宣称其已存在。

## 维护最小流程

1. 修改文档真源和必要索引，避免复制同一政策或完整 SOP。
2. 检查所有新增相对链接的目标文件；若依赖并行子任务，明确记录待集成目标。
3. 运行 `pnpm doc:lint`；只在明确要求更新生成索引时运行 `pnpm doc:index`。
4. 报告实际命令、退出码、告警和未覆盖项，不把 warning 或未实现检查写成 PASS。
