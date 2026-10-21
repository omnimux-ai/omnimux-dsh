# 下载反馈与文件名收尾（Issue #3598）

## 用户旅程与目标

用户在 X 帖子页悬停视频点「下载素材」后，应立刻看到「已开始下载」的反馈，并在下载目录里看到一个可辨认的文件名 `x-<tweetId>-<宽x高>.mp4`（例如 `x-2112882593678991837-720x1280.mp4`）。当前两个问题：成功文案在同一帧被悬停提示覆盖；文件落盘名是 CDN 基名 `JLGhO3rA0iSOmU6o.mp4`。

## 范围

- `overlay.ts`：给 outcome 文案加粘滞状态；outcome 存续期间由 `repositionNow()` 重绘的仍是同一条 outcome 文案，而不是 `resolveHint()` 的悬停提示。悬停到其它动作图标时清除粘滞（显示该图标的正常提示），定时器到期清除。
- 文件名：调查结论为**产品侧本来就正确**——`chrome.downloads` 在默认下载行为下采用扩展给的 `x-<tweetId>-<WxH>.mp4`（SW 录到的 `request.filename` 也是该值）；#3592 e2e 落成 CDN 基名是因为 harness 用 CDP `Browser.setDownloadBehavior({behavior:'allow', downloadPath})` 覆盖下载目录后 Chrome 丢弃了 suggested filename。因此本任务不新增文件名代码，仅把结论与两条对照探针记录进证据，并用既有单测继续守住 `x-<tweetId>-<WxH>.mp4` 契约。
- 回归用例追加到既有测试文件（不新建 `.ts` 测试文件）：outcome 粘滞重绘、同图标重绘后的 `pointerenter` 不覆盖成功文案、切到其它图标后粘滞清除。
- 不改下载地址解析（`video-source.ts`）、不动宿主、不改文案与 UI 结构。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | 视频下载成功后触发一次重绘（滚动/尺寸帧） | tooltip 仍是「已开始下载」，不被「下载素材」覆盖；图标勾选状态不变 |
| S2 | 下载成功后把指针移到另一个动作图标 | 显示该图标的正常提示，粘滞 outcome 清除，不再复活 |
| S3 | X 视频下载请求 | `request.filename === 'x-<tweetId>-<WxH>.mp4'`；落盘文件名一致 |
| S4 | 通用站点视频 / 图片 | 文件名仍按 URL 基名，不出现 `x-` 前缀 |
| S5 | 单测 + typecheck + build + 受控 runner e2e | 通过；e2e 断言 tooltip 采样含「已开始下载」且落盘名为 `x-<tweetId>-...mp4` |

## 假设

- 覆盖发生在 `repositionNow()` 的 `showMessage(resolveHint(icon))`：outcome 文案没有独立状态，所以任何一次重绘都会读回悬停提示；给 outcome 一个明确存续期即可修复，不需要改 hint 文案解析。
- X 文件名缺口在 action/plan 层：`downloadMedia` 已经拿到 tweet id 与真实 CDN 地址，因此无论当前哪一层丢了 `filename`，action 层都能在不改解析逻辑的前提下补出可读名。

## 证伪方式

- 若加上粘滞状态后，滚动或尺寸变化仍把 outcome 覆盖成悬停提示（或反向把悬停提示粘住），则假设不成立：用既有 overlay 单测与受控 runner 的 MutationObserver 采样对照重查。
- 若 X 请求的 `request.filename` 仍是空且落盘仍是 CDN 基名，或非 X 站点被错误命名为 `x-...`，则文件名假设不成立：检查 `planMediaDownload` 的候选 origin 与 `videoFilename` 分支，并按实测数据修正。

## 新用户基线

新装扩展默认生效；不依赖宿主连接、不依赖页面额外状态。无可用直链时仍给出「无法直接下载」的诚实反馈。

## 非目标

- 不改成功/失败文案（除沿用现有「已开始下载」）。
- 不改 X variant 选择、CSP 放行、下载权限。
- 不做下载历史、重命名界面或画质选择。

## 回滚

单 PR：revert 恢复重绘时读悬停提示的旧行为与 CDN 基名，无数据迁移。

## 文档影响

无用户文案变更，不改产品契约；PR 描述记录根因与 e2e 证据。
