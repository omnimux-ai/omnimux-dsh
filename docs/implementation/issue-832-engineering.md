# Issue #832 Skill 工坊工程交接

## 第二轮返修（2026-09-09）

- 固定 base `867b192ecf6aa35be4e1639db7351a89bea782c7`，返修输入 head `4cf79b2d47675f04bad1abb25097c19ff486b074`；当前 head 以 `git rev-parse HEAD` 为准。
- Q1：`skill-picker-logic.js` 从本包 catalog 建立 kind=skill 且 recommended=true 的稳定 slug 集合；我的 Skill 精选只按此权威集合判定，不依赖 listInstalled 缺失的 flags 或当前搜索页，未知条目即使自带推荐标签也不入选。生成的 `lib/client/skill-picker-logic.js` 同步提交。
- Q2：确认安装 catch 只保存原错误，不 mark、不关框；请求期间禁用按钮与关闭，失败后可重试，成功才标记安装并关闭。错误复用 sh-err 并加 role=alert。
- QA 原四项测试完整保留，仅追加两项直接回归：未知推荐/Tab/分类重入/列表刷新；失败错误呈现/重试清错/请求禁用/成功状态。
- `npm --prefix plugins/omnimux-market test` 最终退出0：654 tests、654 pass、0 fail/skip/cancelled。首次新增测试选择器误选 nav-tabs 容器导致653/654；限定原生 button 后全包重跑通过，未改原QA断言。
- Stage（10/8）、Slot（1670/0违规）、plugin boundaries（2210）、UI gates（279/0违规）均退出0；`git diff --check`退出0。
- Registry初次缺workflow dist；本地build-host首跑缺zod/@xyflow/react。任务树只读链接已有workflow node_modules后，正式build-host成功，仅生成忽略的dist/index.js，Registry 12插件全部通过。未修改workflow源码、共享依赖或外部仓库。
- 全局一致性检查：源/生成 helper 导入路径、SkillShelf调用、确认框props、原QA状态索引一致，相关全包构建与测试通过。工程代码自检 IS_PASS: YES；独立QA与ego尚未执行，不是整体放行。
- 本轮已收到正式L2凭据/settings整文件继承的明确任务授权；下文第一轮“未授权”仅为历史状态。正式L2启动结果见本节后续记录，浏览器验收仍由主理人派独立QA。
- 日志：任务内 `.workbuddy/evidence/issue-832-qa/round2-market-final.log`；未push/PR/merge/共享Dev或Prod物化。

### 第二轮 L2 实际结果

- 代码/测试提交：`95e127e7a64191265d70fb2e2cbfeb1733461023`。本报告后续提交仅文档；运行身份不宣称通过。
- 正式命令：`OMNIMUX_PLUGINS_DIR="$PWD/plugins" bash scripts/dev-env.sh start skill-header-832 omnimux-market`，退出1。已按授权复制Dev凭据和settings到任务私有根，未显示内容、未改来源、未发模型/付费请求。
- 私有根：`/Users/x/.dsh-dev/tasks/skill-header-832`；profile：`/Users/x/.dsh-dev/tasks/skill-header-832/profiles/omnimux-dev-skill-header-832`；SOURCE：本任务树 `plugins/`；仅 `omnimux-market` 为在研link。
- 分配 URL `http://127.0.0.1:44201` / PORT `44201`，不是可用服务。正式脚本完成受管seed克隆及私有依赖安装，保留viewer。Host未在20秒内监听；随后日志明确报 `failed to import loader entry viewer (@crosery/dsh-viewer)`，根因 `@deepseek-ai/dsh-settings` 不导出 `installSettingsSection`。
- Host PID文件 `99970`，2026-09-09 10:28检查该进程已退出，44201无listener；watch.pid不存在，watch未启动。没有创建伪成功 `.l2-dev.env` 或运行ego探针。
- DSH_SRC为正式脚本默认 `/Users/x/Desktop/Project/Github/deepseek-harness`，只消费未修改；未替换底座、未删除viewer、未绕过seed/闭包门禁。
- 任务job：bash-45（首次测试exit1，新增选择器问题）、bash-47（最终全包exit0）、bash-49（正式L2 start exit1），均已收集结束；无遗留活跃job/Host/watch。
- 启动日志：`.workbuddy/evidence/issue-832-qa/round2-l2-start.log`；Host日志留在上述profile的`host.log`，不得复制含认证信息的完整日志到报告。
- L2/ego状态 **BLOCKED**，整体 **IS_PASS: NO**。下一Owner主理人：协调viewer受管seed兼容性依赖完成后，派独立QA；QA从本任务树正式start重试、验证真实PID/端口后绑定当前COMMIT/SOURCE/PROFILE至`.l2-dev.env`，再执行同一ego任务的正式探针。不能以本地654通过替代独立验收。

