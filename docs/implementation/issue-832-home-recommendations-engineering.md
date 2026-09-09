# #832 首页显式推荐配置：独立工程增量

## 2026-09-09 实际名单与新封面交付（取代下文临时空名单状态）

输入 HEAD `83ff6e88d2753693efeb184b0cffa6b0f9412752`，仍为同一任务树。首页实际入选 **1 项**：`sk-bggg-data-amazon` / `bggg-data-amazon`，名称 **BGGG Amazon Data · Amazon 评论采集**；全局精选 **49 项**。不凑16，不称评论优化；其他候选不新增推荐。仅本地源码及提交，未 push/merge/部署、未写用户 Skill 配置、未注入或执行采集。

### 准入与正式分发

- 读取本任务三个 home-recommendations 报告并采用用户最新“近似可用、缺失不展示”的决定。B/D/F 浏览器适配未核，其他不明许可内容不复制。
- A/J/K 的首页配置引用本身不会复制正文，HTTP404不能推出无权使用。但实际 `installGitBundle()` 会优先复制本机目录或下载子目录，既有 catalog/精选提交不含适用权利证明；现有资料中没有补足授权证据，故不新推荐，也不删除旧条目。没有把404当作唯一否决理由。
- E 从公开 `binggandata/bggg-skills@1034ee5805f3fd5b010a4f57affa4aa796ab75d5` 下载唯一包目录及根 LICENSE。逐文件 Git blob SHA 验证一致，外仓未改动。
- 使用**已有 bundled 完整目录机制**，不新增分发服务。旧 git 安装器优先本机浮动副本、只复制 subpath 遗漏根许可，且固定SHA被拼为 `origin/<SHA>`；本轮不扩改旧 git 安装行为。固定来源、改编说明写入包内 `PROVENANCE.md`，而非把浮动git安装伪称固定版本。
- 包内 `LICENSE` 保留 BGGG 根 MIT；`references/upstream_LICENSE` 保留抓取器 MIT，原blob分别为 `f7f6f5e831eaae0afea9565f47c5eaa66545c7fc` / `14fac913ccf80234b1848540089a3bbcb6e5283d`。插件 notices 链接两者，安装测试对全部文件逐字节比对。
- SKILL.md 仅本repo改编：明确 `SKILL_ROOT` 取安装返回/加载资源的绝对根，命令使用 `"$SKILL_ROOT/scripts/..."`，用户项目仍是数据 cwd；`run_batch.py` 用 `Path(__file__).with_name(...)` 定位同包 scraper。三个上游脚本原样保留，未执行。
- 运行要求保守声明 **Python 3.10+、标准库、命令执行与网络**；本地 Python 3.14.6 仅用于语法解析，不能证明客户端已供应Python。没有配置依赖、创建Python服务、调用Woot或其他采集端点。首次采集需用户目标授权和站点/数据权利检查。

### 新封面与最小接线

- 唯一入选E已加载 `skill-cover-generator`，调用 `image_generate(provider=gpt,size=1536x1024,quality=high)` 一次成功，失败0；每项最多3失败熔断未触发。
- 新封面 `catalog/covers/home/bggg-data-amazon.png`，最终1280×720，独立 `homeCover` 字段仅在默认首页映射为卡片 `cover`；分类/精选和旧字段不被覆盖。
- 技能说明将1536×1024误写为16:9；实际为3:2，本轮显式中心裁切再缩放到16:9，未改外部Skill。完整四段英文prompt、请求、路径及局限保存在同目录 `bggg-data-amazon.generation.json`。
- **provider证据差异**：请求gpt（工具文档为GPT image2偏好），返回只含图片路径，无实际provider/model/fallback回执；实际字段保持null，不声称已证明GPT最终执行。
- `handleIcon()` 原只允许平级图名；最小扩展仅允许可选 `home/` 一个固定子目录，不允许任意子路径或JSON。新增实际handler回归验证PNG字节及穿越/嵌套拒绝。
- 已通过 display_file 显示可解码PNG；画面能力主题为评论卡/星级和数据归档，不承诺改善评分。独立视觉签字由QA完成。

### 自检与回交

