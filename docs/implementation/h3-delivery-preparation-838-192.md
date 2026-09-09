# H3 #838 / #192 交付准备

采样：2026-09-09 11:41–11:44 Asia/Shanghai。结论：源码第二轮 PASS；可以准备两张 Draft PR，但尚不能标记整体验收完成或合并。本轮不 push/建 PR/merge/部署，不运行模型、收费或退款，不新建 Host。

## 身份与可提交内容

| 仓库 | 分支 / QA固定HEAD | fetched origin/main | 差异 |
|---|---|---|---|
| omnimux-ai/omnimux-dsh | agent/omnimux-h3-contract-fixes-issue-838 / `72b30196691b9e40439fe08b6c0674191d37e2f2` | `93a36e19e59fb8b7b7ee0ad32e08f46efe12f137` | 保存本轮文档前 ahead3/behind2；merge-base `867b192ecf6aa35be4e1639db7351a89bea782c7` |
| laozhong86/OmniMux | fix/h3-contract-fixes-192 / `6341b07b55569dbe90ec0dceff8b4525b199f7cc` | `795039a95dc2d4332360b1061141a20a93194e87` | ahead4/behind0 |

两仓 origin/HEAD 均指 main；`ls-remote --heads` 未发现上述任务分支，按 head 查询所有状态 PR 均为空。未改分支或 rebase。插件新增远端两提交仅涉及协作规范/auto-pipeline，与本任务改动文件无交集，但不得把旧固定SHA QA冒充最新合并候选QA。

1. **插件 Draft PR**：`fix(omnimux): align H3 media and catalog contracts (#838)`，base main，`Closes #838`。范围为 Hub guard、video-models、H3回归、跨仓fixture脚本、fal合同参考、两轮工程/QA证据及本准备文档；不夹带 #839 实现。三份未提交 QA 文件已逐一读取确认属于本任务，结论不改；日志按仓规则 ignored，不强行加入。
2. **网关 Draft PR**：`fix(fal): preserve billing CAS and ordered H3 contracts (#192)`，base main，`Closes #192`。范围为 relay GET快照/CAS边界、fal DTO/媒体/分辨率/轮询HTTP分类及回归、FORK_CUSTOMIZATIONS和工程说明，共15文件。两笔保护路径代码commit均带已有用户授权的 Core-Change-Approved trailer。
3. 网关 PR须保留 `.github/PULL_REQUEST_TEMPLATE.md` 全章节并披露 AI-assisted；人工撰写/确认项不可由Agent冒签。`pr-check.yml` 的 anti-slop 会检查模板并可能关闭PR；不更改检查或虚构人工参与。公共HTTP合同变化按网关AGENTS仍需 OmniMux-docs 中英与changelog配套，或用户明确延期；本轮未授权该第三仓写入，因此记录为交付gate，不扩树。

## 依赖实查与远端更新

[插件 #838](https://github.com/omnimux-ai/omnimux-dsh/issues/838) 和 [网关 #192](https://github.com/laozhong86/OmniMux/issues/192) 均 OPEN。原 #838只有跨仓依赖；#192正文链接待补、评论已有正确链接；两者均缺当前viewer阻塞。已更新两张本任务Issue正文并读回，保留原范围/QA历史，补充互相依赖、[#839](https://github.com/omnimux-ai/omnimux-dsh/issues/839) 环境依赖、固定SHA、脱敏失败证据与禁止合并/生产边界。未修改 #839 Issue或树。

#839仍 OPEN，任务HEAD `867b192ecf6aa35be4e1639db7351a89bea782c7`、9个未提交文件；指定证据目录没有找到该任务正式交付报告。其目标viewer版本 `0.1.1-omnimux.765.1`、tarball SHA256 `555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31` 来自Issue规格，仅是预期身份，不是已消费证明。

11:42只读实查Dev seed及h3-838-l2四份 source/installed viewer：版本全为0.1.0，lib/index.js SHA256全为 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，仍引用 installSettingsSection。seed只有旧 COMMITTED receipt `18dd9c91-5389-4370-9c3e-281d6a2a96bd`，request.version=0.1.0、afterDigest=`30c831e102da5e31ced561e3de7872cab317924a2aa159148b85e53fbef2c5c6`；任务profile无事务receipt。未发现可消费的新兼容目标，未执行未交付转换脚本。纳管不等于Host兼容。

## merge下游风险

两仓 fetched base 与任务HEAD的 `.github/workflows` 无差异，已核对全部workflow触发器。

- 插件唯一 `quality-gate.yml` 在PR/main push/merge_group运行静态QA、测试、构建和证据/标签投影；没有生产部署或正式发布步骤。main保护要求 `Static L0 QA & Tests`、strict=true、enforce_admins=true。rulesets查询为空；仓政策要求Merge Queue，不把无ruleset等同可绕过。
- 网关 `ci.yml` 在PR opened/synchronize及merged closed运行检查、build/test；main路径过滤push只有定价测试。Docker/App/Electron/CLI发布由tag或manual触发，GitCode/branch image为manual；没有merge直达VPS生产部署步骤。Docker tag/manual会写latest镜像，不能以普通准备授权触发。生产规则另要求显式blue-green入口。
- 两仓 repo hooks API返回空数组。网关main经典保护API明确404“Branch not protected”，补查有效branch rules为空；这是保护缺口而非操作失败待重试，不能借此跳过CI/core-change门禁。
- **限制**：未审计外部GitHub App、VPS定时拉取或遗留部署服务设置。因此只能结论“仓内CI未发现自动生产部署”，不能保证merge绝无外部生产影响。未来任何merge仍需确认外部部署链且当前用户明确禁止merge。

## 剩余gate与owner

1. #839 owner/主理人：交付正式兼容制品、目标COMMITTED receipt、source/installed内容身份及适用profile；Issue关闭本身不充分。
2. 主理人/QA：沿正规入口刷新h3-838-l2稳定依赖（单纯start不会刷新已有node_modules），保留唯一任务Hub link；已获初始化授权，不重复询问、不手改node_modules。核验当前HEAD、Host/port及有效.l2-dev.env后，ego同任务/Tab + shared verify:live完成无付费目录/768p/旧值提示/首帧及有序参考专项。
3. 主理人：未来发布Draft PR前按新base评估集成差异，按两仓政策核对真实required checks；本轮不重复已通过测试。网关CI未设置 `OMNIMUX_DSH_FIXTURE_ROOT`，跨仓测试默认skip；必须保留双SHA本地联测证据，不能把普通CI绿灯称为跨仓联测通过。
4. 主理人：协调公共HTTP文档配套/明确延期，保留真实模板声明；在上述gate未满足前不得ready/merge/关闭整体任务。生产、真实账务与付费生成不在本准备范围。

## 证据与保存

沿用 [第二轮QA](../../qa-evidence/h3-edward/REPORT-round2.md) 和 [已授权L2](../../qa-evidence/h3-edward/REPORT-L2-authorized.md)。三份QA新增文件为这两个报告及 `l2-authorized-start.json`；后者viewerSettingsImportFailure=false仅表示启动入口尾部未匹配错误，完整Host日志错误以L2报告为准。未经更改保存历史结论。

本轮仅运行Git/远端只读检查、Issue正文更新及文档完整性/差异检查；无源码测试重跑、无Host、无后台job。此文档所在新增commit仅保存证据，不改变QA固定源码身份；最终HEAD以提交后回传为准，避免自引用SHA。等待依赖沿用主理人既有单一续查机制，本子任务不创建重复计时器。
