# UI audit fixes — 第二轮最终独立 QA

## 判定

- **离线返修专项：PASS。完整产品/UI 验收：BLOCKED，IS_PASS: NO。**
- Edward，2026-09-09 10:50–10:56 Asia/Shanghai。第二轮已完成，不进入第三轮修复循环。
- 本轮实际运行 **82 tests / 82 pass / 0 fail / 0 skip**：新旧行为 26、kit 56。Coverage 未采集，不虚构百分比。
- Routing：本地 K1 修复 **NoOne**；完整交付 **Known Issues / 环境 owner**。本轮未发现新的受审实现失败。
- 未重复五个产品完整包、assets 基线全跑；工程报告的 **1025 / 1018 pass / 5 fail / 2 skip** 是已有提供方记录，不冒充本轮独立执行。首轮 QA 的 5 个 assets 缺失 tgz 基线结论保留，不记为本轮通过，也不修改历史断言。

## 固定审查身份与写入边界

| 仓库 | Base | 本轮受审 HEAD |
|---|---|---|
| 产品 `.worktrees/ui-audit-fixes` | `867b192ecf6aa35be4e1639db7351a89bea782c7` | `1ce51cf7f4f4701e2fe3aab1a6a026a090b0a644` |
| kit `.worktrees/ui-audit-fixes` | `9d52a0cd5b41211d4fd8a260330b89d50be99f64` | `0cff2942d1248bffb39176d05b1defa45ff1057a` |

