# UI 审计修复（本地 BugFix）

> 本文保留首轮工程记录。2026-09-09 QA 返修后的当前结论、PageHeader 补入与 task-only 方案见 [REPAIR-REPORT.md](REPAIR-REPORT.md)；当前制品身份见 [binding.json](binding.json)。首轮 QA 文件与制品未覆盖。

## 范围与授权

仅产品 omnimux-dsh 与独立 dsh-ui-kit。风险 R1（跨插件共享 UI）。仅本地代码、测试、构建、提交和制品；未授权 push、PR、merge、部署。未创建远端 Issue；此文件承担本地依赖与验收记录。

产品 base：867b192ecf6aa35be4e1639db7351a89bea782c7（已 fetch origin/main；包含 #766/#830）。原审计 62ccdd3090230132a0aab606df9d31c67a9d5ecf 后的资产迁移代码保留。

kit base：9d52a0cd5b41211d4fd8a260330b89d50be99f64，无 remote。
kit 源码/构建修复 commit：98767d80a74bdd375b12f5897856f1fe5ba93de5；最终 HEAD eba33873f3ebaf89ba69e8bbe9d53cafd5402283 仅追加依赖链接 ignore，源码/lib 不变。

工作树：两仓各自 `.worktrees/ui-audit-fixes`；产品分支 `agent/cross-ui-audit-fixes`，kit 分支 `fix/ui-audit-fixes`。

## 来源与恢复

kit 原始未提交复合组件与导出/构建共 34 文件由 agent-backup 精确保存：
`/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.agent-backups/20260909T020848Z-1f94c52e6841/manifest.json`。
恢复到 kit 工作树后对全部 34 项逐字节比对成功，原始源码未删除。归档保留原生成 lib，修复树重新构建 lib。

排除独立的 `README.md`、`src/stage/PageHeader.module.css` 去分隔线改动：保留主树原状，不提交，也不从混合 lib 反推源码。新增的 badge/card 等虽然不是本轮缺陷修复点，但属于产品已消费的同任务必要复合组件增量，连同导出及既有测试完整保留。kit `.gitignore` 补充工作树与恢复点目录规则。

产品主树的 `videoCompositionStatus.ts` 与对应测试脏改动未修改、未暂存、未 stash。未修改 pnpm store、官方 DSH 或其他仓库。

## 逐项修复

| 编号 | 实现 | 验证 |
|---|---|---|
| F1 | TableHead 的 sortable/onClick 表头渲染原生 button；aria-sort 与调用 class/style/ref 留在 th；原有 th callback 的 currentTarget 契约保留；disabled/busy 禁用按钮 | 实际 DOM focus/click/keydown；AccountTable busy；PlatformTable/TopPostsTable 状态切换；DataTable 三态排序 |
| F2 | scriptValue/deconValue 为空时不渲染业务 CopyButton | 空数据实际渲染无复制入口；非空成功结果出现入口 |
| F3 | analyzing、analyzeError、hasDeconstruction 分别映射 running/failed/done/idle | 实际异步 fetch 延迟、失败、重试成功状态流 |
| K1 | 按 portal container 的 WeakMap owner 集合共享 overflow 原值，最后 owner 释放才恢复 | StrictMode、多实例、两种关闭顺序、卸载、自定义容器 |
| K2 | Tile 忽略交互后代与已取消事件，子按钮默认行为不被取消 | 子按钮 Enter/Space/click 不切 tile；tile 本体仍切换 |
| K3 | execCommand fallback finally 移除 textarea 并恢复原焦点 | true/false/throw 三路径实际 DOM 焦点/节点检查 |
| Hook | mobileTabs 改为普通派生数组，return 后不再调用 Hook | null → row → null 重渲染 |
| TypeCard | 恢复 kit Button 动作语义及按钮 label 内多行样式，无 radio/checked | 实际点击输出媒体类型；保留原业务测试，仅修正错误的组件锁定断言 |
| AssetGrid | 选择按钮 keydown stopPropagation，不 preventDefault、不手动重复触发 | 两种激活键不会触发父 MediaCard；保留 #766 文件夹分支 |

## 本地复现

先在 kit 工作树运行 `npm run typecheck && npm run build`。

产品任务的 `node_modules/dsh-ui-kit` 只链接上述 kit 隔离树；其他依赖链接只读消费现有已安装依赖。没有修改共享 store。产品包仍使用既有 file: kit 依赖机制，不伪造 registry 版本。构建每个受影响包使用原有 `npm --prefix plugins/<name> run build`，五包 client.js 作为本地制品，不部署。

