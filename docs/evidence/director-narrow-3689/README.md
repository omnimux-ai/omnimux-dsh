# 导演台窄屏矮视口栅格收缩修复证据（Issue #3689）

命令（任务工作树内，`pnpm install --frozen-lockfile` 之后）：

```bash
DIRECTOR_MEASURE=1 DIRECTOR_REAL_UI=1 \
DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
DIRECTOR_FFMPEG=/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg \
node scripts/director-acceptance-3289.mjs
```

测量用 CDP `Emulation.setDeviceMetricsOverride` 把视口切到窄屏两档（ego 的 Page 没有 `setViewportSize`），
每次都展开时间轴后再量，量完清除覆盖继续。

## 结果

| 文件 | 内容 |
| --- | --- |
| `before-narrow-thresholds.json` | 修复前 900×560：栅格行高 `11px 224px 236px`，中列（3D 画布）只剩 11px，时间轴仍占 236px |
| `before-narrow-560.png` | 修复前的窄屏整屏截图（画布几乎不可见） |
| `before-failure.json` | 该次失败明细：`middle column height: 实测 11 vs 期望 >= 180` |
| `after-narrow-thresholds.json` | 修复后两档：900×560 行高 `180/115/168`、900×480 行高 `180/43/160`，两档都无滚动、无重叠 |
| `after-narrow-560.png` / `after-narrow-480.png` | 修复后的窄屏截图 |
| `after-wide-thresholds.json` | 同一次运行里宽屏 `layout-thresholds`（48/248/300/236）仍全绿 |

## 取舍

- 画布保底 180px 是刻意优先级：3D 画布是主工作区，时间轴是可折叠辅助面板。
- 900×480 时右栏被压到 43px（内部可滚动）；此时折叠时间轴即可把高度还给右栏（折叠后右栏回到 30vh）。
- 放不下时栅格改为可纵向滚动（`max-lg:overflow-y-auto`），而不是让内容被 `overflow-hidden` 裁掉。
