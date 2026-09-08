# Issue #764 音频节点工程交接

## QA2 遗留项返修（2026-09-08，修复 F3 与 F4）

- **返修结论：IS_PASS: YES**。F3（并发本地导入覆盖音频账本）与 F4（旧播放错误遮蔽保存/操作反馈）均已彻底修复并经定向测试与全量包测试通过。
- **工作树与范围**：唯一可写范围 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-waveform-764`，分支 `agent/workflow-audio-waveform-issue-764`。未改动主仓、其他工作树、任何 profile、官方 DSH 或桌面仓；未执行 commit/push/deploy。
- **修改文件**：
  1. `plugins/omnimux-workflow/src/workflow/workspace/ProjectAssetsStore.ts`（F3 修复）
  2. `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx`（F4 修复）
  3. `docs/implementation/issue-764-audio-waveform.md`（本文档更新）

### F3 修复细节（P1：并发本地导入覆盖音频账本）
- **根因**：`ProjectAssetsStore.ts` 的 `ingest` 方法在执行 `copyFileIntoImported` 异步文件复制跨 await 期间，直接基于初始读取的旧快照 `current` 进行 `persist`，导致并发执行的 `ingestAudio` 虽然成功在磁盘和账本中登记了音频记录，但随后完成的 `ingest` 将旧快照写回，覆盖并抹除了已登记的音频项目。
- **修复方案**：
  1. 采用两阶段处理：异步文件复制阶段仅收集暂存复制完成的项目 `stagedItems`。
  2. 跨 await 落账前重新执行 `load(workspaceId)` 获取最新账本 `latest`，复核 `projectRoot`、`filePath` 及 `parentId` 的有效性。
  3. 基于最新账本的 `items` 提取已有相对路径集合 `existingRel`，将 `stagedItems` 中尚未登记的项合并入 `latest.current.items`。
  4. 使用 `latest.current` 执行 `persist`，确保保留并发写入的所有资产（包括音频上传），且 `rev` 基于最新账本递增。
- **测试验证**：`audioBytes.qa.test.mjs` 中的用例 `QA2 concurrent local ingest must not erase a successfully registered audio upload` 由 FAIL 变为 PASS（`final.items.length === 2`，`final.rev === 2`）。

### F4 修复细节（P2：旧播放错误遮蔽保存/操作反馈）
- **根因**：`AudioPreview.tsx` 状态展示逻辑原为 `error || fileMessage || waveStatus || ...`，当音频之前触发过媒体加载/播放失败错误后，`error` 始终有值；用户点击“保存到项目”若遭遇网络/CORS错误，`fileMessage` 更新为对应错误文案，但因 `error` 优先级更高，界面依然展示旧的“音频加载失败，请检查文件或网络”，遮蔽了保存操作的真实反馈。
- **修复方案**：
  1. 在用户触发文件或保存操作时（`save()` 及 `fileAction()`），主动清理旧的媒体播放错误（`setError(null)`）。
  2. 调整状态展示渲染优先级为 `fileMessage || error || waveStatus || (target ? 'audio.projectCopy' : 'audio.remote')`，使当前或最新的文件动作状态具有优先可见性。
- **测试验证**：`AudioPreview.qa.test.mjs` 中的用例 `QA2 a failed remote save remains visible after an earlier media load error` 由 FAIL 变为 PASS（正确匹配 `/网络或跨域访问失败/`）。

### 验证矩阵
- **12 个音频测试文件定向**：68 tests / 68 pass / 0 fail / 0 cancel / 0 skip（耗时 ~650ms）。
- **Workflow 完整包单测**：1331 tests / 1331 pass / 80 suites / 0 fail / 0 cancel / 0 skip。
- **类型检查（tsc）**：`pnpm --filter omnimux-workflow typecheck`（canvas + host）exit 0，0 诊断。
- **代码空白与格式检查**：`git diff --check` exit 0。

---

## QA1 后工程返修（2026-09-08，当前有效结论）

- **源码/离线工程 IS_PASS: YES**，F1 遮挡和 F2 远程保存缺口已实施，等待独立 QA 第 2 轮。**总体交付 IS_PASS: NO，真实验收 BLOCKED**，不是上线、合入或 Issue 可关闭声明。
- 固定 base = HEAD：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。唯一写入任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-waveform-764`。保留第一版未提交内容，没有 commit/push/deploy、官方/桌面/其他工作树/profile 修改，没有联系其他成员。
- 已完整读取首版工程报告 125 行、QA1 报告 132 行、三个 `.qa.test.mjs`（143/67/76 行）；QA1 报告及测试不改动。下方“首版历史记录”仅保留当时证据；本节替代其“缺少下载 seam”的当前结论。

