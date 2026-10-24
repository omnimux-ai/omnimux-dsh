# 导演台布局阈值实测证据（Issue #3682）

命令（任务工作树内，`pnpm install --frozen-lockfile` 之后）：

```bash
DIRECTOR_MEASURE=1 DIRECTOR_REAL_UI=1 \
DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
DIRECTOR_FFMPEG=/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg \
node scripts/director-acceptance-3289.mjs
```

## 结果

| 文件 | 内容 |
| --- | --- |
| `layout-thresholds.json` | 修复后一次通过的实测值（阈值、实测、逐项失败为空、越界元素出处） |
| `layout-thresholds.png` | 同一时刻整屏截图：时间轴落在中列（x=949 起，宽 479），不再铺满整行 |
| `measurement-result.json` | 该次运行的断言清单与 `head`（9 条：原 8 条 + `layout-thresholds`） |
| `before-fix-layout-thresholds.json` | 修复**前**一次测量的输出：4 条失败（时间轴宽度、字号 15.21、圆角 50%、边框色非 token）。注意它是**旧口径**产物（当时按元素判定边框可见性、圆角按数值取整），因此它列的引导页实心按钮（border == background == accent）在现在的口径下会被正确排除；它只用于说明当时抓到的偏差，不是当前代码可复现的对照 |
| `default-expected-assertions.json` | 不设 `DIRECTOR_MEASURE` 时的断言清单，逐字为原 8 条 |

## 实测（修复后）

- 顶栏 48px；左栏 248；右栏 300；栅格 `248px 479px 300px`；中列 479。
- 时间轴 236×479，左边界 x=949 与中列一致（修复前 1027×1027，x=701）。
- 右栏 inspector `scrollHeight 1074 ≥ clientHeight 794`，`overflow-y: auto`。
- 含可见文字元素字号集合 `{11,12,13,15}`；圆角集合 `{4,6,8,10,12,999}`；可见边框色只有 `rgb(249,250,251)`（= `--dsw-alias-border`）。

## 口径说明

- 测量范围限导演台 chrome，**包含**视口浮动工具条（#3646 P1-6 点名的按钮/边框/圆角/字号）；只排除 3D 画布本身与瞬时提示浮层。
- 字号只统计「直接含可见文字」的元素，容器继承到的 16px 不代表可见文本。
- 边框**逐边**判定可见性：该边宽度 > 0、颜色非透明、且不等于自身背景色（实心主按钮的同色 accent 描边画不出来，不算边框色）。
- 圆角保留原始计算值（`50%` 不会被记成 `50px`）；固定常量 48/248/300/236 精确命中，只有派生比较允许 1px 取整误差。
