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
| `after-narrow-thresholds.json` | 修复后四档：900×560 行高 `180/123/168`、900×480 `180/51/160`、900×400 `180/0/160`（溢出且可滚动 340>311）、900×1400 `655/高/236`（窄而高，max-height 840 未被收窄） |
| `after-narrow-{560,480,400,1400}.png` | 修复后四档窄屏截图 |
| `after-wide-thresholds.json` | 同一次运行里宽屏 `layout-thresholds`（48/248/300/236）仍全绿 |

## 取舍与已知约束

- 画布保底 180px 是刻意优先级：3D 画布是主工作区，时间轴是可折叠辅助面板；折叠时间轴即可把高度还给右栏。
- 收窄上限只在「窄且矮」（`max-width:1023px and max-height:620px`）生效；900×1400 这类窄而高窗口保持 60vh（实测 max-height 840），可继续拖高。
- 放不下时栅格改为可纵向滚动（`max-lg:overflow-y-auto max-lg:overflow-x-hidden`），而不是让内容被 `overflow-hidden` 裁掉；900×400 正是走到该分支的档位。
- 已知既有约束（不在本任务范围）：900px 视口下导演台面板自身只有 279px 宽（左栏固定 220），中列宽仅 51–59px；这是外壳面板宽度决定，本任务只保证高度不被压塌。
