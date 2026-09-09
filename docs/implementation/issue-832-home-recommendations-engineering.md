# #832 首页显式推荐配置：独立工程增量

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