产品任务绝对路径 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/ui-audit-fixes`；kit `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes`。Git HEAD 与 repair/delivery.json 实际相符，kit 干净。产品自首轮 HEAD `7f0dee48eeba47393fd5ddd60caab79014c96bed` 至当前的 `plugins/*/src` diff 为空。

本轮只新增 QA 身份检查脚本、本报告和 qa-round2 证据。未改实现/lib/提供方 binding、原 QA、viewer/官方源、profile/store；未 fetch/push/merge/Dev 部署、未同步任务全 profile、未另委派。既有未跟踪 tgz/bundle/QA 重建产物保留。

## 实际专项结果

| 命令/检查 | Exit | 本轮结果 | 证据 |
|---|---:|---|---|
| `UI_AUDIT_KIT=<kit> node --test scripts/ui-audit.behavior.test.mjs scripts/ui-audit.independent.test.mjs scripts/ui-audit.repair.test.mjs` | 0 | 26/26 | [behavior.log](qa-round2/behavior.log) |
| kit：`node --test src/**/*.test.js src/kit-export.test.js` | 0 | 56/56 | [kit.log](qa-round2/kit.log) |
| 原 binding QA 逻辑，仅重定向新 tar 与第二轮输出 | 0 | 5 bundle、73 tar 文件、31 source map 源文件一致 | [binding-result.json](qa-round2/binding-result.json)、[binding.log](qa-round2/binding.log) |
| `node scripts/ui-audit.round2-identity.mjs` | 0 | 两 Git bundle、原 QA hash、kit 独立重建、环境身份 | [identity-environment.json](qa-round2/identity-environment.json)、[identity.log](qa-round2/identity.log) |
| 两仓 `git diff --check` | 0 | 无空白错误 | 本轮命令回执 |

未执行 `ui-audit.repair-binding.mjs`：它会先按当前文件重写期望 binding，再核对；独立 QA 不以刷新期望值代替比较。实际执行原 `ui-audit.binding-qa.mjs` 内容的内存副本，只替换旧 tar 路径为 `repair/dsh-ui-kit-0.1.0.tgz`，五包输出为 `qa-round2/rebuild-*.js`、结果为 `qa-round2/binding-result.json`；不变动断言或源文件。

### K1 跨模块锁 — PASS（限定同 realm、同协议版本）

- 读取 Drawer.tsx，确认 `Symbol.for("dsh-ui-kit.drawer.scroll-locks.v1")` 存放同 realm globalThis WeakMap；key 是实际容器，value 为 owner Set 和首次 overflow。
- 原独立 QA 测试未改，首轮失败项本轮 PASS。`new Function` 每次执行完整编译模块并构造独立 module.exports；不是两次缓存 import，也不是仅搜索 registry 字符串。
- 新专项在 A 已持锁后再求值 B：两种关闭顺序 × close/unmount × StrictMode 共 8 项通过；另有自定义容器共享与容器间隔离 1 项通过。最后 owner 释放才恢复；重开后释放同样通过。
- 五个实际插件重建 bundle 与受审 bundle 字节一致，把编译 kit 行为证据绑定至本次交付。测试使用真实 React/DOM 加独立 kit 模块，**不是五个正式 ModuleLoader 产品页面的浏览器端 E2E**。
- 不声称不同 realm、旧 bundle 与 v1 混载兼容；不将两个模态 Drawer 的完整焦点/ESC/真实滚动 UX 标为通过。

### PageHeader 底边框 — PASS（源码/产物/DOM）

- kit 从首轮 HEAD 到当前 CSS 仅该处 `1px solid var(--dsw-alias-border-l1)` 改为 `none`。
- 新专项实际挂载编译 PageHeader 与注入 CSS，校验规则 `border-bottom-style=none` 及 computed `borderBottomStyle=none`，通过。
- tar 与固定源码/lib 逐字节一致，kit 重建 index.js、index.d.ts 及两份 map 的 mappings/sourcesContent 一致；五包重建一致。边框在该交付链无回退。
- 这不是真实浏览器主题/布局 PNG 验收。

### 其他原行为 — PASS（离线）

F1 表头原生 button/aria-sort/忙态/消费者，F2/F3 空内容复制控件缺省及分析状态流，Hook null 转换，K2 extra 事件隔离，K3 clipboard fallback，TypeCard、AssetGrid 既有专项全部保持。真实系统剪贴板、默认键盘激活、视觉几何仍属浏览器缺口。

## 交付 hash

| 制品 | SHA256 |
|---|---|
| kit lib/index.js | `724912626ca72d49de0743bb578dad21943d4ae369176f4155f639ddf84ab85d` |
| kit tgz | `8f7f7161294ecbbcf6f20e81f95d8e862941e71e567607599455b57658ac8b72` |
| repair/product-fix.bundle | `243297231365bbf00dee9a4192ba4f78db63a97ac672976e4aa8bd0dd082f4c4` |
| repair/kit-fix.bundle | `c2ceedbfb6d9129eeb590d8520eb1b8e563b9d6e313cce88fe5ed51a20bbdbbc` |
| accounts | `93763a2174c6275fdfbac8b4c1adabd33eb81c26cd59c687c77ceb9602281692` |
| analytics | `51a0b002b30fc9639ca413ff1c08908bcde567133331a265f7c1b704543d4ad0` |
| inspiration | `ef35ddaf917228211290f43881641a0f0555ca70094c6139a8e093f9cc7480c4` |
| publish | `056200ec457b76cf681a638a99b86ed6bf5307774582279a0628d3470d9bd1b8` |
| assets | `0407982e3ebceb2795b290db2aedd645a9498fa72094005d96330960cffd88ee` |

两 Git bundle verify exit 0 且 list-heads 包含交付 HEAD。QA-REPORT.md、原 independent/binding 脚本及旧 qa-binding-result.json 与 protected-qa-sha256.json 完全一致；首轮证据未覆盖。

## 正式环境只读核验 — BLOCKED

### ENV-01：受管不等于 API 兼容

实际检查正式默认 seed `/Users/x/.omnimux-dev/profiles/omnimux` 与任务 `/Users/x/.dsh-dev/tasks/ui-audit-qa-0909/profiles/omnimux-dev-ui-audit-qa-0909`：

- 两者 viewer 声明均为 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`，受管 source 与 installed 的 lib/index.js 均为 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，仍导入 `installSettingsSection`。与已记录旧 payload 相同。
- 正式默认 Host `/Users/x/Desktop/Project/Github/deepseek-harness` HEAD 仍为 `dd6322d604e00eec1ba5e0c8541159906a21094a`。CLI 解析 settings 指向 `packages/settings/settings/lib/index.js`，SHA `bb4bee8b1772c59b52c5b89fc5464a09a5ef6f23dfbcaa93b1b84c53ae8a43ec`。
- 实际 export 只有 `SettingsConflictError, SettingsProvider, default, redactSecrets`，无 `installSettingsSection` / `settingsNamespace`。与首轮失败的 API 条件相同。
- 只读搜索当前主树 docs 的 viewer/纳管记录，未找到可消费兼容版本的正式收据；现有 #778 纳管证明不能证明上述 API 兼容。结论限定于已检查正式 seed/任务/默认 Host 和本地文档，不宣称外部不存在未交付修复。
- `lsof -nP -iTCP:44201 -sTCP:LISTEN` exit 1：当时无监听；本任务 `.l2-dev.env` 不存在。未盲启 Host、未重跑必失败 verify:live、未创建浏览器空间。

