# Studio 审计整改工程报告

## 结论

IS_PASS: NO（整体验收）。2026-09-09续修已闭合插件独立依赖与lock、畸形document/result边界、参数栏nowrap，20/20测试与build/边界/Stage/UI静态检查通过。L2 readiness: DEPENDENCIES READY / HOST NOT STARTED。缺真实Host、ego浏览器与独立QA证据，不能称F01–F14全部关闭。下方前序17项记录作为历史保留，最新结果见本报告末尾。

工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`；分支 `agent/studio-audit-remediation`；base `93a36e19e59fb8b7b7ee0ad32e08f46efe12f137`。交付commit请以本报告所在提交的Git HEAD核对。

## 已执行证据

- Node插件测试17/17，0失败/skip，包括实际React+jsdom编辑事件（UI kit Button为测试替身，非真实浏览器）。
- build-client成功，最终本地输出171868 bytes，输出不纳入源码提交。
- verify-plugin-boundaries通过：2232 sources。
- verify-stage-contracts通过：11 Stage、8已有sidebar targets；本插件另外有十轮注册/释放单测，不将8个targets当Studio live验收。
- scan-ui-gates exit0（最后一轮新增不兼容引用提示后尚未重跑）。
- git diff --check及cached check通过。
- 所选仓库gate suite149 tests：128通过、21失败，exit1。14项临时fixture无法resolve pngjs，1项fixture esbuild缺失，4项Corepack离线无法获取pnpm11.7，2项CPython双架构制品缺失。未改门禁或测试绕过失败。
- 默认pnpm --filter omnimux-studio test自动install失败，ENOENT主仓personal/dsh-ui-kit。设置pnpm_config_verify_deps_before_run=false后17/17通过，只证明现有环境可测试，不证明安装可复现。

## F01–F14 对应实现与限制

| 项 | 实现/证据 | 未关闭事项 |
|---|---|---|
| F01 | 移除Header及旧SVG池，Stage无全局chrome；静态测试 | 原型视觉对比未做 |
| F02 | CSS全部data属性作用域；依赖effect拥有style disposer | kit全局影响、浅/暗Host未验证 |
| F03 | 局部滚动容器、dock/overlay，无fixed | 参数栏仍wrap，窄屏和像素基线未验证 |
| F04 | tuple scope registry，空身份拒绝，5种隔离组合 | Host真实scope切换未验证 |
| F05 | Mock任务与下载文案；媒体ready/error与实际元信息 | 在线媒体/版权未核；media状态为组件局部状态 |
| F06 | remaining-time暂停恢复、cancel/dispose、epoch/attempt保护 | 浏览器卸载重载待QA |
| F07 | 有序UUID文本/Token，URL语法，Enter/IME/两次退格测试 | CJK真实输入法、粘贴和焦点完整矩阵未做 |
| F08 | 主区和详情同DraftWorkspace/store；Agent dock保持Agent草稿 | 不提供刷新持久化/deep link；真实导航待QA |
| F09 | 精确12/4/6模型及cost；三维AND过滤测试 | 菜单视觉/可访问性待QA |
| F10 | 冻结request、UUID、余额/批量/退款测试；引用槽不兼容阻止 | 未覆盖畸形外部文档，类型声明需再核对实际result |
| F11 | 社区依赖声明；locale register/bind、释放 | 实机冷启动/+菜单、干净安装未做 |
| F12 | inner.effect释放tab/locale/style/registry；十轮测试 | 真实依赖重载待QA |
| F13 | types.d.ts、类与scope实现、局部dialog焦点 | 未完成全量跨文件/图契约审核；原型全文阅读尚未完成 |
| F14 | 声明esbuild，无绝对路径build fallback；test入口 | 新workspace importer lock缺失，file依赖在嵌套worktree路径不匹配 |

## 版本归属与边界

只纳管任务树plugins/omnimux-studio及本目录。主仓原Studio symlink、兄弟payload、shared exclude均不修改；原型仅读取/hash，不修改。任务私有node_modules包含只读复用kit的绝对链接，未纳入Git。未新增真实工具、HTTP/provider客户端、后端或官方源码改动。未push/merge/Dev/Prod物化。

## 下一步（工程，不是已通过）

1. 在本任务树完成workspace依赖/lock闭合，避免沿用临时kit链接作为交付前提；只改本任务批准范围。
2. 完成设计/原型全文与全局一致性审核，补畸形document/参考槽/同步adapter/Agent详情回归与类型契约。
3. 按本仓plugin-qa合同由主理人独立QA在最终SHA绑定的单插件L2 profile执行ego-browser+verify:live。当前未启动Host、未建立profile、未使用HTTP或jsdom替代浏览器验收。
4. 修复QA发现后再给出IS_PASS，保持无push/merge/物化限制。

## 2026-09-09 工程续修

- 插件目录增加独立 pnpm workspace/lock；固定pnpm11.7、React18.3.1、esbuild0.28.2、jsdom30.0.1、社区sidebar0.18.0和官方client0.1.2-rc.1。根workspace安装受其他插件历史file路径影响，不冒充已修全仓。
- canonical personal/dsh-ui-kit只读npm pack（ignore-scripts），MIT0.1.0制品纳管于插件内；SHA256 `eb4accab76b146592af2871aff6fc068114a93a9f4aee21d0b40e9faeebe1154`。没有修改外仓或旧链接目标；替换的仅是本任务插件node_modules链接。frozen install新装360包，真实kit解析到本任务内pnpm目录。
- updateDraft拒绝畸形文档，不污染可渲染草稿；validateDraft在序列化前验证结构。结果验证kind/fixture/唯一ID/mediaState/metadata和批量数量，同步回调、空结果与迟到回调失败退款一次。types改为文本/媒体判别联合，不再用Record掩盖实际结构。
- 参数栏nowrap，模型浮层位于滚动选项的兄弟容器，避免横向overflow裁切；完整规格/批量/时长均保留。补编辑人像槽、首尾帧交换和样例正文确认回填，不自动提交或扣点。
- 读取原型4442行、设计341行与审计。保留无第二套chrome、宿主tokens、三模式共享draft/dock、12/4/6模型菜单及Mock语义。原型的无依据成功toast/全局CSS/innerHTML不移植。实现仍将若干设计组件合并于DraftWorkspace/StudioStage，未伪称逐类名称完全相同；原型视觉高保真需真实截图验收。

### 本轮命令证据

工作目录为任务树；安装命令在plugins/omnimux-studio执行。

| 命令 | 结果 |
|---|---|
| pnpm install --frozen-lockfile --ignore-scripts --store-dir ../../.pnpm-store/studio --config.cache-dir=../../.pnpm-store/studio-cache | exit0，360包，本任务内依赖 |
| pnpm --dir plugins/omnimux-studio test | exit0，20/20，0skip |
| pnpm --dir plugins/omnimux-studio build | exit0，175319 bytes |
| node scripts/verify-plugin-boundaries.mjs | exit0，2233 sources |
| node scripts/verify-stage-contracts.mjs | exit0，11 Stage/8既有targets，不代表Studio live |
| node scripts/scan-ui-gates.mjs | exit0，295 views，0违规 |
| git diff --check | exit0 |
| package.json test:gates 对应的原始 node --test 文件列表 | exit1，149 tests/128 pass/21 fail；.pnpm-store/studio-gates.log |

21失败与前序相同：14个临时fixture pngjs缺失、1个esbuild缺失、4个Corepack离线pnpm11.7、2个CPython双架构制品缺失。`git diff 93a36e19e59fb8b7b7ee0ad32e08f46efe12f137 -- scripts package.json pnpm-lock.yaml plugins/omnimux-assets/package.json`为空，门禁源码及相关环境清单未改。本轮未改QA门禁或无关环境。

追加base对照：将固定base通过git archive展开到本任务.pnpm-store/studio-base后执行同一149项列表，exit1，126 pass/23 fail/0skip；与head共享21个失败名称，headOnly=[]。base额外2项为guard-worktree和simulate-multi-agent-lifecycle，archive不具备独立Git worktree身份，不能解释为产品回归或本轮修复。对照日志.pnpm-store/studio-base-gates.log；门禁及其输入相对base未改与21项重合共同支持“无新增门禁失败”，不证明整个门禁已通过。

### 全局一致性结论与QA边界

源码测试和静态合同通过；整体验收 IS_PASS: NO。独立安装闭合不等于L2运行通过。正式start自动复制credentials且profile位于任务树外，与本轮限制冲突，未执行、未取密钥。准确启动路径及责任边界见同目录L2-PREPARATION.md。下一责任人为主理人/独立QA，先解决正式无凭据初始化授权边界，再绑定最终HEAD执行ego+共享verify:live。未push/merge/Dev/Prod物化。