### 增量设计与实现

采纳高见远方案，**浏览器正常 CORS 读取当前 selectedSource，Workflow 项目域仅导入有界纯字节**，服务端完全不 fetch URL，不新建 Hub seam、不导入 Hub 私有实现、不安装依赖、不建设通用上传平台。

1. **交互**：远程显示“保存到项目”；成功后当前播放源切为项目副本，再使用“打开音频/文件位置”图标按钮（带中文/英文 aria-label 和提示）。这是批准的“保存本地再使用”两阶段方案，不在保存时触发 native 或生成。保存失败可重试；保存已登记但节点采用失败时保留回执，重试只应用资产，不重下载。原生失败后当前源已是本地，重试不再下载。
2. **F1**：仅音频排除卡片右上替换 overlay，替换以 32px 图标按钮进入播放器底部独立正常流，与 transport/seek 不重叠且不依赖 hover。图片/视频的 overlay 完全保留。150px 卡片、200px 最小宽度不放大为大留白；padding 调为 10px，transport/action 不压缩，长状态可滚动，不靠覆盖隐藏文字。正常两行状态时总高 148px（56+32+32+8+20）。真实布局/hit-test 留给 L2。
3. **前端策略**：HTTPS 远程拒 userinfo，`mode:cors / credentials:omit / referrerPolicy:no-referrer / redirect:error`。同源仅接受实际 `/omnimux/inspiration/media/<key>` 路由，key 允许路径段和扩展名，拒 query、fragment、URL 包装；同源读使用 same-origin 凭据。没有“把任意 URL 变媒体 key”的代码。
4. **预算**：保存流式累计实际字节最多 16MiB，20秒贯穿远程读取和上传；全画布单保存，无队列；拒不透明/重定向/空响应。无 Content-Length 仍受实际累计限制。只在累计检查后创建 Blob，未调用无界 `response.blob()/arrayBuffer()`；保存不沿用波形 600 秒限制。CORS 与网络合并诚实提示，不绕过浏览器策略。
5. **生命周期/输入语义**：`useSaveRemoteAudio` 在 MaterialNode 稳定父级，AudioPreview 继续 keyed remount 清理播放与波形。workspaceId/nodeId/source 当前 ref 与 store 中实际选定源均校验，源切换、删除、切 workspace 取消在途任务。`savedAudioPatch` 只换媒体列表实际选中项，保留其他输出、nodeid、连线、ASR/SRT、参数。通过 `applyCanvasInputMutation` 提交，更新下游共享有效输入；当前 mediaUrl/assetId/relativePath/MIME/大小真实，未知时长为 null，同时清除旧 duration/fileSize/path，避免误用旧 metadata。已登记资产不因切源被删除。
6. **Host 合同**：`POST /omnimux-workflow/api/workspaces/:workspaceId/assets/audio-bytes`，只收 `application/octet-stream`，拒 Content-Encoding 与 URL query。在 `readJsonBody` 前分流，其他 JSON 路由仍 1MiB。读任何 body 前经公开 `ctx.get('connection').requestRejection(req)`、严格 scheme/host/port 同源（Origin/Referer 必有，所有已给头一致）、workspace 绑定检查与单上传锁。没有认证 seat 即 503 fail closed。已有 `audio-file-action` 在相同 raw HTTP adapter 中也先经过连接认证/严格同源/绑定检查，不再只依赖 loopback assertLocalWrite。独立内部 route 单测不等于 HTTP 认证测试。
7. **落盘**：复用 assertProjectWriteSafe、assertDiskSpace、resolveProjectPaths/toProjectRelativePath 和资产账本；额外在创建子路径前与流结束后拒 `assets/imported/.omnimux` 管理父目录的 symlink。排他 `wx+`、0600 文件权限、受管目录0700，16MiB实际大小/20秒/断连清理。随机项目临时名，头部识别规范扩展名，以 `linkSync` 排他发布目标，绝不覆盖已有文件。仅清理本请求同 dev/ino 的未登记文件；发布前复核临时文件身份。无本地目录 fd 原子遍历，不能声称消除恶意同用户并发替换父目录的所有 TOCTOU。
8. **识别/账本**：抽出公共纯 `audioHeader.ts`，native 与导入共用头部判断，不信 MIME 或文件名；支持首版同样的保守容器范围，不把头部初筛当完整解码沙箱。保存至 `assets/imported`，不伪造 generation lineage。登记前重新 load 当前账本并同步 append/persist，避免流上传跨 await 旧快照覆盖已提交结果。保留真实 MIME/大小/未知 duration 元数据，响应只 `{item,rev}`，不回绝对路径或远程签名 URL。