行为测试：

```sh
UI_AUDIT_KIT=/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes node --test scripts/ui-audit.behavior.test.mjs
```

测试使用真实 React mount/rerender/unmount 和 JSDOM 事件，只有宿主图标/Tooltip 显示模块替身及离线请求。JSDOM 不实现原生 Enter/Space 合成 click，因此键盘默认激活还须 L2 真浏览器；本地用例不会把 keydown 后手工 click 宣称为浏览器默认行为证明。

## 检查结果与判定

- Node 25.8.0；kit typecheck/build exit 0；既有测试 56/56。
- 新增实际组件行为测试 12/12（包含 publish/DataTable 消费者）。
- Accounts 62/62；Analytics 84/84；Inspiration 189 pass / 2 既有 skip；Publish 254/254。
- Assets 原完整命令 347 pass / 5 fail（独立 QA 已核对基线同五项失败）：`final-package-qa.test.js` 固定要求不存在的历史 `omnimux-assets-0.2.0.tgz`，其预期 SHA 是旧发布制品且强制与当前源码一致，不能用新修复包冒充旧 SHA。原测试完整保留，不篡改断言。显式排除 `QA-PKG0[1-4]` 后 348 业务测试全通过；这是范围说明，不是完整包验收通过。
- Assets 私有 Python 经现有 `python-supply.mjs acquire` 验证下载双架构，任务树独享；无系统 Python 替代。
- Stage 10 组件/8 侧栏 runtime contract 通过；boundaries 通过；UI 279 文件 0 违规；五个 plugin bundle 构建通过；diff --check 通过。
- 日志留在本目录（本地忽略的 .log）；`binding.json` 为源码 commit→kit lib/tar→五包 bundle 的 SHA256 身份记录，tarball 是本地未发布制品。必要恢复归档有逐文件来源和 mode。
- 全局一致性检查：所列缺陷代码本地修复完成，产品最小 diff 保留 #766；**IS_PASS: NO（完整验收）**，原因是历史制品测试未能完成及 L2 真浏览器尚未执行。不是代码/部署已全量通过。
- 不涉及模型/工具 registry/平台契约变更；不执行真实模型、Electron、远端 CI 或任何部署。门禁脚本未改，仅新增 task 行为测试。

## 未完成边界与 L2 验收步骤

本次只准备 L2 步骤，未启动、部署或修改 profile；不把单测、HTTP 200 或本地 bundle 视为运行验收。未合并不进入 Dev。

1. 主理人先完成本地独立审查，并确认必要 L2 profile 初始化权限与受管 kit snapshot 纳入方式；当前 full sync 真源默认主 kit 仍为脏树，不得直接用它发布。单包 sync 只校验 shared kit 不更新，不能假装已接入此 commit。
2. 用现有 `scripts/dev-env.sh`，SOURCE 指向本产品工作树，分别创建 accounts、analytics、inspiration、publish、assets 的 L2 任务，单 profile 至多一个在研插件。核对 `.l2-dev.env` 的 SOURCE、COMMIT、URL、PROFILE_DIR 与运行 Host。
3. 仅 ego-browser；在同一隔离 task/Tab 通过 `scripts/ego-live-qa.mjs` 的 `openL2EgoPage` 正式登录入口，禁止伪造 Cookie 或换浏览器。
4. `pnpm verify:live <stage> --target=l2 --url=<实际44201-44299地址>`，再用 `runPreparedQa(requestPath, { tab })` 消费同次请求。保存同次 SHA、Host、bundle 指纹和 PNG。
5. Tab 进入四种消费者的排序按钮，Enter/Space 各一次，确认仅一次排序、焦点仍在按钮；忙状态不可激活。检查 th 的 aria-sort、主题与表头几何。
6. 空灵感无脚本/拆解复制入口，预置剪贴板不被清空；未开始不显示生成中。离线受控分析请求验证进行中→失败→成功与非空复制。不得调用真实模型仅为发现支持。
7. 两 Drawer 乱序关闭/卸载后容器滚动准确恢复；Tile extra 按钮不切选中；Assets 选择按钮键盘不打开卡片；Composer 卡片是 button、多行提示正常。
8. 获取正式 pass 报告后才结束 ego task。此阶段没有合入、Dev/Prod 物化授权。