## 第一轮身份与结论
- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/832
- Worktree: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`
- Branch: `agent/market-skill-header-issue-832`
- Base: `867b192ecf6aa35be4e1639db7351a89bea782c7` (fetched origin/main)。Head 以本报告所在分支 `git rev-parse HEAD` 为准。
- IS_PASS: NO（交付验收未完成；本地工程检查通过部分如下，L2/ego/独立QA未通过，不可发布）。
- 未 push、建 PR、merge、共享 Dev/Prod 物化；未派其他成员。主仓原有 workflow 两文件修改及临时脚本均未触碰。

## 实现
- `plugins/omnimux-market/src/client/skill-plaza.js`: 三层结构恢复；创建调用既有 createSkillSession，仅传 `/skill-creator` 预填，不改官方新会话流程；安装打开既有 InstallModal；分类与当前 tab/搜索共同筛选；tab 改原生按钮保证键盘可达。
- 同文件：InstallModal hooks 移到条件返回前，错误保留弹窗并显示原错误，不再在 catch 中伪装安装成功。没有另造上传或安装机制。
- `src/client/css.js`: 原生 token/32px按钮与输入、三层统一边界、有意义间距；容器不足380px搜索移到下一行，分类横向滚动；网格依据可用宽度自适应，不硬编码5列；标题/说明最多两行，推荐文本槽40+32px保证同排对齐，移除底部多余10px留白；普通卡片同样两行。
- `src/client/plaza-shell.js`: Skill 页隐藏插件自带空顶栏。孤立X属于此插件，其 handleClose 调用 `__omnimuxWorkbench.closeTab(PLAZA_TAB_ID)`，与宿主tab关闭目的地相同；保留非Skill页面旧行为，不改宿主。
- `src/client/i18n.js`、`apply.js`、`session-create.js`: 入口及工作台统一“Skill 工坊”，正文标题“Skill”，创建/安装按钮文案更新，保留Skill/我的 Skill原名。
- `src/client/skill-header.test.js`: 新增真实函数执行测试3项，覆盖创建预填参数、既有安装弹窗及分类位置、安装失败反馈；同步现有标题/CSS契约测试和 `src/tests/client-bundle.test.ts`，含构建生成的 `lib/tests/client-bundle.test.js`。

## 三张封面
仅更换 `plugins/omnimux-market/catalog/covers/` 下以下三个PNG，catalog元数据及48条推荐完全未改。

| 文件 | 资料依据 | 请求provider | 原始尺寸 | 最终尺寸/字节 |
|---|---|---|---|---|
| brand-promo-video-generator.png | catalog完整条目：品牌素材/目标→事实核验、创意、分镜、音画宣传短片 | gpt / image2 |1536×1024|1280×720 / 1329088|
| clip-export.png | catalog完整条目及 bundled SKILL.md：本地视频等→剪映/CapCut可编辑草稿 |gpt / image2|1536×1024|1280×720 / 1122028|
| dot-matrix-brand-wordmark-motion.png | catalog完整条目：Logo/品牌名/标语→点阵字形图与动效 |gpt / image2|1672×941|1280×720 / 842382|

三次生成调用各成功一次，未显式切换provider；工具返回仅文件路径，未提供实际服务provider回执，故实际服务provider无法独立核验。图像工具有内建fallback能力，不能以请求参数冒充实际provider证明。
用Pillow ImageOps.fit、LANCZOS、中心裁切后等比缩放，无拉伸。旧文件内容及100644模式由base Git保存，无额外备份。三图已通过display_file展示。构图分别强调品牌叙事、导出到分层草稿、可辨点阵OmniMux字形；无H3/MiniMax/无关品牌提示词。
全48文件尺寸检查发现旧45图并非数学精确16:9（34张1672×941、11张1248×832）；按本次仅三图边界未改其余图片，卡片仍以16:9+object-fit:cover显示。

## 本轮工程自检
- `pnpm --filter omnimux-market test`、`pnpm verify:stages`：入口因pnpm自动依赖检查尝试安装并触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，退出1。未允许purge共享依赖；改用同一package script的 `npm test` 和对应node脚本，未改测试或门禁实现。
- `npm test` (omnimux-market)：本轮实际构建+648测试，648通过、0失败、0跳过。旧645报告不作为本次证据；新增加3项。
- `node scripts/verify-stage-contracts.mjs`：退出0，10 Stage / 8 sidebar targets。
- `node scripts/verify-slot-contracts.mjs`：退出0，1670文件、0违规。
- `node scripts/verify-plugin-boundaries.mjs`：退出0，2208文件。
- `node scripts/scan-ui-gates.mjs`：退出0，279文件、0违规。
- `node scripts/registry-tool.mjs verify`：退出1，隔离树缺少无关workflow `dist/index.js`。未构建或复制无关产物伪造全仓成功。
- `git diff --check`：退出0。依赖只在本任务树建立链接，复用主仓现有node_modules，无安装/外部修改。
- 最后普通卡片CSS变更后 `npm run build && node --test src/client/skill-header.test.js src/client/skill-workshop-ui.test.js src/client/workbench-seat.test.js`：退出0，30通过、0失败、0跳过；这30项为全包子集，不累计成678项。

## L2准备与待独立QA
已阅读正式 `scripts/dev-env.sh` 和 plugin-qa，未启动Host。start第678行会调用ensure_task_credentials，第533行自动从Dev复制凭据。当前授权只允许准备L2，未覆盖凭据初始化；子代理不能扩大权限。主理人应取得该具体授权后在本任务树执行：

```sh
OMNIMUX_PLUGINS_DIR="$PWD/plugins" bash scripts/dev-env.sh start skill-header-832 omnimux-market
```

不使用git-wt.sh dev的旧外部路径推导，不移除viewer、不改共享seed、不写Prod。启动后按实际输出建立 `.l2-dev.env` 并核验COMMIT/SOURCE/profile/port/Host身份。

独立QA由主理人派发：
1. 同一L2/ego task执行正式verify:live与ego-live-qa.mjs；静态PASS不替代此证据。
2. 宽容器、分屏、375px，中英文/深浅主题检查边界与文本，分类横滚、无搜索重叠；完整48推荐遍历而非抽查。
3. Skill/我的Skill、分类、搜索的组合；返回全部恢复；详情完整标题/说明。
4. 创建一次及连点：当前工作区继承、只预填/skill-creator、无消息自动发出、原会话草稿/附件不丢、右工作台保持。
5. 安装入口关闭/重开、失败与校验；成功/确认链需授权范围内测试。既有InstallModal仅从文件名调用slug安装，并不上传文件内容，这是现存能力限制，不能把任意zip本地安装视为已实现。
6. 顶部宿主tab关闭/重开；插件隐藏X不影响关闭能力。

风险：L2凭据边界未解，viewer最新可运行状态未实测，registry缺构建物；本次不宣称浏览器或独立QA验收、不具备归档/上线条件。UI指南旧生产物化要求与当前明确禁部署冲突，按当前授权不执行。仓库workflow旧git-wt路径外置与用户内置约束冲突，实际使用git worktree add在.worktrees内隔离。
