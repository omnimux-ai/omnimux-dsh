# #832 首页推荐增量独立 QA

## 结论

- **Routing Decision: Engineer。源码验收 FAIL；L2 / ego-browser / verify:live BLOCKED；整体 IS_PASS: NO。不可 qa:pass、合入放行或宣称16项完成。**
- 固定 head：`c4418ef2ad5bee8d6356200094e1972d83a78087`。增量比较 base：`1e4510308a2d2bfd0c079bf25659efad10b62f9c`；原顶部实现基线为既有QA记录的 `867b192ecf6aa35be4e1639db7351a89bea782c7`。本轮审查用户指定本地SHA，不fetch、不切换分支。
- 时间：2026-09-09 12:01–12:07 Asia/Shanghai。完整读取增量PRD、approved-list、engineering、既有QA及dependency-status，按用户最新的“近似、真实名称、去重、缺失不展示”验收。
- 第一轮完整市场包 build/test：665/665通过，0失败/取消/跳过。第二轮针对审查发现的跨层分页风险新增离线反例：1项，0通过/1失败。共执行666个不同用例，665通过/1失败；没有在新增测试后声称完整包仍665全绿，未跑第三轮。
- 覆盖率：未测量，不虚报百分比。VM/hook和handler调用均不是浏览器/正式运行证据。

## QH1 — P1：全库远端搜索第二页永久丢失

**交 Engineer 处理。**

- 源码：`plugins/omnimux-market/src/skill-aggregate.ts:88–100,127–133`，`aggregateSkillSearch()`；消费方为本次新增 `src/client/skill-plaza.js:588` 的“加载更多”。
- 上游每次固定 `offset: 0`，且 `limit` 被clamp至80。然后对合并结果做 `merged.slice(offset, offset + limit)`。当搜索仅有160条远端结果、每页80时，第1页正常；UI要求offset80时，后端仍取远端首80条，再slice80，得到0条。`extraRemote=80`又让hasMore保持true，后续点击仍空页。
- 独立测试 `src/client/home-pagination.qa.test.js` 使用实际聚合器和withDefaults，仅注入可正确按offset分页的远端服务；不访问网络、不篡改真实catalog或home配置。预期第2页80条，首slug remote-80、hasMore=false；实际第2页0条。失败：`AssertionError [ERR_ASSERTION]: second page lost; upstream requests=[{"offset":0,"limit":80},{"offset":0,"limit":80}]`，`0 !== 80`，测试第24行。
- 工程原有分页测试只验证UI发出offset80；响应stub仍是同一条结果，未检查真实聚合器能否交付下一页。因此665通过不能证明跨层分页通过。
- 聚合器缺陷是基线已有，本次加载更多使其可操作，且直接违反本轮明确要求的全库搜索分页，不归因为新增首页名单本身。
- 最小修复方向：让聚合器能够取得所需的远端窗口，并正确处理本地/远端合并去重、total/hasMore；不能只取消80上限、删除测试、隐藏“更多”或把搜索收窄为首页名单。修复验收至少覆盖远端>80、混合本地/远端去重、末页及无重复/遗漏。

## 已通过的独立核对

| 面 | 实绩与限制 |
|---|---|
| 数量与身份 | 旧310是**全部catalog记录**，不是310 Skills；现311总catalog / 193 Skills（旧192）；首页1 / 全局精选49。唯一新增为 `sk-bggg-data-amazon`，slug `bggg-data-amazon`，BGGG Amazon Data · Amazon 评论采集。 |
| 配置 | shipped配置零验证错误；默认只读显式首页；有序解析、重复/未知/非Skill/非精选拒绝与展示容错、空名单不回退均有通过测试。 |
| 发现/分类 | 首页1+普通192；精选49；分类精选沿全局资格；搜索不注入推荐、不限制货架标签。只看未安装同时作用于两区。分页跨层例外见QH1。 |
| 旧交互 | 原 `skill-header.qa.test.js` 的我的精选稳定slug、安装失败不伪成功、错误保留与重试等测试仍通过；旧顶部创建入口及不自动发送相关既有测试包含于665。真实点击时序、DOM、草稿/附件保护及宿主tab仍待L2，不代签。 |
| 旧资源 | 用git show读取base并逐对象比对，310条旧catalog对象全部相同；48个旧cover文件逐字节相同，含此前三张变更图。 |
| bundled | 真实installItem向包内随机临时home安装11文件，逐字节一致、重复安装幂等，通过。无用户Skill写入，不执行采集。 |
| 双MIT与provenance | LICENSE与references/upstream_LICENSE的固定Git blob分别为f7f6f5e831eaae0afea9565f47c5eaa66545c7fc、14fac913ccf80234b1848540089a3bbcb6e5283d；安装测试通过。PROVENANCE记录1034ee5805f3fd5b010a4f57affa4aa796ab75d5来源、改编与未执行限制。 |
| 脚本与依赖 | SKILL.md要求从已安装资源根解析绝对SKILL_ROOT，命令引用该根；run_batch用__file__定位同包脚本。Python3.10+/命令执行/网络明确为环境前提，不声称宿主供应或Woot验活。其他BGGG包为可选而非自动调用。 |
| homeCover路由 | 默认首页覆盖card.cover，精选/分类不覆盖旧字段；format.iconSrc编码目标至/omnimux-market/icon，host注册该真实handler。handler单测返回与PNG相同字节及image/png；../、嵌套目录、JSON被400拒绝。仅允许固定home/可选前缀的白名单，无任意路径扩展。不是实际HTTP/浏览器验收。 |
| 归档完整性 | 对工程现有tgz全部216个普通文件逐一对比当前源码/本轮重建产物，全部一致（不只18个关键文件）。归档SHA256 `b6293399b15bc50e9f50d3ff724038a0caf865f00f062eacfa2a8ca0b132ac7b`。本轮没有重打包/安装插件/发布。 |

