# Issue #832 Skill 工坊工程交接

## 身份与结论
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
