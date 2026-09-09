# #837 QA E1 工程返修

## 结论与范围

- **IS_PASS（E1 源码返修及全局一致性）: YES**；可交主理人再派独立 QA。
- **IS_PASS（整个包测试）: NO：354 tests / 350 pass / 4 fail / 0 skip**。
- **IS_PASS（L2/完整验收）: NO，BLOCKED**。本轮禁止新凭据初始化及部署，未启动 L2；原 QA 报告的环境阻碍未解除，不以 Node/JSDOM/包测试代替浏览器验收。
- 固定 base `867b192ecf6aa35be4e1639db7351a89bea782c7`，返修前 head `3f6b46be4a32609e86ecc61622e19deb632e0a86`，分支 `agent/assets-settings-tooltip-issue-837`。返修 commit 由交接回复给出，未 fetch/push/merge。
- 源码只改 `plugins/omnimux-assets/src/client/StorageSettingsButton.jsx`。保留 QA 未提交测试、报告及两份 JSON 原文，并纳入本任务提交；不改官方、kit、viewer、供应脚本/manifest、其他业务、真实资产或共享 profile。

## E1 修复及一致性

document keydown 监听由 visible 定位 effect 移到组件生命周期 effect：Escape 清除 pending timer、将引用置空并隐藏 visible tooltip；卸载同时移除监听和清除 timer。定位 effect 仍只负责 resize/捕获 scroll/ResizeObserver，不新增 pending state 或平行 tooltip。没有 preventDefault/stopPropagation，按钮 click、focus、hover、Dialog 接线与热键传播保持原状。

QA `StorageSettingsButton.qa.test.js` 保持逐字不变，现通过。原测试覆盖 visible Escape 及再次 focus/hover 展示。全局复核 base 到当前差异的 Stage 调用、图标导入、CSS、portal、清理路径、测试 stub 与打包入口，未发现接口/导入/状态流转不一致；该结论不包含真实浏览器几何、焦点和键盘激活实测。

## 当前源码打包

读取既有 `package.json` files/prepare、`scripts/build-client.mjs`、`scripts/verify-private-package.mjs`、`src/final-package-qa.test.js` 和 #766 供应报告。沿用现有白名单和已核验两架构 runtime，不改供应产物，不复制旧 tgz。

在插件根执行：

```sh
npm pack --json --cache .package-cache > .final-pack.json
```

prepare 成功构建当前 bundle（303938 bytes），但 build 的 stdout 混入 JSON，既有 verifier 报 `Unexpected token 'w'`。保持已成功构建的 bundle，分离打包与生命周期，执行：

```sh
npm pack --json --ignore-scripts --cache .package-cache > .final-pack.json
node scripts/verify-private-package.mjs
```

这是同一当前源码的重新打包，不是跳过构建或替换旧包。缓存、bundle、tgz、临时验证目录均在本任务树，产物/cache ignored、不提交。

- 产物：`plugins/omnimux-assets/omnimux-assets-0.2.0.tgz`
- SHA-256：`4038e8426c7fc30a44ceffc7c28e41d38d132de8cb348e8ed574b4ac8f81ba3c`
- 压缩大小：48,587,949 B；解包大小：132,916,698 B；3373 entries。
- 既有 verifier：两架构全部非缓存普通文件 hash、112 notice 的内容核验及解包后无 PATH async/sync Python 3.13.15 probe PASS，见 [rework-private-package.json](rework-private-package.json)。不据此声称 Intel 原生/正式签名发行通过。
- 任务专用 [verify-current-package.mjs](verify-current-package.mjs)：独立 tar listing 无逃逸/重复路径、排除缓存/测试/供应 evidence，54 个当前源码与入口文件全部在包内且 hash 一致。见 [rework-current-package.json](rework-current-package.json)。该脚本不改变现有测试，亦不是替代其固定历史制品身份断言。

## 最小必要验证

| 命令/范围 | 结果 | 本地日志 |
|---|---|---|
| 原4文件定向 + QA pending Escape | 35/35 PASS | rework-focused.log |
| `npm run verify:stages` | 10 Stage / 8 sidebar PASS | rework-stages.log |
| npm pack prepare 构建 | PASS，303938 bytes | rework-pack.log |
| 既有 private-package verifier | PASS | rework-private-package.json |
| `node docs/implementation/issue-837/verify-current-package.mjs` | PASS | rework-current-package.json |
| `npm --prefix plugins/omnimux-assets test`（现有完整 test script） | 354 / 350 pass / 4 fail / 0 skip | rework-package-tests.log |
| `git diff --check` | PASS | 提交前复核 |

全包只跑一次；没有重新触发已知会自动重装依赖的 pnpm 入口。gates 不适用：未修改 workflow/gate/合同/manifest；未因报告追加重复跑全套。无真实模型/API/资产调用。

### 剩余四失败不是 E1

1. QA-PKG01：`final-package-qa.test.js:44` 要求历史 48,587,041 B 与 SHA `4133161d36e651f04ea97024517c3536c2996e0c4c651d855edc36734ba7bb29`，当前实际 48,587,949 B；后续还硬编码3372文件及132909626字节。该测试同时要求包内 src/bundle 匹配当前源码，修改源码后无法同时满足固定历史制品与当前源码身份。未替换任何常量或删除断言。
2. QA-PKG02 arm64、x64：分别缺 `runtime/evidence/arm64-inventory.json`、`x64-inventory.json`。QA 之前仅复制 runtime 两个 payload 目录；这些独立历史验收证据没有随包供应且不在任务树。未从 production integrity 自制或伪造“独立 accepted inventory”。
3. QA-PKG03：同样缺历史 evidence inventory；不是当前 notice 核验失败。当前112 notices 已由原 verifier 核验。

QA-PKG04 此次 **PASS**：解包中文路径、无系统 Python PATH、真实插件 resolver、7 tools、旧 schema/HTTP/预览/上传/重启均在任务临时夹具验证；完整测试 after 还确认原 runtime byte/mode/link inventory 未变。

主理人应单独明确历史包验收与当前构建包验收的测试职责；若继续该历史套件，需有来源证据的独立 inventory。不得以复制旧包、生产清单冒充独立证据或替换历史 hash 为新 hash 放行。本轮不扩展修改测试合同。

## 下一责任人

主理人接本地提交，派独立 QA 复核 E1 与当前包证据。L2 需先解除原报告中明确的任务认证初始化及受管 seed/Host 兼容边界，再正式绑定新 SHA 并完成 ego 同次 probe/runtime identity/PNG 与交互矩阵。未获得这些证据前不可宣称完整通过或合入就绪。