- 相对输入HEAD逐行对象比较：原 **310条catalog记录全部相同**，包含旧48精选；原 **48张封面逐字节相同**。只新增E，不修改此前三张图。
- 实际bundled安装测试仅写本任务插件内随机临时home并清理，验证11文件完整复制、两层MIT、三个脚本固定blob及重复安装幂等；不碰用户配置，不执行Python包。
- 三个脚本通过Python3.10语法AST解析；仅静态语法，不是采集端点验活。
- 首轮664项中663通过、唯一失败为旧49≠48计数断言，随真实新增精选修正；第二轮664/664通过。最终封面路由新增测试后 **665/665通过，0失败/跳过/取消**，工程离线 **IS_PASS: YES**；独立QA/真实UI未验，整体交付 **IS_PASS: NO**。
- 最终tarball SHA256：`b6293399b15bc50e9f50d3ff724038a0caf865f00f062eacfa2a8ca0b132ac7b`；18个关键资源/代码/notice逐字节验证通过。
- Stage 10/8通过、Slot1670文件0违规、boundaries2213文件通过、UI279视图0违规。一次误用不存在的 `verify-stages.mjs` 已定位package脚本并改跑 `verify-stage-contracts.mjs` 通过；一次在仓根npm pack因根无version失败，已改从market包目录成功打包。无门禁绕过。
- 完整最终日志在任务内 `.workbuddy/evidence/issue-832-qa/admitted-market-cover-final.log`；安装tarball和清单在同目录。npm pack使用 `--ignore-scripts`，不安装、不发布；包内资源与源逐字节核验。
- 全局一致性检查覆盖完整catalog→helper→真实UI卡片→icon handler、bundled安装目录、包files与notice；未改布局、安装交互或宿主配置。正式L2/ego/verify:live及独立QA未在本轮执行，不能以离线通过替代。
- 下一Owner：主理人将最终本地提交回交QA，验证一个真实首页推荐、新封面路由与旧交互。受管viewer依赖仍须按原依赖报告由环境Owner解除；不部署空或未验名单。

---

以下为83ff6e88之前的历史实现记录（其中空名单/48数值不代表当前状态）：

## 状态与范围

- 固定输入 HEAD：`1e4510308a2d2bfd0c079bf25659efad10b62f9c`；分支 `agent/market-skill-header-issue-832`，任务树 `.worktrees/skill-header-832`。仅本地提交，不 push/PR/merge/部署。
- 工程离线自检 **IS_PASS: YES**；独立 QA 尚未执行，正式 L2/ego-browser/verify:live 延续既有 viewer 兼容阻断，**整体 IS_PASS: NO**。未重启 Host/viewer、未修改共享 seed、官方包或外仓。
- 本增量只实现独立有序配置及发现行为。`homeRecommendations: []` 为临时待填状态，不代表原“16项上首页+专属封面”完成，不具备部署/归档条件。没有选择相似候选、伪造技能、生成封面或安装任何内容。
- 已全文读取增量 PRD、既有工程/独立 QA 报告，加载仓库工作流、market 开发规则及 UI 规范。当前明确禁部署优先于 UI 指南旧生产物化条款。

## 配置交接

唯一新增配置文件：`plugins/omnimux-market/catalog/skill-recommendations.json`。

| 字段 | 当前值与作用 |
| --- | --- |
| `featuredSkills` | 48 个真实 catalog ID 的有序数组，保留旧 `recommended=true` 全局精选，决定精选页/分类推荐展示顺序 |
| `homeRecommendations` | 明确空数组，后续按获准顺序填写真实 catalog ID；仅决定默认 discover/全部/无提交查询页的顶部推荐，不是搜索白名单 |

`catalog/index.json` 的 `recommended` 仍为全局精选资格权威；配置不是修改资格的替代入口。每个首页 ID 必须为 `kind=skill`、`recommended=true` 且存在于 `featuredSkills`。后续准入需同时维护 catalog 资格与有序精选列表，不自动精选或安装。

`validateSkillRecommendations()` 检查两个数组、重复/未知/非Skill/非精选 ID、首页不在精选列表及遗漏 catalog 精选；包测试对真实配置要求零错误。`resolveSkillRecommendations()` 在运行展示时按有序 ID 去重，忽略未知/非Skill/非精选项，绝不补位。空首页不回退全局精选，不渲染推荐区和占位卡。

配置验证属于离线包测试门禁；没有新增运营后台或宿主启动强制门禁。配置文件随已有 package `files: catalog` 打包，helper 的源与生成模块均导入它，无新增服务/API。

## 行为与最小修改

