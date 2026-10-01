# Spec: video_breakdown_analyze 样片保音提质 + 失败诊断落盘 + 真实时长探测

关联分析：`.agent-reports/video-breakdown-zero-shots/root-cause-analysis.md`
影响面：`plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js`（纯后端逻辑，无 UI）。

## 背景与问题

`video_breakdown_analyze` 对 >20 MiB 本地视频由 `prepareAnalysisSampleVideo` 生成压缩样片送多模态模型。当前参数 `fps=1/3,scale=360:-2,-crf 32,-an` 剥除音轨并重降画质；而 `prompts/video-structure-breakdown.md` 硬性要求每阶段输出英文原声台词引用（严禁写「无」），无声输入使模型无法满足必填字段，返回非 Markdown 表格文本 → 解析 0 分镜 → 抛出误导性 guidance。且原始响应被丢弃、空 catch 吞错、`resolveTotalDuration` 本地文件恒回 16 s。

## 验收标准（可测）

### AC-1 样片保留音轨并阶梯提质（Fix B）
- `prepareAnalysisSampleVideo` 对 >20 MiB 输入生成的 ffmpeg 参数：不得含 `-an`；须含 `-c:a aac`；首档参数为 `fps=1`、`scale=720:-2`、`-crf 28`。
- 样片生成后若仍超 20 MiB，按阶梯降级重试（次档 `fps=1/2 + scale=480:-2 + -crf 32`）；全部档位超限或失败时，不得静默回退原视频，须抛出含「请截取视频片段」语义的中文错误（避免直达 `video exceeds` 裸错）。
- ≤20 MiB 输入原样返回原路径，行为不变。

### AC-2 零分镜失败落盘原始响应（Fix A）
- `resolveBreakdownData` 在 `shots.length===0` 时，把模型原始返回文本写入与视频同目录的 `<文件名去扩展名>.breakdown-failed.md`（覆盖写，仅保留最近一次）；写入失败不得阻断错误抛出。
- `buildBreakdownFailureGuidance` 输出末尾须附一行 `诊断原始响应已保存至: <绝对路径>`（仅当落盘成功）。
- 错误文案按返回内容分级：`空响应` / `含竖线但无合法分镜行` / `无任何表格内容` 三种 failureReason 区分。
- 既有 `test/breakdown.test.js` L131/L194 的错误断言保持通过（允许扩展正则，不允许删除断言）。

### AC-3 本地视频真实时长（Fix C）
- `resolveTotalDuration` 优先级：`realMeta.duration` → `meta.duration` → 本地文件 mvhd 探测（复用/等价 `durationFromIsoBmff` 的 ISO-BMFF 解析，或 ffprobe 兜底）→ 16。
- 494 s 本地 mp4 须返回 ≈494（±1 s），从而走长视频 guidance 分支（`isShort=false`）。
- 探测失败静默回退，不得抛错。

## 非目标
- 不改 prompt 文案、不改解析器语法、不做自动重试与长视频分段（独立提案）。
- 不触碰 `plugins/omnimux` 侧 20 MiB cap 与 `chat.js` 传输层。

## 新用户基线
无 ffmpeg 的新用户：>20 MiB 视频收到「样片生成失败请截取片段」的明确错误，而非底层 `video exceeds`；≤20 MiB 路径完全不受影响。
