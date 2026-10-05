# 证据 · Google Vids 四生成模式 1:1 交互复刻（Issue #3181）

- 日期：2026-10-05
- 工作树：`.worktrees/video-vids-four-modes`（分支 `agent/video-vids-four-modes-issue-3181`，基底 `origin/main` `ec3c4c66e`）
- 规格：[specs/google-vids-four-modes-3181.spec.md](../../../specs/google-vids-four-modes-3181.spec.md)
- 调研真源：`.agent-reports/google-vids-clone/research-google-vids.md`（官方 UI 双语原文）、`.agent-reports/google-vids-clone/current-state.md`（本仓现状审计）

## 1. 真实浏览器走查（隔离工作树 Web QA，`mode=ui`，端口随机）

命令：`pnpm verify:app -- --journey .workbuddy/qa-journeys/vids-four-modes-3181.mjs`
结果：**通过**，应用级 38 项断言全绿，其中本票 journey **26/26**。
原始报告：[app-qa-report.json](app-qa-report.json)

真实用户路径：展开「探索」→ 点击「Google Vids」→ 中栏生成页渲染（1000×713，可见）→ 逐模式切换与交互。

| 断言 | 结果 | 证据 |
| --- | --- | --- |
| 入口点击后中栏面板可见（非空白） | PASS | `modes-create.png` |
| 四模式页签 = 创建 / 动画 / 修改 / 延续（官方标签） | PASS | `modes-*.json` 的 `tabs` |
| 参数控件存在且取值域 = 4–12 秒 / 720p·1080p·4k / 横向·纵向 | PASS | `modes-*.json` 的 `selects` |
| 各模式附件行：创建=无、动画=添加图片、修改=添加视频+添加、延续=添加视频 | PASS | `modes-*.json` 的 `attach` |
| 提交键文案：创建/动画/修改=生成，延续=提交提示 | PASS | `modes-*.json` 的 `submit.submitLabel` |
| 校验失败时提交键禁用且给出可读原因（不静默提交） | PASS | `submitReason=请先填写提示词` |
| 结果卡动作行含 插入 / 重新创建 / 改提示词 | PASS | `modes-*.json` 的 `actions` |
| 「插入」在剪辑器未就绪时给出可读原因（不静默失败） | PASS | `modes-insert.json` → `剪辑器未就绪，请先在右侧创建或打开剪辑工程` |
| 「改提示词」把该卡片提示词回填输入区 | PASS | journey `edit-prompt-refills-composer` |

截图：`modes-create.png`、`modes-animate.png`、`modes-modify.png`、`modes-extend.png`、`modes-insert-after-click.png`。

### 环境边界（如实标注）

隔离 Web QA 运行器只起 DSH 服务、不起 Electron 窗口，本帧**没有剪辑工程**（编辑器未就绪）。因此：

- 提示词输入框按设计处于门禁态，显示占位符「请先在右侧创建或打开剪辑工程...」；
- 提交键按设计禁用并显示原因（这正是要断言的用户可见行为）；
- 「插入」不投递跨插件事件，而是显示可读原因（同上）。

**未覆盖**：真实生成调用（上游 `first_frame` / `video_edit` / `video_extend` 三个操作仍是草稿态未上架，见 §4）；跨插件插入事件的真实消费（需要已就绪的剪辑工程，属 Electron/应用形态）。

## 2. 单元与契约测试

| 命令 | 真实退出码 | 结果 |
| --- | --- | --- |
| `pnpm --filter omnimux-video test` | 0 | 231/231 通过 |
| `pnpm verify:stages` | 0 | 14 个 Stage 组件、8 个侧栏目标 |
| `node --test scripts/verify-anti-slop.test.mjs` | 0 | 3/3 通过 |

新增/更新的测试写域：`src/shared/veoTaskSpec.test.js`（契约与校验）、`src/contracts/veoContracts.test.js`（服务端接受四模式请求）、`src/http/veo-routes.test.js`（字段透传）、`src/client/google-vids-modes.test.js`（客户端纯逻辑 34 断言）。

## 3. 与官方 Google Vids 的差异（有意为之，已记录）

| 项 | 官方 UI | 本实现 | 理由 |
| --- | --- | --- | --- |
| 时长域 | 文档写 3–10 秒 | 4–12 秒（默认 10） | 上游服务把 `seconds` 钳到 `max(4,min(12,·))`；UI 若给 3 秒等于让服务端静默改写用户意图 |
| 分辨率域 | 720p / 1080p | 720p / 1080p / 4k | 上游白名单含 `4k` |
| 修改模式输入 | 上传一个视频 | 选一个本会话片段 + 可选替换图 | 上游 `modify` 要 `video_id`（+替换图），不接受任意上传 |
| 动画模式 | 图片 + 运动提示词 | 同 | 上游 `animate` 要求 `image_url` |
| 布局 | 中栏画布 + 底部时间轴 + 右侧边栏 | 中栏生成 + 右侧分屏剪辑 | 本仓产品决策（用户指定左右分工） |

## 4. 已知缺口（不在本票范围，需另票）

1. **真实业务请求未接入**：本票只落地插件端交互与请求契约；中枢 vids2api 通道（PR #3169）尚未合入主干。
2. **中枢文档字段表缺 `operation`**：`docs/contracts/hub.md` 的 `videoGenerate` 请求字段表未列 `operation`/`resolution`/`aspectRatio`，但执行链路要求 `operation`；接入真实业务前需补齐。
3. **剪辑侧不认识 `4k`**：插入消费端只识别 `'1080p'`，`4k` 会退成 1280×720；本票不改剪辑器。
4. **上游三操作仍是草稿态**：`first_frame` / `video_edit` / `video_extend` 未上架，无法 live 验收。
5. **删除的能力**：移除了「放大」按钮与其本地假进度（官方生成流程无此步骤，且伪造进度违反 UI 规范）。
6. **孤儿模块已清理**：删除升频能力后 `src/client/veo-timers.js` 失去全部调用方，已连同其测试一并删除（轮询定时器的清理路径回到 hook 内直接使用 `clearInterval`，生命周期静态检查可见）。

## 5. 结论

插件端四模式的界面与交互（模式切换、逐模式输入收集、参数控件与取值域、校验门禁与可读原因、结果卡动作、插入/改提示词联动）已在隔离工作树内经真实浏览器逐模式走查通过；请求契约（模式→操作映射、参数域、必需输入）由单一真源导出并被服务端校验复用。真实生成链路待中枢通道合入后接入。
