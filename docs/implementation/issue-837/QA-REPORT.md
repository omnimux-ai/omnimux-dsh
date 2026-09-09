# #837 独立 QA 报告

## 结论

**IS_PASS: NO。Routing: Engineer；L2: BLOCKED。不得推进合入或 Dev 物化。**

固定审查 base `867b192ecf6aa35be4e1639db7351a89bea782c7`，head `3f6b46be4a32609e86ecc61622e19deb632e0a86`。用户明确限定本地 SHA，未 fetch/切分支。开始时任务树干净；本轮仅增加 QA 测试、报告/证据和 ignored runtime/build，不改业务源码、不 commit/push/merge、不改共享 Dev、viewer、官方或外部 kit。

## 审查结果

- 修复方向合理且范围克制：实际 installed kit 的 IconButton 使用 `title ?? ariaLabel`，`title=""` 确实关闭原 tooltip；保留真实 button、ref、type=button、ghost/default、slot aria-hidden 与事件透传。官方 Tooltip 当前无 portal/container 接口（已读实际 lib 与 kit 源码），局部 body portal 解决 containment 坐标原点问题，比修改全局 contain 或重造 button 合理。
- 替换官方16px设置图标、移除原14px SVG与重复按钮尺寸，Stage调用仅替换入口；没有新增第二套通用 Tooltip 库或配置抽象。95行局部组件含计时/定位/边界/生命周期，当前功能规模可接受。
- 定位公式在未碰边时理论中心相同且下间隔8px；resize/捕获scroll/尺寸变化时重新测量。**这不等于真实浏览器测量通过。** ResizeObserver不感知纯位置变化，侧栏动画中锚点移动仍需 L2 核验；重新hover会重新测量。
- aria-label保留、可见tooltip由aria-describedby关联；Escape已可关闭已显示tooltip。双主题、Tab可见focus、Enter/Space原生激活、真实Dialog焦点恢复/关闭尚未获得L2证明。

### E1：延迟显示期间 Escape 未取消（P2 / Engineer）

位置：`plugins/omnimux-assets/src/client/StorageSettingsButton.jsx:25-26,38-44,64-67`。

Given 鼠标进入按钮但280ms计时未完成；When 按 Escape；Then 应取消本次待出现提示，不应在取消动作后突然显示。实际仍在计时到期后显示。

原因：document keydown 监听只在 `visible=true` 的 effect 中安装；pending 状态没有取消 Escape 的监听。

独立测试：`StorageSettingsButton.qa.test.js`，最终1项运行0通过/1失败，错误 `Escape must cancel pending hover, not reveal the tooltip afterwards`。建议让 Escape 覆盖 pending + visible 生命周期，清理计时器，不改变原生button或全局热键传播。QA未修源码。

测试轮次：第一轮新增边界测试使用DOM对象的equal断言导致失败格式化超时（10s/SIGTERM，未算PASS）；第二轮仅将断言改为布尔，保持相同预期与事件序列，993ms明确失败。已达到两轮上限，停止继续运行，交回工程修复。

### 非放行级注意项

- CSS `pointer-events:none` 与原官方Tooltip一致，没有引入新的指针悬停策略；若要求完整WCAG hoverable扩展，需要另明确范围，不能据此声明已经完整无障碍合规。
- 原工程测试名“preserves keyboard activation”实际调用button.click，没有发Enter/Space；只能证明click回调，不可作为键盘实测证据。
- baseline.png是旧Dev诊断截图，不是当前L2。文件实际2943×1424，与JSON的1920×929、DPR2不能当原始1:1像素映射，可能经过截图缩放；281CSS px结论来自DOM rect而不是PNG量尺。

## 执行结果

| 检查 | 实际结果 | 证据 |
|---|---|---|
| 固定diff / git diff --check | PASS | head/base核对；9文件工程diff |
| 原定向4文件回归 | 34/34 PASS，0 skip | qa-focused.log |
| Stage合同 | 10 Stage / 8 sidebar PASS | qa-stages.log |
| assets客户端构建 | PASS，303817 bytes | qa-build.log |
| 全assets包（复用runtime后，新增QA用例之前启动） | 353项，348 PASS / 5 FAIL，0 skip | qa-package.log |
| 新增独立Escape边界（最终轮） | 1项，0 PASS / 1 FAIL | qa-escape-pending.log |
| 正式verify:live前检 | exit1，L2 requires --url from this worktree .l2-dev.env | qa-live-preflight.log |

以上是不同命令的结果，不去重相加，也不声称全包全绿。覆盖率未测量，不编造百分比。

