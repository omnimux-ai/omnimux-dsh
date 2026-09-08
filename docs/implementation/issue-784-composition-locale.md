# Issue #784 工程交接：视频合成返回画布与宿主语言

## 状态与身份

- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/784
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/composition-locale-784`
- Branch: `agent/cross-composition-locale-issue-784`
- fetch 后 base：`e416238631cc78ef8caeab7b5313d9571947ef5a`（已包含 PR #803 / Issue #778 合入 commit `368294ec2856f2b54b5aecee1e89719e68d410fe`）。
- 全局跨文件一致性审查：**IS_PASS: YES（工程静态与本地门禁范围）**。真实UI验收尚未执行，不代表整体QA放行。

## 定位与最小实现

实际入口：workflow `src/canvas/nodes/definitions/videoComposition.tsx` 的 openEditor 发 `omnimux-clip-open`，clip CanvasBridge 调 stage.openFromCanvas，ClipStage portal 到原画布Tab。并非 Preview.requestFullscreen 的浏览器视频全屏。

原ClipStage动作区 absolute top/right 8px，覆盖OpenReel顶栏；顶栏另预留64px。当前桌面fork `dsh-plugin-desktop/src/client/extended-styles.ts:99-115` 在compatibility/extended模式把header设为原生drag，:117-121明确记录sibling drag层不能靠按钮no-drag穿透。ClipStage按钮祖先已有no-drag、actions已有pointer-events:auto，故不是简单遗漏click handler或增加z-index即可解决。**源码证明了重叠原生拖拽命中风险；用户现场是否只由此触发，仍须Electron QA证实，未冒充现场复现。**

修复：返回按钮使用独立48px非拖拽行，与OpenReel header不再重叠；32px按钮、原生DSH token、SVG返回箭头、中文“返回画布”/英文“Back to canvas”，其它注册语言沿宿主fallback链。移除失效64px占位，不动OpenReel vendor代码。保留现有notifyCanvasClose与stage.set(false)行为，不关闭原画布Tab。

另发现关闭会清空activeSession，导致ClipStage从canvas portal切换到普通树，违背其保活注释。现在保留最后一次render session，使关闭后仍在同一portal display:none，避免editor卸载及立即清空ingestion的processed状态。编辑器project store未reset，语言变化也不以key重挂载。**这保障当前挂载内编辑内容保留，不新增跨节点工程恢复或重载草稿持久化系统。**这些已有能力/缺口不能用本补丁冒充解决。

## 宿主语言契约证据与覆盖边界

只读取以下外部路径，未修改官方DSH、fork或配置：

1. `/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-locale/README.zh.md:12,32,78-86`：设置→常规；loopback偏好由Host `locale.preference`持久化；首载navigator provisional后Host异步接管；slot自动订阅；bind函数身份稳定。
2. 同目录 `lib/client.js:1056-1059,1089-1153`：html lang同步；getLocale/getSnapshot返回稳定不可变快照；subscribe实例方法需保留this；切换或词典注册revision变化；setLocale是唯一偏好写入口。
3. `/Users/x/Desktop/Project/omnimux-desktop-fork/dsh-plugin-desktop/src/client/desktop-settings.ts:68-86`：桌面设置同样消费ctx.locale.bind/register，未发现需要新增桌面语言桥的依据。
4. 本树workflow `src/client/projects/CanvasTab.jsx:25-29`、`WorkflowStage.jsx:31-36`已订阅宿主active；CanvasBridge传入既有canvas i18n。canvas词典仅zh/en，未知语言回退zh，此历史策略未扩改。

Clip原先注册zh/en并bind，但非slot Studio不会因稳定t引用自动重绘。本次新增useHostLocale，直接useSyncExternalStore订阅完整宿主快照，覆盖首次读取、异步Host到达、用户切换、late dictionary与重新挂载读取。分别传到ClipStage和Studio，不建立localStorage、独立选择器或第二语言真源。

覆盖：Clip宿主包裹层已使用t的项目创建、名称/分辨率/帧率标签、保存按钮及返回动作；Stage可见文案刷新。未宣称全套UI完成翻译。

未覆盖：OpenReel vendor Toolbar/Preview/Inspector/Timeline/欢迎页等大量硬编码英文；settings-store.language默认en但没有消费它的UI翻译机制；Studio PRESET_OPTIONS中文方向标签、ErrorBoundary中文、已存saveStatus字符串、hub注册表静态中文标题、其它插件硬编码及canvas外部语言fallback。完整OpenReel翻译需独立词典/组件改造范围，应另立Issue，不属于快速补丁。语言首载/切换/重载的运行验收仍由QA执行。

## 修改文件

均在 `plugins/omnimux-clip/src/client/`：
- `ClipStage.jsx`：返回文案、locale订阅、portal保活。
- `OpenReelStudioTab.jsx`：非slot界面订阅宿主locale。
- `index.js`：现有zh/en新增返回/关闭key，向两个surface注入ctx.locale。
- `useHostLocale.js`：无自建状态的宿主订阅hook。
- `styles.js`：独立非拖拽返回行与自适应文字按钮，删除64px覆盖占位。
- `host-locale.test.js`：首载/变更/revision/重载读取/释放与注入接线测试（非浏览器渲染证据）。
- `canvas-toolbar-mode.test.js`, `viewport-adapt.test.js`：更新旧重叠占位断言，验证非拖拽独立行。

## 首轮 QA 后工程返修（2026-09-08）

### 返修范围与结论

- 已完整读取本报告与 `docs/qa/issue-784.md`。
- **IS_PASS: YES（两项源码返修、跨文件一致性及离线检查范围）**；首轮 QA 提出的两个缺陷均完成修复：
  - QA-784-01：`OpenReelStudioTab.jsx` 的预设配置改为方向 key 与尺寸 value；渲染时调用宿主 t，尺寸只把 x 展示为 ×。`index.js` 补齐 zh/en 的 landscape / portrait / square，Studio 无宿主词典时的中文 fallback 同步补齐。预设实际尺寸值与表单状态不变。
  - QA-784-02：手动保存与 1200ms 自动保存的所有分支均保存 `saving` / `saved` / `saveFailed` 语义状态，hostbar 渲染时翻译。初始空状态保持空白。未添加 locale effect，自动保存依赖仍为 `[hasOpenProject, project]`，不因语言切换重新保存。
- `composition-locale-qa.test.js` 原文件及全部有效断言未修改，SHA-256：`7195cff01bc02bb438c582baf999010876b49fd13c892618f9f7c8b7c5a2c218`。

## Rebase 远端 main (含 #778) 与收尾验证（2026-09-09）

### 1. Rebase 身份与基线对齐

- 本分支 `agent/cross-composition-locale-issue-784` 已成功 rebase 至最新 `origin/main`：
  - Base Commit: `e416238631cc78ef8caeab7b5313d9571947ef5a`（feat(analytics): adopt dsh-ui-kit composite components）
  - 已包含 PR #803 / Issue #778 合入 Commit: `368294ec2856f2b54b5aecee1e89719e68d410fe`
- Rebase 过程顺畅，无业务冲突；自动继承了 commit `10feef50` 为 `ClipStage.jsx` 引入的 UI 门禁豁免注释 `/* exempt-ui01: 剪辑器关闭按钮 */`，与设计系统硬门禁规范完美对齐。

### 2. 本地静态门禁与单元测试验证

所有命令均在本任务工作树执行，前置 `pnpm_config_verify_deps_before_run=false`，禁止隐式安装与 purge。

| 检查项 | 命令 | 实际结果 | 证据说明 |
|---|---|---|---|
| 全量单元测试 | `corepack pnpm --filter omnimux-clip test` | **exit 0** | **104/104 pass**, 0 fail, 0 skip, 12 suites；原 QA 4 项与第二轮新增 6 项行为用例全部保持绿灯 |
| Stage 契约门禁 | `corepack pnpm verify:stages` | **exit 0** | 10 Stage components, 8 registered sidebar targets 全部合规 |
| 插件边界门禁 | `corepack pnpm check:boundaries` | **exit 0** | 2148 个源文件依赖与运行时边界校验通过 |
| 国际化文案门禁 | `corepack pnpm lint:i18n` | **exit 0** | 8 locale files / 12 manifests 100% Quality Gate Passed |
| UI 规范门禁 | `node scripts/scan-ui-gates.mjs` | **exit 0** | 分析 276 个视图源文件，0 违规拦截（UI01~UI10 全部合规） |
| 客户端构建 | `corepack pnpm --filter omnimux-clip build` | **exit 0** | 成功生成 `lib/client.js`（9540210 bytes） |
| Git 差异校验 | `git diff --check` | **exit 0** | 零空白错误与格式问题 |

### 3. `scripts/dev-env.sh` 与 L2 环境启动门禁及 #778 支持核实

- **`scripts/dev-env.sh` 逻辑核实**：
  - 在包含 #778 的最新代码中，`scripts/dev-env.sh` 的 `assert_l2_source_deps` 保持严格校验不变（严格遵循 #778 PRD A07 设计原则：原 L2 校验逻辑保持不变，不增加跳过或允许外部路径的开关）。
  - 要求遍历 `manifest.dependencies`，所有 `file:` 依赖必须匹配 `file:.materialize-snapshots/plugins/${name}`，且 `.materialize-snapshots/plugins/${name}` 及其 `package.json` 必须真实存在，`pnpm-lock.yaml` 不得包含绝对路径。
- **#778 的支持与正常启动方式**：
  - Issue #778 实现了受管单包 tarball 纳管 pipeline（`scripts/managed-tarball.mjs`、`scripts/sync-to-app.sh`），提供了将外部 tarball 自包含化为受管 snapshot 并同步生成规范依赖和锁文件的能力。
  - 目前真实 Dev profile（`~/.omnimux-dev/profiles/omnimux/package.json`）中 `@crosery/dsh-viewer` 仍为历史外部绝对路径 tarball。根据 778 PRD A11/A12 的流程规范，需由主理人协调窗口执行正式的 Dev 单包修复物化。物化完成后，真实 Dev profile 即可满足 `scripts/dev-env.sh` 的全部严格门禁要求，从而正常启动 L2；亦可在测试中指定已合规的 `OMNIMUX_L2_SEED_PROFILE` 启动。
  - 本任务树严格遵守约束，未直接修改共享 Dev profile，未擅自物化。

### 4. QA 验收准备结论

- **代码与门禁状态**：**已完全准备好进入 QA 验收**。
- **后续动作**：由主理人协调解除 Dev seed 依赖后，交由独立 QA 执行真实运行时环境（L2 + ego-browser / Electron 原生 drag 场景）的验收。