# 实机验证证据 · 复刻气泡「会话关联上下文」残留根治（Issue #2074）

同一支探针、同一套真实完整应用 + 无头 Chromium，只切换「被加载的 omnimux 构建」，做 A/B 对照。

| 观测项 | 基线（本机开发版已装的 main 构建） | 本工作树构建 |
| --- | --- | --- |
| 旧气泡残留引用块（refChip）数 | **2** | **0** |
| 旧气泡残留图标（svg）数 | **2** | **0** |
| 旧气泡子元素数 | **5** | **1** |
| 旧气泡高度 | **434px** | **42px** |
| 旧气泡可见文本 | `探针旧消息：复刻这条爆款视频` | `探针旧消息：复刻这条爆款视频` |
| `__omnimuxHubEvents.pushViewport` | `undefined` | `function` |
| `getUiContext().attachedContextText` | 含 `### 会话关联上下文` 与 `@inspiration/probe-2074.mp4` | 同左（能力零回退） |

结论：
- 基线复现了用户报的现象——数据块文本被擦除，但承载图标的元素残骸留下，气泡被撑到 434px；
- 本工作树构建下同一形态的气泡被整块拆除，只剩 1 个正文节点、42px，且不再有孤立图标；
- 附件上下文仍由宿主原生 `agent/pre-step` 通道携带（`attachedContextText` 完整），模型侧能力零回退；
- 新增的提交时即时心跳门面已随构建生效。

## 命令与入口

```
# 基线（只读本机开发版已装构建，不修改任何 profile）
PROBE_BASELINE=1 node tmp/context-block-residue-probe.mjs

# 对照（把本工作树的构建装入任务私有 profile）
node scripts/build-client.mjs --cwd plugins/omnimux     # 先构建客户端产物
node tmp/context-block-residue-probe.mjs
```

探针通过 `createTestEnvironmentStarter({ fs })` 的依赖注入，只改写**任务私有** profile 的 `node_modules/omnimux` 指向：
本工作树 `plugins/omnimux`（其余依赖仍投影本机开发版，只读）。不触碰 `~/.omnimux-dev` / `~/.omnimux` 本体，
不带入任何 Dev/Prod 凭据，进程结束即自清理临时目录与浏览器。

## 证据文件

- `docs/evidence/context-block-residue-report.json`（本工作树构建）
- `docs/evidence/context-block-residue-report-baseline.json`（基线）
- `docs/evidence/context-block-residue-legacy-injected.png` / `baseline-context-block-residue-legacy-injected.png`
- `docs/evidence/context-block-residue-after-send.png` / `baseline-context-block-residue-after-send.png`

## 未覆盖 / 受限项（如实记录）

1. **A 组「真实发送链路」在该夹具下未打通**：`@/workspace/<id>` 直达与点击「新对话」都无法让宿主挂出会话输入框槽位
   （应用停在「选择工作区」页，`__omnimuxComposerActions` 始终未安装）。因此本文件不含「挂附件 → 回车发送 → 读新气泡」
   的实机断言；该路径由单元测试 `attachment-bridge.test.js` 与端到端用例 `tests/e2e/clean-submit-flow.e2e.test.mjs`
   在真实桥接模块上覆盖（断言草稿保持用户原文、正文不含数据块与附件路径）。
2. **B 组为等价形态注入**：注入的是与宿主 `projectUserText` 同构的气泡结构（`plainRun` + `refChip` + `svg`），
   而非真实历史消息重放；它覆盖的正是残留产生的同一渲染路径。
3. 探针脚本本身不提交（位于被忽略的 `tmp/`）；本文件与 JSON/PNG 为任务证据。
