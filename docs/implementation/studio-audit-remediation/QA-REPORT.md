# Studio 整改独立 QA 报告

## 结论

**FAIL；IS_PASS: NO；SendTo: Engineer。** 离线新增对抗测试找到可复现源码缺陷，不仅是缺浏览器证据。正式 L2 / ego-browser 验收另为 BLOCKED，不可将静态检查、jsdom、内存构建或工程声明替代为 Host 通过。

- 审查人：Edward / 独立 QA；日期：2026-09-09 Asia/Shanghai。
- 固定 base：`93a36e19e59fb8b7b7ee0ad32e08f46efe12f137`。
- 固定 target：`b62414c6785f85155798e94c5b48378da7e3466b`，开始/结束均相同；本地指定 SHA 审查，未 fetch。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`。
- 仅新增 QA 测试/报告/日志。未改产品源码、官方 DSH、依赖源码、主仓原型、旧软链目标；未 install、push、merge、启动 Host、访问凭据或物化 Dev/Prod。
- 当前 QA 新文件被仓库忽略规则覆盖，`git status` 空白不意味着没有新交付物；未改 exclude、未强制纳管。

## 阅读与身份

完整读取主仓审计219行、修订设计341行、原型4442行、PRD80行；读取全部插件实现与6份原测试，以及工程 REPORT/L2-PREPARATION、plugin-qa合同、正式 dev-env 与 live-stage-contracts 相关路径。使用 code-review-expert、dsh-plugin-dev、omnimux-repo-workflow、ego-browser skills。历史记忆仅用于定位，未继承 PASS。

| 输入 | SHA256 |
|---|---|
| architecture-audit.md | ce90c59fc8355fbf4faf96d34b040d426f5c1d882e05a42a5ab18b3570a6f7a5 |
| system_design.md | 968661ae9b49ff45a98a3313dd2c4ca623a673305e814d8191038a6300431397 |
| index.html | 736590102d8559b3d04055c30d7d7ad0c2211733ad4b2a897916807e789daf8e |
| tests/independent-qa.test.mjs | d86717f14a7b22cfac032b30638e5c38dcdc449a066a20922ce6be7b7015d3fa |

## 实际执行证据

### 第1轮（未进入第2轮，无源码修复）

`pnpm --dir plugins/omnimux-studio test`：**29 tests，22 passed，7 failed，0 skipped，exit1**。

原工程20项独立重跑20/20；新增9项2通过7失败。原始输出：同目录 `QA-round1.log`。Coverage未测量，不编造百分比。新增测试为Node/VM/jsdom离线单元/依赖打包复现，非浏览器Host。

- `node scripts/verify-plugin-boundaries.mjs`：exit0，2234 sources（含新增QA）。
- `node scripts/verify-stage-contracts.mjs`：exit0，11 Stage / 8既有targets，**不含Studio**。
- `node scripts/scan-ui-gates.mjs`：exit0，295 views / 0违规。
- `git diff --check`：exit0；仅检查tracked diff，不证明ignored QA文件或产品可用。
- 按原 build-client 相同esbuild配置在内存重构建，**175319 bytes**，与现有lib/client.js逐字节一致，SHA256 `03e069766d081d9c8a37f9dbf3595d5f3c78f2b71049ce9af30e80c8fb08f757`。未覆盖产品构建输出。
- 未重跑全149 gates。工程128/149、与base共享21失败是输入报告证据，不升级为本QA独立通过；本轮源码缺陷与这些环境gate失败无关。

## 必修发现（源码路径均相对插件根）

### Q1 / P1 — 打包依赖在inject之前注入全局样式且无释放（F02/F11/F12）

**位置**：`src/client/StudioStage.jsx:2`、`components/DraftWorkspace.jsx:2`等顶层`dsh-ui-kit`导入；`scripts/build-client.mjs:6-10`将kit打入bundle；`src/client/index.js:9-19`只能管理Studio自己的style。

真实锁定kit的`lib/index.js:28-40`在模块求值时append style，不返回disposer。QA06使用实际kit而不是工程lifecycle测试中的空替身，模拟inject尚未满足依赖：**期望0 style，实际21**。缺依赖后仍有CSS副作用，卸载registry/locale/Studio style不回收这些标签；重复加载不同bundle实例还会重复注入。选择器为全局`.dshUk-*`（并有kit动画），不受Studio根约束。不能据此声称宿主body已发生视觉变化；亮暗实际污染仍待浏览器，但无样式副作用/释放合同已明确不成立。

建议在本插件内收敛到真正可局部管理的组件/样式消费路径，不修改外部kit仓库或官方包。修复后以真实bundle重测缺依赖及10次加载/卸载，不只测替身。

### Q2 / P1 — cancel回调重入导致双退款及终态改写（F06/F10）

**位置**：`src/client/studio-store.js:108-127,141-148`。

QA04：adapter.handle.cancel同步报告failed；cancelTask先调用handle.cancel，onResult看见pending退17点，再使用调用前task快照退款17点。**初始3463，提交3446，取消实际3480，期望3463**；failed还会被覆盖为cancelled，违反终态规则。

当前默认MockAdapter.cancel不回调，因此正常演示点击未证明必现；这是明确定义adapter seam的竞争错误，独立注入即可复现。应在外部可重入调用前完成取消仲裁/abort或原子终态转换，并只由获胜路径退款。

### Q3 / P2 — 稀疏数组绕过文档及结果校验（F07/F10）

**位置**：`src/client/editor-document.js:14-23`、`src/client/studio-store.js:114-126`。

QA01：`parts = new Array(2); parts[1] = textPart('text')`，validateDocument返回true而不是false。QA07：batchCount4后adapter返回`results:new Array(4)`，`.every`跳过空洞，**状态completed而不是failed**，无任何真实result仍扣4点。当前UI生成的是稠密数组，不将此描述成外部网络攻击；这是已公开校验接口和未来输入边界未闭合。需验证每个索引确有合法值，不仅length/every。

### Q4 / P2 — request字段完整性与模态不变量未校验（F10/F13）

**位置**：`src/client/studio-store.js:38-46,76-90,103-107`。

- QA02：reference仅含slot/kind/source/fixtureId，缺id/fileId/name/mime，提交仍ok并扣点；与types和完整引用快照合同冲突。
- QA03：updateDraft('video',{mode:'image',…图片model/spec})可将video槽中的draft.mode改为image；路由取方法参数mode，结果kind/过滤取draft.mode，产生不同语义。
- QA08：未知video submode不报错，隐式落入edit allowedSlots并接受。

应限制patch可变字段，验证mode/submode及Reference完整类型/身份，拒绝时保留旧草稿或至少原子拒绝提交。三个复现均是直接调用公开store接口，不声称当前按钮会主动发畸形patch。

### Q5 / P2 — 原型主页场景筛选交互丢失（F09/F13，静态确定）

**位置**：`src/client/StudioStage.jsx:69-70`，`src/client/mock-data.js:112-168`保留type但视图直接map全部；没有场景筛选状态或入口。

原型`index.html:4202-4212`明确场景chip及按type过滤；修订PRD:65保留主页场景语义、仅要求不要替代图片三维筛选。当前图片三维过滤通过，但主页场景筛选被删，不属于去全局顶栏或纠正Mock声明的必要变化。应恢复局部场景筛选或取得明确删减裁决；不能称原型交互全保留。图片示例页也仅展示样例而无装配正文入口（StudioStage:82），与视频/主页不一致，工程应按原型逐项核对。

## 条件通过与尚未确认

| F项 | 本轮判断 |
|---|---|
| F01 | 离线条件通过：无第二套顶栏；真实chrome待L2 |
| F02 | FAIL Q1；宿主computed style待L2 |
| F03 | 局部class/sticky/nowrap可静态确认；320/768/1200布局待L2 |
| F04 | tuple及两cwd×两session/repoRoot隔离、并行scope任务/余额离线通过；Host切换待L2 |
| F05 | Mock文案/禁用未实现操作/独立媒体error代码存在；真实媒体与下载待L2。mediaState仅组件局部，store Result状态不同步设计 |
| F06 | FAIL Q2；标准fake clock暂停剩余/迟到丢弃通过 |
| F07 | FAIL Q3；工程真实React+jsdom Enter/IME/退格测试通过，但未模拟实际CJK输入法或完整粘贴/选区矩阵 |
| F08 | store主区/dock同源及返回保留通过；真实close/重开/刷新/焦点待L2 |
| F09 | 精确12/4/6菜单与三维AND过滤通过；Q5主页交互缺失 |
| F10 | FAIL Q2/Q3/Q4；正常batch4/冻结/余额边界/100UUID通过 |
| F11 | FAIL Q1；实际0.18.0 sidebar回调形态只读核对，冷启动未通过 |
| F12 | FAIL Q1；仅替身10轮Tab/locale/registry清理通过，不能覆盖实际kit |
| F13 | FAIL Q4/Q5；types不是runtime验证；实际灯箱焦点待L2 |
| F14 | 条件通过：锁定依赖可解析及175319字节内存重构建；没有独立重做clean install，工程frozen install证据仅引用 |

ScopeRegistry每scope仅一个visible布尔，无多view引用计数。当前锁定sidebar single去重跨主/底部/浮窗（lib/client.js:1723-1727），未证明同scope双视图是常规可达，因此不夸大为已复现跨scope泄漏。普通UI关闭会传sessionId/cwd（15628-15634）；但公开closeTab省略scope仅传sessionId（1772-1775），插件scopeKey返回null，不能清store。应在Host生命周期矩阵加入程序关闭与移动/重挂载场景；不修改依赖来绕过。

## 正式 L2：不存在本版本可直接使用的显式无凭据 bootstrap 开关

已静态核对完整参数分支与启动链，没有执行start或读取credential内容：

1. `scripts/dev-env.sh:521-538,677-679`：非legacy start无条件调用ensure_task_credentials；目的文件不存在且Dev seed存在就cp。只有seed不存在/目标已存在才跳过，不是显式无凭据模式。
2. `DSH_DEV_HOME`改址、预建空credentials、legacy共享home均不是当前合同下获授权的无凭据路径；未尝试。
3. `ensure_task_settings:541-555`还会从Dev→omnimux-dev→Prod复制settings；`resolve_l2_seed_profile:45-76`隐式fallback到Dev/Prod/~/.dsh；必须提前确定正式受管seed，不让授权默许回退。
4. 本树无`.l2-dev.env`；不存在已绑定当前HEAD的任务Host身份。
5. **独立额外阻塞**：`scripts/live-stage-contracts.mjs:9-18,29-31`仅列8个既有Stage，`selectStages('studio')`实际抛出`Unknown stage: studio`；`all`不含社区Studio Tab。即使允许credentials也不能直接凭共享probe声称Studio通过。需要在本仓正式QA路径加社区Tab目标支持并自测，或由合同责任人提供已支持的正式入口；不能新搭私有harness或将Studio伪装另一Stage。当前QA授权仅新增测试/报告，没有改共享探针。

### 主理人下一步所需范围（不是本QA已经获得的权限）

优先方案：允许工程在**本产品仓正式dev-env入口**增加显式、fail-closed的无credentials bootstrap选项和专项测试；确认一个具体受管稳定seed路径、禁止Prod/~/.dsh兜底与含密钥settings复制；随后明确授权仅创建/运行/回收 `~/.dsh-dev/tasks/studio-audit-remediation`（或新任务名）、44201–44299一个端口、单一Studio在研链接。只读消费已安装官方运行时，不构建/修改官方DSH。

若采用现有有凭据路径，则需另行明确授权：把**指定Dev credential文件**复制到该任务home、权限0600、只用于隔离Host、不输出内容/令牌/认证URL、不调用真实模型，及任务结束的凭据清理。无需给QA展示密钥，更不需要Prod或全局~/.dsh权限；当前明确未授权，不能执行。

两方案均还需：正式Studio共享probe支持；允许同一ego任务通过当前L2 Host正式登录链接一次token→Cookie交换（链接仅内存、不持久化）；按plugin-qa保存SHA/profile/PID/启动时间/runtime bundle fingerprint、真实PNG和DOM断言。继续验证scope切换、十轮依赖重载、亮暗宿主不变、320/768/1200面板、IME/粘贴/选区、主区dock、关闭清空、媒体error/download与焦点。

## 交接

源码发现统一交Engineer，不由QA修改产品源。修复后绑定新SHA执行第2轮回归；本轮未为无修复代码重复跑第二轮。当前离线审查已完成，整体不可放行；无运行中后台任务、无浏览器任务空间、无待回收Host。主理人先安排Q1–Q5修复和正式L2范围决策，再派最终QA。
