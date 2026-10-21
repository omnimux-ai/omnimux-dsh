# 深度视频解释器发现与失败重试 — 验收证据（Issue #3574）

## 结论

- 默认环境（未设置 `OMNIMUX_VIDEO_PYTHON_PATH`）下，`video_depth` 自动选中 `python3.14` 并成功产出深度视频，不再误报缺依赖。
- 显式配置错误解释器时高声失败（不回退）；PATH 里没有任何可用 python 时错误体列出全部尝试过的解释器。
- 画布深度视频节点失败卡片的「重新生成」现在只重跑深度转换：第一次 503 → 点击重试 → 第二次 `/video-depth` 成功，节点收敛 ready，全程没有触发任何视频生成提交。

## 证据清单

| 文件 | 证明什么 |
| --- | --- |
| `real-run-auto.json` | 真实执行 `video_depth`（默认环境）成功，`result.python = python3.14`、保留音轨 |
| `auto-depth-frame.png` / `-stats.json` / `-probe.json` | 输出为灰度深度视频（320×240，R≈G≈B），音频流保留 |
| `real-run-explicit-missing.json` | `pythonPath=/no/such/python` 时报 `video-depth-deps-missing`，消息明确「configured python」，不回退 |
| `real-run-all-missing.json` | PATH 仅含 ffmpeg 时失败，消息列出 `python3.14 / … / python3` 全部候选 |
| `01-error-card.png` | 失败节点显示可行动错误信息与「重新生成」按钮 |
| `02-retry-success.png` | 点击重试后节点收敛为可播放的深度视频 |
| `browser-retry-evidence.json` | 结构化断言：error 态字段、重试按钮存在；两次请求均为 `POST /video-depth`；`otherWrites` 为空 |

## 命令

```sh
# 真实能力（默认环境，不设 OMNIMUX_VIDEO_PYTHON_PATH）
env -u OMNIMUX_VIDEO_PYTHON_PATH node --test src/ffmpeg.live.test.js   # 12/12 pass，含 video_depth 灰度+音轨
env -u OMNIMUX_VIDEO_PYTHON_PATH node --test                            # 单元 140 pass / 12 skipped

# 浏览器（ego-browser + 画布 harness 4933；页面内 stub 第一次 503、第二次 200）
# workflow 全量
node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"
```

## 边界与限制

- 不自动安装依赖、不打包 Python；候选链只按通用版本名探测（`python3.14 → … → python3`），显式配置优先且失败高声。
- 浏览器证据中的 `/video-depth` 响应为页面内 stub（第一次失败、第二次成功），用于验证客户端错误卡片与重试语义；真实深度能力由上面的真实执行证据覆盖。
- 本机 workflow 全量测试 2843/2843 通过（含既有 director/import 用例）；`omnimux-video` 单元 140 pass / 12 显式 skip（live smoke 需 ffmpeg）。