无须修改 `workflow/index.ts`：其已有 getSeam 委托 ctx.get，新增 adapter 通过该公开函数懒取 connection。无新 provider client、凭据或 Hub 写入。

### 本次及累计文件清单

以下均相对唯一任务树根；“首版保留”本轮未修改。累计运行时 20 文件，超出首版 9 个但均服务该闭环。

| 文件 | 状态/职责 |
| --- | --- |
| `plugins/omnimux-workflow/src/shared/api.ts` | 新音频字节路由常量 |
| `plugins/omnimux-workflow/src/shared/projectAssets.ts` | 保存预算与响应 DTO |
| `plugins/omnimux-workflow/src/workflow/routes/canvasRoutes.ts` | JSON 前 raw adapter 分流 |
| `plugins/omnimux-workflow/src/workflow/routes/audioBytesRoutes.ts` | 新增认证/同源/绑定/并发/流式路由 |
| `plugins/omnimux-workflow/src/workflow/routes/projectAssetsRoutes.ts` | 首版保留：native 内部路由 |
| `plugins/omnimux-workflow/src/workflow/workspace/ProjectAssetsStore.ts` | 音频 ingest、最新账本登记与 metadata 持久化 |
| `plugins/omnimux-workflow/src/workflow/ingest/AudioBytesIngest.ts` | 新增受管有界排他落盘 |
| `plugins/omnimux-workflow/src/workflow/audioHeader.ts` | 新增共用容器头函数 |
| `plugins/omnimux-workflow/src/workflow/audioFileAction.ts` | 首版 native 改用共用头检查 |
| `plugins/omnimux-workflow/src/canvas/bridge/apiClient.ts` | 纯字节上传 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/saveRemoteAudio.ts` | 新增浏览器 CORS/字节预算/单并发 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/savedAudioPatch.ts` | 新增选定输出精准补丁 |
| `plugins/omnimux-workflow/src/canvas/editor/hooks/useSaveRemoteAudio.ts` | 新增稳定父级生命周期协调与回执复用 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform.ts` | 首版保留：真实波形 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx` | 保存状态、独立替换和紧凑文件动作 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/MediaPreview.tsx` | 保存/替换回调贯通 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/index.tsx` | 父级保存 hook、音频 overlay 排除 |
| `plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts`、`dict.en.ts` | 保存/预算/CORS/错误双语 |
| `plugins/omnimux-workflow/src/canvas/theme/components.css` | 音频独立正常流、紧凑尺寸 |
| `plugins/omnimux-workflow/src/workflow/audioBytes.test.mjs` | 新增11项 Host/落盘/原JSON限制测试 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/saveRemoteAudio.test.mjs` | 新增6项浏览器策略/预算/patch测试 |
| `plugins/omnimux-workflow/src/canvas/editor/hooks/useSaveRemoteAudio.test.mjs` | 新增2项父级采用/retry/取消测试 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.test.mjs` | 首版2项增加2项保存/native复用与遮挡合同 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform.test.mjs` | 首版8项保留 |
| `plugins/omnimux-workflow/src/workflow/audioFileAction.test.mjs` | 首版7项保留 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.qa.test.mjs` | QA1 6项保留 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform.qa.test.mjs` | QA1 4项保留 |
| `plugins/omnimux-workflow/src/workflow/audioFileAction.qa.test.mjs` | QA1 5项保留 |
| `docs/implementation/issue-764-audio-waveform.md` | 本增量工程报告 |
| `docs/qa/issue-764-audio-waveform-qa.md` | QA1原报告保留，未修改其结论 |

### 实际验证与失败说明

全部命令在指定任务树，`TMPDIR=$PWD/.audio-checks`，`pnpm_config_verify_deps_before_run=warn`；保留 minimumReleaseAge/out-of-sync 警告，不 install、不改守卫，无新增依赖链接。构建产物仅任务树 ignored dist/lib，不作为源码提交。

| 检查 | 当前最终结果 | 证据 |
| --- | --- | --- |
| 全部9个音频定向测试文件 | **53/53**，exit0 | `.audio-checks/fix-targeted-final.log` |
| Workflow完整包 | **1316/1316，80 suites，0 fail/cancel/skip**，exit0 | `.audio-checks/fix-package-final.log`；bash-126 |
| canvas + host typecheck | exit0，0诊断 | `.audio-checks/fix-typecheck-final.log`；bash-127 |
| host/client/canvas build | exit0，三产物成功 | `.audio-checks/fix-build-final.log`；bash-127 |
| stages | exit0，10 Stage / 8 sidebar targets | `.audio-checks/fix-stages-final.log`；bash-127 |
| boundaries | exit0，2139 source files | `.audio-checks/fix-boundaries-final.log`；bash-127 |
| diffcheck | exit0 | `git diff --check`，报告更新后复核 |
| L2 / ego / verify:live / native | **BLOCKED，未执行** | 主理人正式L2启动exit1提供事实，非本轮重跑 |

- 本轮初次类型检查 exit2：两处正则 capture 为 string|undefined；加明确 guard 后正式类型检查通过。
- 本轮初次完整包 1311 项中 1310 pass/1 fail：新增 JSDOM 测试在 Node realm 抛 Error，组件的浏览器 realm `instanceof Error` 无法识别，显示 generic saveFailed。测试改用 `new f.win.Error` 模拟同 realm 真实保存函数错误；未改 QA1 测试、未放宽产品错误判定。补充父级、落盘和布局用例后最终1316全过。
- 全局一致性复核：共享路由/DTO、Host raw adapter 与现有 ctx.get wiring、头部检查复用、selectedSource→bytes→ledger→input mutation 链路、取消/retry、metadata和图结构保留均核对；未见缺失 import、循环运行时 import 或重复头部逻辑。
- 证据边界：JSDOM/源码断言只证明逻辑与声明，不证明真实浏览器 layout、CORS服务响应、解码听感或 native open 成功。头部验证是保守容器初筛，不是媒体安全沙箱。原生请求发出后客户端取消不能撤销 OS 操作。

### 阻断与下一责任人

主理人已正式启动 L2，exit1：Dev seed 的 `@crosery/dsh-viewer` 来自未受管外部 tarball。**不得以测试通过、HTTP200、独立 harness、替代 Host 或手工 profile 修改绕过**。本轮未访问浏览器或原生 GUI、未重试 L2、未修改环境。

下一步由主理人把本工作树完整 diff 与本报告交独立 QA **第2轮**；环境 owner 经独立授权恢复正式受管 seed 后，QA补 L2+ego-browser+共享 verify:live，覆盖200/350/450px双语双主题、长状态、真实WAV/MP3/生成音频、seek、多节点与ASR/SRT/GSC，以及macOS项目副本打开/定位。未过适用层前不可合入、Dev物化或关闭Issue。

---

## 首版历史记录（QA1前，非当前完成结论）

## 结论与状态

- 工程师：寇豆码。仅在 `.worktrees/audio-waveform-764` 实施。
- 分支：`agent/workflow-audio-waveform-issue-764`。
- 固定 base / 当前 HEAD：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。所有实现为未提交 diff；没有 commit、push、merge、deploy 或 profile 写入。
- **已实现部分的全局代码一致性：IS_PASS: YES**，导入、接口、媒体源与资源清理契约已检查，typecheck/build/测试通过，可交独立 QA。
- **完整需求闭环：IS_PASS: NO**。远程音频一键保存到项目尚缺受保护的现有下载入口；真实浏览器与 macOS 原生动作验收尚未执行。本报告不表示上线或可关闭 Issue。
- 风险 **R1**：新增公开本地文件动作 I/O；未改变凭据或已有授权机制。

## 已实现

1. 原生大胶囊替换为 32px 播放/暂停、真实音频采样峰值 SVG、当前时间/总时长。通过 range 支持鼠标、触控及键盘 seek。
2. 播放状态来自 audio 的 play/pause/timeupdate/ended/error 事件，不自动播放。
3. 波形预算：压缩输入最多 16 MiB、已知时长最多 600 秒、8kHz 解码采样率、最多 8 声道、96 个峰值桶；仅一个并发解码器，无无限队列，忙时明确降级并支持重试；缓存最多 16 条、5 分钟，仅存峰值。
4. fetch 有流式累计大小检查、AbortController 与 20 秒取消信号；源/工作区切换通过 keyed remount 清理 audio、解码请求和文件动作。WebAudio `decodeAudioData` 本身不可强制中断，取消后等待底层完成再释放 context，期间不允许新解码。浏览器内部解码峰值内存不能由应用严格限制，该限制不等同于硬沙箱。
5. 超预算、网络/CORS/解码失败均明确展示“仍可播放”，降级为普通时间进度条，不制造假波形。静音表现为真实零幅值基线。
6. 播放、波形、文件操作共用 `resolveMediaPreviewUrl` 选中的 URL。动作目标只从同源 canonical project-file URL 派生，并验证当前 workspaceId，绝不借用无关 node.relativePath。
7. 项目副本提供“打开音频”“文件位置”，调用真实 native open/open -R。成功消息只表示系统请求已完成，不声称已人工确认窗口。
8. 深色媒体暗房与现有卡片语言、32px 控件、8px 圆角、SVG 图标、焦点、reduced-motion、中英字典。暗房内容色按 design.md §3.6 例外在音频内部局部映射现有 token，不全壳染色。
9. 仅音频节点高度下限调整至 150px，以容纳波形、时间、状态和文件操作；200px 最小宽度保留。GSC 仅通过 audio-scoped CSS 撑满 completed 包装，不修改 GSC 本身。
10. ASR、SRT、替换、生成工具栏及并行 #763/#760 代码保持不变。

交互参考：SoundCloud 的波形同时表达声音分布与播放进度；Audacity 的真实采样时间定位。未新增竞品调查或播放器依赖。

## 新增公开 I/O 合同

`POST /omnimux-workflow/api/workspaces/:workspaceId/audio-file-action`

```json
{"action":"open","relativePath":"assets/imported/voice.wav"}
```

- action 仅 `open | reveal`，正文必须为 JSON object，不接收任意绝对路径或 URL 执行命令。
- 复用 `assertLocalWrite`；cross-site/外部 Origin/Referer 返回 403，不扩张当前本地写边界。
- 复用 `ProjectAssetsStore.resolveProjectFile` 验证绑定项目、workspace、相对路径、词法 containment、symlink containment 和普通文件。
- 文件扩展名与头部容器签名必须一致。支持 WAV/MP3/AAC/FLAC/OGG Vorbis/Opus，M4A 保守仅接受 M4A/M4B brand；可播放但未识别的容器可能拒绝本地动作，不用扩展名冒充 MIME 证明。
- macOS 固定 `/usr/bin/open`，`shell:false`、单独 argv、`--` 分隔；reveal 使用 `-R`；超时 10 秒、全局单动作并发。
- 非 macOS 501；无效动作 400；非音频 415；繁忙/目标变化 409；系统调用失败 500。现有路径异常继续交上层统一映射。
- 操作对象是项目副本，不定位原始导入文件；不复制路径冒充 Finder 成功。

## 未完成与偏离

### 远程保存：确切阻塞

Workflow `assets/ingest` 只支持本地 `paths`，`ProjectAssetsStore.ingest` 走 `copyFileIntoImported`。`persistGeneratedArtifact` 接收已有 tmpAbs，不接受远程 URL。Hub `media/job.js` 下载由生成任务内部使用，Workflow 现有 gateway 只有生成/轮询下载语义，没有可供 arbitrary existing audio URL 保存的受保护中性 seam。

因此没有新增任意 URL 下载代理，也没有跨插件 import Hub 私有实现。远程仍可直接播放/尝试 CORS 波形，本地动作禁用且提示保存并导入项目。**这不等同于用户要求的一键“远程先保存项目本地再访问”，该项仍未完成。** 下一责任人主理人：确认复用路径或建立 Hub 安全下载 seam 的独立依赖任务，再补此功能；不得以当前测试绿灯关闭需求。

### 验收限制

- 按主理人指令未操作 ego-browser、L2、任何 profile 或系统 GUI，没有真实浏览器截图或 Finder/system player 实测。
- JSDOM 生命周期测试只证明 React 事件/清理，不证明浏览器音频解码、音频播放、seek 实际听感或原生 open 行为。
- 主理人已有 ego task14 与 L2 环境处理上下文，下一步由主理人转独立 QA 并安排环境恢复。
- UI skill 外部 update 脚本未运行，避免潜在外部写入；engineering-workflow skill 声明的 references 路径不存在，未杜撰读取结果。

## 文件清单

运行时代码 9 个文件，符合优先 ≤10 的目标；另有 3 个测试文件和本报告。

| 文件（相对仓根） | 变更 |
| --- | --- |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx` | 新增播放器、状态与本地动作 UI |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/MediaPreview.tsx` | 音频分支接入与 keyed remount |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/index.tsx` | workspaceId 传递、音频高度/CSS scope |
| `plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform.ts` | 真实峰值、预算、缓存、源目标解析 |
| `plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts` | 24 项中文音频文案 |
| `plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts` | 对应英文文案 |
| `plugins/omnimux-workflow/src/canvas/theme/components.css` | 音频范围紧凑布局与暗房色 |
| `plugins/omnimux-workflow/src/workflow/audioFileAction.ts` | 受保护本地 native runner |
| `plugins/omnimux-workflow/src/workflow/routes/projectAssetsRoutes.ts` | POST 路由与原有写保护 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.test.mjs` | 2 项播放器生命周期测试 |
| `plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform.test.mjs` | 8 项真实峰值/预算/缓存/源选择测试 |
| `plugins/omnimux-workflow/src/workflow/audioFileAction.test.mjs` | 7 项安全/native 参数测试 |
| `docs/implementation/issue-764-audio-waveform.md` | 本报告 |

依赖链接仅建在任务树 node_modules 位置并指向主仓已有依赖；没有 install/bootstrap。构建产物为任务树 `plugins/omnimux-workflow/dist/index.js`、`lib/client.js`、`lib/canvas.js`，均为 ignored，不应提交。Stage 捕获器可能生成任务树其他插件 ignored client 产物，不涉及共享 profile。

## 实际验证

pnpm 11 默认 verifyDepsBeforeRun=install 尝试自动安装，无 TTY 拒绝，exit1；未允许 purge、未设置 CI。检查 pnpm 实现后仅在命令环境设 `pnpm_config_verify_deps_before_run=warn`，使用已有依赖并保留 minimumReleaseAge 不一致警告，不修改配置文件。

最终使用：

```bash
export pnpm_config_verify_deps_before_run=warn
TMPDIR="$PWD/.audio-checks" pnpm --filter omnimux-workflow test
pnpm --filter omnimux-workflow typecheck
pnpm --filter omnimux-workflow build
pnpm verify:stages
pnpm check:boundaries
git diff --check
```

| 检查 | 最终结果 |
| --- | --- |
| Workflow 完整 test | **1280 tests / 1280 pass / 0 fail / 0 cancelled / 0 skipped，80 suites**，bash-92，exit0 |
| 新增定向用例 | 17 项，均包含在最终完整包结果中 |
| canvas + host typecheck | 0 诊断，bash-90，exit0 |
| host/client/canvas build | 3 份成功，bash-90，exit0 |
| verify:stages | **10 Stage / 8 sidebar targets**，bash-90，exit0 |
| check:boundaries | **2127 source files**，bash-90，exit0 |
| git diff --check | exit0 |
| 真实浏览器、原生文件动作 | **未执行** |

失败修复记录：
- 初次完整测试 1263 项中 1258 pass / 5 fail：3 项缺 hub 测试依赖，2 项项目创建 500；补任务私有依赖链接后 1278 项中 1276 pass / 2 fail。
- 500 精确响应为 `refused to emit a secret`，因为 `.task-tmp` 临时路径含 `sk-t`，触发既有 sendJson 正则。改用同工作树 `.audio-checks`，未改守卫。
- 新增 JSDOM 两项初次缺 MessageChannel，补齐与仓内既有 fixture 同样的实现后 2/2 pass；最终全包 1280/1280。
- 初次独立类型检查期间临时类型编辑造成 3 条诊断，立即还原正确 AudioContext 类型；最终正式包 typecheck 0 诊断。
- Stage 最初缺依赖，补齐任务树链接后正式入口全通过。

## QA 必测

1. 实际 WAV/MP3 与生成音频：不自动播放、play/pause、ended、鼠标与键盘 seek、时间与声音同步。
2. 静音、瞬态、立体声、短片与 >600 秒或 >16MiB：真实波形或诚实降级，播放仍独立。
3. 同时多个音频节点、快速替换、删除/切换工作区、网络失败/CORS、失效本地文件。
4. 200/350/450px 节点宽度、浅/深主题、中英、键盘 focus、长状态文字与 GSC ASR/失败/完成过渡。
5. macOS 打开/定位当前项目副本；带空格中文和 shell 字符的文件名；原始导入文件不被误定位。
6. POST 跨源、绝对路径、父目录遍历、symlink 逃逸、非音频伪装、非 macOS 显式失败。

## 主仓观察

07:39 只读 `git -C <primary> status --short` 发现主仓存在其他任务的 Market 与 Hub workbench 改动。该状态不能宣称 clean；本任务未写这些路径，也未覆盖/清理其他任务工作。由主理人协调，不影响本任务工作树的固定 base 与改动清单。