## 新封面与能力表述

- 已用display_file打开独立 `catalog/covers/home/bggg-data-amazon.png`，工具确认可解码PNG、1280×720、923006字节；封面主题为评论卡、星级符号及数据归档，不是评分优化/全量采集仪表盘。没有生成或改图。
- 卡片与包内范围明确Amazon US书面评论、JSONL及结果窗口限制，不承诺完整QA优化报告、全部评分、自动提高评分或端点可用。文件展示不是实际卡片尺寸下的视觉验收；宽屏/分屏/375px、中英/深浅、截断/详情、实际图片路由仍未验。
- generation.json记录一次请求、0失败及中心裁切；这是工程生成回执记录，不是本轮重新生成。请求provider=gpt；actualProvider/actualModel均null，**实际provider未知**，不把请求偏好或文件观感当实际服务证据。

## 正式viewer依赖：仍未变化，不重启

只读核对正式seed `/Users/x/.omnimux-dev/profiles/omnimux` 与任务profile `/Users/x/.dsh-dev/tasks/skill-header-832/profiles/omnimux-dev-skill-header-832` 的manifest、snapshot及installed入口：

- 四处viewer仍0.1.0，manifest依赖仍 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`。
- 四处package.json/index/client SHA256仍分别：`e84a7b50cb13e63ec39cef7cc5d132e3e922bdf6405a246723e02c067d0d4df7` / `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a` / `ef581017c94a3fdee31d20742201c2886458b69218f6c315b95b18be1ef7c548`，与旧报告完全一致。未发现正式兼容制品已进入seed的实物变化。
- 任务viewer实际resolve settings仍是 `/Users/x/Desktop/Project/Github/deepseek-harness/packages/settings/settings/lib/index.js`，SHA256 `bb4bee8b1772c59b52c5b89fc5464a09a5ef6f23dfbcaa93b1b84c53ae8a43ec`。viewer第3行仍导入installSettingsSection/settingsNamespace；settings第610行不导出二者。
- seed解析settings指向已安装OmniMux Dev.app，其路径/哈希不同；不能据此宣称任务L2已兼容。没有加载官方模块执行、改pin、切换Host或修改官方包。
- 本轮没有重新审计journal/receipt；现存入口未变化即不满足启动条件。未借用#839任何未发布成果，未复制候选包、未改seed、未刷新/删除任务根，未启动/重启任何Host，未创建pending探针。
- L2授权沿用，不再以bootstrap未授权为阻断。阻断Owner为正式viewer依赖负责人：交付正式受管兼容seed及可核对receipt/实际任务依赖；然后QA按既有#832授权用正规新私有根启动，ego-browser+verify:live同次身份验收。未依赖Issue关闭作为通过证明。

## 命令与证据

- `npm --prefix plugins/omnimux-market test`：exit0，665/665；日志 `.workbuddy/evidence/issue-832-qa/home-independent-round1.log`。
- `node --test plugins/omnimux-market/src/client/home-pagination.qa.test.js`：exit1，0/1；日志 `.workbuddy/evidence/issue-832-qa/home-independent-pagination.log`。
- Stage 10/8、Slot1670文件0违规、boundaries2213文件、UI279视图0违规、Registry12插件均输出PASS；`git diff --check`通过。组合命令最终exit0，各门禁输出均明确成功。
- git/归档逐对象及字节核对exit0；未测全仓测试覆盖率。
- QA只新增本报告、上述反例测试及任务内日志；原有两个未跟踪产品文档保持不动。业务和tracked构建内容未变。未commit/push/PR/merge/部署，未修改外仓/官方/seed。

## 后续Owner

1. Engineer修复QH1并回交固定新head及报告；本次最多两次测试执行已结束，不在当前轮循环返修。
2. 依赖Owner正式纳管兼容viewer；运行QA在真实条件成立后接续L2。源码修复通过也不能替代运行验收。
3. 当前无后台作业遗留、无原生定时唤醒工具、未建立持续轮询。主理人统一承接返修与依赖，不宣称自动等待或可归档。
