# 浏览器验收报告 · Issue #2987 素材卡槽在选素材时按契约拦截

- 工作树：`.worktrees/viewer-slot-admission-issue-2987`，Branch `agent/viewer-slot-admission-issue-2987`，Base `origin/main` 52382e58f
- 方式：ego-browser 真实浏览器（TaskSpace #26，已释放）+ 工作树内真实 `MediaViewerComposer`（esbuild 打包本工作树源码与 `MEDIA_VIEWER_CSS`），`/omnimux/model-catalog` 由 `buildModelCatalog()` 现场生成的真实契约投影供给（minimax-h3，含 inputGroups/maxSizeMb/minDurationSec/totalMaxDurationSec）
- 入口页：`file://.tmp/qa-2987/index.html` → http://127.0.0.1:65147（node serve.mjs，自清理）

## 断言结果（全部通过）

| # | 场景 | 操作 | 期望 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | H3「参考」空态 | 查音频卡槽 | `is-locked`、aria-disabled、title=契约 hint | ✅ `MiniMax H3 参考模式至少需要一张图片或一个视频；音频不能单独输入`（audio-slot-locked.png） |
| 2 | 点击被锁音频 | click | 不入槽且提示 | ✅ ego 判定元素不可交互（aria-disabled 拦截） |
| 3 | 图片入槽 | 图片槽放入 tiny.png | 音频槽解锁 | ✅ 解锁并可点击（unlocked-after-image.png） |
| 4 | 31MB PNG | 图片槽放入 big.png | 拒 + 提示 | ✅ `文件不能超过 30MB`（size-reject.png） |
| 5 | 1s 视频 | 视频槽放入 clip1s.mp4 | 拒 + 提示 | ✅ `视频时长不能少于 2 秒` |
| 6 | 8s+8s 视频 | 连续入两段 8s | 第二段拒 | ✅ `视频总时长不能超过 15 秒`（total-duration-reject.png） |
| 7 | 解锁后音频 | 音频槽放入 tone3s.wav | 正常入槽 | ✅ 1 张卡片（audio-added.png） |

## 范围说明

- 粘贴路径同源走 `rejectionOf` + `groupLockOf`，单测已覆盖；浏览器证据聚焦上传与解锁交互。
- `generation-feedback.e2e.test.js` 在基线同失败（ego fixture 路径预存缺陷），与本改动无关。