### ENV-02：任务 kit 身份仍旧

两 profile 的受管 kit lib/index.js 仍为 `cb27fd9f29182777516098dcec703657810042029bb47c5bc662f9480f4c13fb`，非本轮 `724912...`。本地 linked accounts 新 bundle 不等于任务全 profile 纳管新 kit。

工程给出的 task-only full-profile sync 不是 kit-only；会重建/物化多插件和 presets。当前没有执行授权覆盖该扩大的写面，本轮未执行，也未手改 profile/store 或移除 viewer。单纯再次 start 不会重克隆已有 node_modules，不能恢复精确依赖绑定。

### 必需浏览器维度

| 维度 | 最终状态 | 当前缺口 |
|---|---|---|
| accounts/analytics/publish/DataTable 原生 Tab、Enter/Space、busy、aria-sort | BLOCKED | 本次 L2 真键盘与 DOM/PNG |
| 空脚本复制与系统剪贴板保留 | BLOCKED | 真浏览器剪贴板 |
| 分析状态流受控请求 | BLOCKED | 本次 L2 页面与非模型拦截证据 |
| Drawer 多实例、卸载与实际滚动恢复 | BLOCKED | 正式产品路径与真实滚动；离线锁专项已 PASS |
| Tile/AssetGrid 子按钮默认键盘激活 | BLOCKED | 原生 keyup/default click |
| TypeCard 多行、PageHeader 边框与主题几何 | BLOCKED | 可解码真实 PNG |
| ego + verify:live 同次身份/probe/runtimeProof | BLOCKED | 合规 Host、allocation、.l2-dev.env |

不以 JSDOM、HTTP 200、其他任务页面、旧 PNG 或私有页面替代。

## 可执行下一步与 owner

1. **环境 owner**：先交付兼容 viewer/正式默认 Host 的实际受管收据（源码/版本、payload hash、source/installed 一致性及所需 settings API 兼容证明）。首先只读复查上述两个 viewer lib/index.js 与 settings lib/index.js；无新证据不重复 start。不得修官方/删除 viewer绕过。
2. **主理人/环境 owner**：确认本任务 full-profile 更新的多插件/presets 写面授权，或提供已有正式支持的更窄入口。仅在前项兼容证据和授权齐备后按 [REPAIR-REPORT.md](REPAIR-REPORT.md) 第63–78行的既有 task-only 入口执行；该命令不自行授予权限。保留单在研 link，验新 kit/五包 hash，并通过正式成功启动路径产生工作树绑定，不手写 env。
3. **QA**：环境恢复后仅执行上表仍 BLOCKED 的 ego-browser + verify:live 验收，不再泛化重复离线全包/进入第三轮本地修复。
4. **assets 制品 owner**：供应合法历史归档或提出经批准的版本化验收策略；五个历史 tgz 基线失败单列，不删断言、不开绿灯。

本轮离线 QA 可以收口；完整产品验收不可关闭/归档为成功。无本轮后台 Host、子任务、安装或测试作业在运行；未建立或声称后台续查。当前工具无 report 专用回传接口，结构化结论由最终回复交主理人。