- `skill-picker-logic.js` 增加三个纯函数：验证、完整 catalog 解析、发现分区。首页/分类推荐不依赖搜索首屏、网络回退、分页顺序或 ratings 回填；搜索元数据只回填 rating/安装状态，不覆盖 catalog 身份、名称与封面。
- 无查询时以完整本包 Skill catalog 补足普通列表，与搜索结果按稳定 slug 去重；只扣除实际展示的推荐，因此非首页精选仍在全部页普通区，旧48也完整保留在精选/分类。
- 有查询时只呈现实际 API 搜索结果，全部搜索不再经过货架标签白名单；具体分类仍取交集，精选查询仍按 catalog 精选身份筛选。保留原 custom/workbuddy/skillhub 查询渠道和 payload；增加既有 Button 的加载更多入口使分页结果可达。
- `skill-plaza.js` 消费上述 helper，搜索标题与中英占位符区分全部/我的。仅显示未安装对推荐和普通区一致生效，并使用真实已安装列表回填。未变更 CSS、顶部布局、创建会话、Drawer、安装处理、我的 Skill catalog 权威判定。
- 旧两组 VM 测试仅补 `fmt`/`iconSrc` 展示依赖，顶部测试由精简 stub 改为真实 helper；旧 QA 安装失败/重试/精选断言全部保留。三处源码契约断言更新为新共享分区函数及有搜索时显示结果的新语义。
- 产品 PRD保持未提交、未编辑；本轮过程中另出现 `issue-832-home-recommendations-approved-list.md`，不属于本工程写入，未读取、修改、stage 或据此填名单；由主理人统一核对最新映射决策。

## 验证证据

| 检查 | 实际结果 |
| --- | --- |
| `npm --prefix plugins/omnimux-market test` | 最终 exit0；build + 662 tests / 662 pass / 0 fail / 0 skip / 0 cancelled |
| 新增推荐测试 | 8 项；真实配置48保留/空首页、验证诊断、有序去重未知不显示、首屏/乱序/回填、非首页保留、全库搜索、未安装过滤、实际组件空首页与精选48、真实搜索effect与分页（多个断言组成8个测试） |
| 定向推荐+旧交互 | 17/17，exit0，是662全包子集，不累加 |
| Stage | exit0；10 Stage / 8 sidebar targets |
| Slot | exit0；1670 client files / 0 violations |
| Plugin boundaries | exit0；2211 source files |
| UI gates | exit0；279 views / 0 violations |
| Registry | exit0；12 plugins consistent |
| `git diff --check` | exit0 |
| catalog/index.json、catalog/covers 对输入HEAD diff | exit0，无差异；旧48资格与全部旧图、前序三张图均未更改 |
| 源/生成 helper 行为一致性 | exit0；default discovery 与配置验证 deepEqual |

首次全包662中10失败均为VM缺展示依赖或原字符串断言；已按上述范围修正并全包重跑通过。曾尝试源/生成 helper 字节 cmp，因 TypeScript 输出分号/缩进正常不同 exit1，随后核实生成 import 路径并改用实际导入行为一致性检查通过。未忽略业务失败或修改旧 QA 断言制造通过。

原始测试日志：任务内 `.workbuddy/evidence/issue-832-qa/incremental-market.log`、`incremental-market-final.log`（最终摘要702–709行）。复用既有 npm package script，避免前序已证实的 pnpm 自动依赖重装，不执行依赖清理或外仓安装。构建按既有脚本生成 lib，仅提交 tracked helper 生成文件。

原 PRD SHA256：`ad138031680268427bf418aee9f0aae01f0be0e55c051e101898f8987c1d8295`。

## 一致性与后续 Owner

全局检查：helper 由既有 SkillShelf 注入；源/生成 import 均指向同一完整 catalog 与新配置；列表/详情/安装所需 catalogId、slug、name、description、cover 保留；无新增 hook 次序变化，无第二数据服务；全包和边界检查通过。

主理人下一步：独立 QA 审查本地增量；确认真实映射后另派填写 `homeRecommendations`、对应精选顺序与准入验证。封面字段/生成本轮未扩展，待真实映射与新图需求确定再实施。正式受管 viewer 和实际任务解析依赖兼容后，由运行 QA 按旧报告完成 L2/ego/verify:live；不能拿当前662离线通过替代浏览器证据或部署授权。
