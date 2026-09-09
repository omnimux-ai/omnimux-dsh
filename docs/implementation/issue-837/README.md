# #837 资产库设置 Tooltip 工程报告

## 状态与身份

- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/837 ，关联 #766 / PR #830。
- Base: `867b192ecf6aa35be4e1639db7351a89bea782c7`，2026-09-09 fetch origin/main 后核对。
- Branch: `agent/assets-settings-tooltip-issue-837`。
- Worktree: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-settings-tooltip-837`。
- Head: 本报告随工程提交，确切 SHA 由 `git rev-parse HEAD` 获取，主理人交接回复另附。
- 工程实现完成，可交独立 QA；**IS_PASS: NO（完整验收）**。定向本地检查 PASS，包全套因缺供应产物失败，修复版本 L2 未执行，不能据此合并。
- 未 push / PR / merge / Dev 物化。未改官方 DSH、外部 kit、viewer、共享 profile、真实资产或迁移 root。

## 已验证的真实原因

不是类型筛选器夺取锚点。对现有 Dev 45120 的只读诊断使用 ego task 79，测得按钮 x=1308、width=32，中心=1324 CSS px。官方 Tooltip 的 inline left=1324，实测 Tooltip x=1565.5、width=79，中心=1605，偏移恰为281 CSS px。工作台 panel x=280，含1px边框，`contain: layout style` 建立 fixed containing block。Tooltip 在按钮旁原地渲染，却使用 `getBoundingClientRect()` 的 viewport 坐标，故叠加了 panel 的坐标原点。

证据：[baseline-metrics.json](baseline-metrics.json)、[baseline.png](baseline.png)。此 PNG 是修复前诊断，不是修复后或 L2 验收。viewport=1920×929、DPR=2，截图物理尺寸不能直接当 CSS px；代码没有写死281/1324等测量值。

读取的实际实现：安装依赖 `dsh-ui-kit/src/button/Button.tsx` 的 IconButton 使用官方 Tooltip，`title ?? aria-label`，空 title 可关闭内建提示。官方 `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` 的 Tooltip 使用 viewport rect + inline fixed span，无 portal 参数。kit 默认 ghost/default 已具备32px框、8px圆角、hover、focus-visible、active和reduced-motion状态。

齿轮原为自绘14px SVG，放在kit的16px slot里，偏小有源码与DOM双重证据。图标合同规定标准工具栏使用16px且优先官方设置图标。

## 最小修复

- `StorageSettingsButton.jsx`：保留 kit IconButton（ghost/default），替换为 `IconSettingsOutline16`。仅关闭本入口内建Tooltip，使用 body portal，使fixed坐标与viewport一致；样式复用官方Tooltip token和几何，不改全局containment、不按截图调偏移。
- 保留 aria-label、真实button与click回调；增加aria-describedby；hover延迟280ms、focus即时、blur/leave收起、Escape收起、点击收起；卸载清理timer与监听。
- 根据按钮/浮层实测rect定位，窗口resize、捕获scroll、ResizeObserver时更新，包含左右边界约束及上下翻转。
- `AssetsStage.jsx`只替换设置入口；`styles.js`移除重复按钮尺寸规则，仅补本入口Tooltip样式；`icons.jsx`删除不再引用的自绘齿轮。
- `StorageSettingsButton.test.js`使用真实React DOM/portal与JSDOM测试生命周期、锚点坐标、边界翻转、hover/focus/Escape/click。kit/icon为接口stub，不能证明真实kit CSS或浏览器布局。
- 既有`client-entry-followup.test.js`的Node bundle新增external/mock官方UI模块和react-dom，避免新原生图标导入把官方CSS编进Node测试；未改变业务断言。

视觉方向维持现有DSH原生中性工具栏，不重设计页面、字体或色彩。不新增占位内容。

## 本地验证

- `node --test plugins/omnimux-assets/src/client/StorageSettingsButton.test.js plugins/omnimux-assets/src/client/StorageSettingsDialog.test.js plugins/omnimux-assets/src/client/client-entry-followup.test.js plugins/omnimux-assets/src/client-layout.test.js`: **34/34 PASS**，见本地`focused.log`。
- `npm run verify:stages`（等价package script）：**10 Stage / 8 sidebar PASS**，见本地`stages.log`。
- `npm --prefix plugins/omnimux-assets run build`: PASS，303817 bytes，生成物不提交、不物化。
- `git diff --check`: PASS。
- `npm test`（assets目录）全包：353 tests，166 pass / 187 fail。见本地`package-tests.log`。缺未跟踪供应目录`runtime/cpython-3.13.15+20260807-darwin-arm64`导致storage-platform-unsupported及下游断言失败，另5项依赖历史`omnimux-assets-0.2.0.tgz`缺失。未删除测试、未伪造产物hash、未改供应链。
- 原`pnpm --filter omnimux-assets test`启动自动install后报`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，未确认purge，改用相同npm/node脚本。仅在任务树链接主树现有node_modules，未修改store或外部依赖；Stage首次缺market依赖，任务内只读链接后通过。
- 全局一致性审查：本变更接口/导入/调用一致，无双Tooltip，原有存储行为未修改。完整运行验收尚不成立。

## QA下一步与阻碍

主理人接独立QA。先核对本树SHA、diff和上述证据，再按`docs/contracts/plugin-qa.md`、`dev-pipeline.md`绑定该树的正式L2。当前轮明确不新建凭据，故没有运行dev-env start，没有移除viewer规避兼容。若已有合规任务可复用，核对SOURCE/Host/profile/commit；否则由主理人处理必要的初始化授权与受管seed完整性。

1. 在正式L2（最多一个在研assets link）运行共享`verify:live`探针，保留同次request/runtime identity/PNG；不能把这里Dev基线或JSDOM测试当L2通过。
2. 桌面宽度、窄宽度、中英文、light/dark逐项测试；默认32px button/16px SVG与相邻工具栏状态一致。
3. 齿轮hover提示紧邻按钮，不落在类型筛选下；DOM tooltip应为body直接子节点。视口未碰边时中心差<=1 CSS px、下方间隔8 CSS px。侧栏展开/折叠后重新hover、窗口resize和scroll后复核。
4. Tab聚焦出现提示与可见focus ring；Escape只关提示；Enter/Space打开设置；关闭对话框可重新进入。不执行真实路径更改或迁移。
5. 类型/排序下拉、搜索、视图切换仍可用；工具栏不因新增节点换行。
6. 供应产物补齐由主理人决定合规最小路径并再跑全包；不以删viewer、改历史tgz断言、系统Python替代私有运行时来凑通过。

独立QA通过后才能由主理人推进远端PR/CI/Merge Queue及已授权Dev物化。本轮只交本地工程提交。
