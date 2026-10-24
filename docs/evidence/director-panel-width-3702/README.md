# 导演台窄面板画布列保底证据（Issue #3702）

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
| `before-panel-width.json` | 修复前（#3689 那次运行）：面板 279px / 左栏 220px / **画布列 59px** |
| `before-narrow-560.png` | 修复前窄屏截图（画布只剩一条缝） |
| `after-panel-width.json` | 修复后四档 + 折叠态：面板 279px / 左栏 106px / **画布列 173px**；折叠态左栏 48px / 画布列 231px |
| `after-{560,480,400,1400}.png` | 修复后四档截图 |
| `after-collapsed.png` | 修复后「窄面板 + 左栏折叠」截图 |
| `after-wide-window-narrow-panel.png` | 修复后「宽窗口（1728）+ 面板强制 300px」截图：此时视口媒体查询处于宽屏态，只能由容器查询接管 |
| `after-wide-thresholds.json` | 同一次运行的宽屏断言（48/248/300/236）仍全绿 |

## 实测

| 档位 | 面板 | 左栏 | 画布列 |
| --- | --- | --- | --- |
| 900×560 | 279 | 106 | 173 |
| 900×480 | 279 | 106 | 173 |
| 900×400 | 279 | 106 | 165 |
| 900×1400（窄而高） | 279 | 106 | 173 |
| 900×560 + 左栏折叠 | 279 | 48 | 231 |
| 1728 窗口 + 面板强制 300px | 300 | 114 | 186（时间轴堆叠到第 3 行、右栏整行） |
| 1728×883（宽屏） | 1027 | 248 | 479 |

## 做法

- 面板宽度才是真正的约束（900px 视口下面板只有 279px，与视口宽度并不同步）→ 在 `[data-director-workbench]` 上声明容器，窄面板的列宽分配改由 `@container director-workbench (max-width: 520px)` 决策。
- 左栏按 `min(220px, 38cqw)` 让位，画布列 `minmax(140px, 1fr)` 保底；折叠态保留 48px 轨道，右栏折叠时窄面板下不白占一行。
- 规则只作用于 `[data-workspace-view="scene"]`，preview（`grid-cols-1`）与宽屏（面板 >520px）不受影响。

## 交叉验证

- 「宽窗口 + 窄面板」是容器查询存在的理由（视口媒体查询此时是宽屏态）。证据里把工作台自身宽度压到 300px 构造该状态：窗口 1728、`container-type: inline-size`、画布列 186、时间轴被堆叠到第 3 行、右栏整行——证明生效的是容器规则而不是视口规则。这是**强制宽度探针**（外壳本身不产生该状态），只用于隔离两种机制。
- 折叠态：窄面板 + 左栏折叠 → 左栏 48px 轨道、画布列 231px，折叠状态没有被容器规则吃掉。
- `after-panel-width.json` 带运行身份（`runIdentity.runId/head/base`），可回溯到具体提交。

## 已知约束

- 左栏在 279px 面板下只有 106px，预设按钮会换行/滚动；这是「画布优先」的取舍，折叠左栏可把 231px 全给画布。
- 面板本身为什么只有 279px 由外壳布局决定（侧栏 + 对话区占位），不在本任务范围（Issue #3702 方向 3）。
