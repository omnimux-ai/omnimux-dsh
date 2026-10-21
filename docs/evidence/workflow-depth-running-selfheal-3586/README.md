# 深度视频运行态自愈 — 验收证据（Issue #3586）

## 现象与根因

深度转换是一次同步请求（用户素材 8.75s / 576×1024 / 24fps 实测 **56.6 秒**）。请求在 Dev 宿主重启或页面刷新（Cmd+R）时被中断，但画布持久化的派生节点仍是 `executionStatus: 'running'`；加载后无人收敛，且再次点源视频胶囊会因「已有 running 下游节点」返回 `noop`，于是永久停在「生成中…」。

## 修复

- 模块级活跃集合：请求开始登记、`finally` 释放（`depthConversionActivity.ts`）。
- `planVideoDepthProvisioning` 增加活跃判定：真正在跑 → `noop`；running 但失联 → `update`（清旧媒体、重新开始）。
- 派生节点挂载自愈：`origin === 'video_depth'` 且 running 但无活跃请求 → 收敛为 error（「上次深度视频转换被中断，请重试」），露出「重新生成」。
- 不改请求方式、转换耗时与推理参数。

## 证据

| 文件 | 证明什么 |
| --- | --- |
| `01-selfheal-error.png` | 重新加载后，遗留的 running 深度节点自动变为「生成失败 + 上次深度视频转换被中断，请重试 + 重新生成」 |
| `02-rerun-success.png` | 再点源视频「深度视频」后真正重跑并收敛为可播放节点 |
| `browser-evidence.json` | 结构化断言：自愈后 `executionStatus=error`、文案含「中断」、重试按钮存在；重跑后 `completed`、`realPath` 回填、恰好 1 次 `POST /video-depth` |

## 命令

```sh
cd plugins/omnimux-workflow
node --test src/canvas/editor/utils/depthConversionActivity.test.mjs src/canvas/editor/utils/planVideoDepthDownstream.test.mjs
node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"
node --test tests/e2e/depth-running-selfheal.e2e.test.mjs
node scripts/canvas-harness.mjs --port 4934   # 浏览器证据
```

## 边界与限制

- 自愈只针对 `origin === 'video_depth'` 的派生节点；源视频节点不动。音频提取的同类历史问题不在本任务范围。
- 深度转换仍是同步请求，不支持断点续跑/进度百分比；转换耗时与推理参数未改（8.75s 素材约 56.6s，长视频会更久）。
- 浏览器证据使用页面内 stub 响应，验证客户端自愈与重跑链路；真实转换耗时与输出由 `video-depth-uv-3580`/`ffmpeg.live.test.js` 证据覆盖。