## 私有运行时与历史包

按用户授权仅从本仓 `.worktrees/assets-storage-766/plugins/omnimux-assets/runtime` 复用。先核对manifest和两架构integrity文件相同，再核验锁定归档sha256/大小、清单每个文件字节/hash/mode、symlink目标及不逃逸、executable hash，复制两目录到本任务runtime并复核文件hash/link。arm64 1809项，x64 1805项。没有系统Python、供应链脚本或hash修改。

见 `qa-runtime-reuse.json`。全包由工程166/187改善为本轮348/5；此处前者为交接事实、后者为独立运行。

剩余5失败：QA-PKG01、QA-PKG02 arm64、QA-PKG02 x64、QA-PKG03、QA-PKG04，共用before因本任务缺历史tgz失败。原#766 tgz确实存在且大小48587041/hash `4133161d36e651f04ea97024517c3536c2996e0c4c651d855edc36734ba7bb29`匹配硬编码，但其AssetsStage/styles/client bundle与当前head不同，见 `qa-historical-package.json`。`final-package-qa.test.js:44`要求旧包固定hash，而49行又要求与当前源码相同，不能靠复制旧包使当前源码验收有效。未复制旧tgz、未改断言、未改源码打包合同。后续应由主理人安排将历史制品验收与当前构建制品验收的测试职责区分，不能把旧hash替换为任意新hash凑通过。

## L2环境阻碍与未执行矩阵

已实际调用 ego-browser `listTaskSpaces`，工具可连接；原工程task79不存在，现有70/71/73/76均属其他任务，本轮没有接管/修改它们，也未建立新浏览器任务。没有当前#837 L2 home或本树 `.l2-dev.env`。#766 home只剩profile残留，缺根`.credentials.yaml`和`settings.yaml`，profile亦无package/node_modules/Host PID身份；不能复用为合规运行环境。

`dev-env.sh:521-566,673-679`表明start会从已存在的 `~/.dsh-dev/.credentials.yaml` 和 `~/.dsh-dev/settings.yaml`复制到任务root。当前指令禁止初始化凭据，所以没有执行start；不借用其他任务home，不改脚本规避。

正式 `npm run verify:live -- assets --target=l2` 已拒绝缺失worktree URL绑定。run ID `2f3106e4-ea5c-4e36-a2d4-0c9b9a7378b5`，报告 `.workbuddy/evidence/live-qa/2f3106e4-ea5c-4e36-a2d4-0c9b9a7378b5/live-qa-report.json`。这是前检失败，未进入ego执行、没有真实runtimeProof或当前PNG，不能叫L2通过。

| 要求 | 状态 |
|---|---|
| 桌面/窄屏 × zh/en × light/dark（8组合） | NOT RUN，全部受L2阻断 |
| 未碰边中心差≤1CSS px、间隔8px、body直接子节点 | NOT RUN（JSDOM公式仅辅助） |
| sidebar展开/折叠、resize、scroll后定位 | NOT RUN |
| Tab可见focus、Enter/Space开设置 | NOT RUN |
| Escape关已显示tooltip/对话框 | NOT RUN（已有逻辑测试不替代浏览器） |
| 搜索、类型/排序、视图切换、单行工具栏 | NOT RUN |
| 同次真实PNG/Host/profile/SOURCE/commit身份 | MISSING |
| Electron | N/A：本改动不涉及壳/平台专属行为 |

## 下一步及责任人

1. **Engineer**：修复E1 pending Escape，并保留独立失败用例；不以修改预期消除失败。
2. **主理人**：处理最小环境授权边界——仅允许正式dev-env入口将现有开发凭据/settings复制到 `~/.dsh-dev/tasks/assets-settings-tooltip-837`，初始化该任务本地认证与临时QA工作区/会话；不涉及真实模型调用、账号写入、付费、共享Dev修改。另需受管seed与官方Host闭包通过原有兼容预检，不能删viewer或patch kit/官方。
3. 授权和修复具备后，由主理人重新派独立QA，通过正式 `bash scripts/dev-env.sh start assets-settings-tooltip-837 omnimux-assets --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-settings-tooltip-837` 绑定新SHA；在ego同一task/tab先openL2EgoPage，再prepare/runPreparedQa并执行上表矩阵、PNG和身份记录。若seed兼容失败，仅反馈依赖，不绕过。
4. 全量5项历史包阻碍须明确处理或正式记录测试合同边界；当前不能宣布完整验收。独立QA全部适用项通过前主理人不推进原有合并Dev授权。
