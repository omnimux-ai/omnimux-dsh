# Issue 3726 · 平台矩阵 + 驱动判定 + 版本绑定与更新（M4）

- 工作树：`.worktrees/comfy-backend-m4`（分支 `agent/comfy-backend-m4-issue-3726`）
- 依赖：#3690（M2a 安装器）、#3701（M2c 状态界面）、#3717（M3 失败矩阵与目录选择），均已合入
- 一句话：把「这台机器能装哪套」做成数据与显式能力状态——能装的照旧，装不了的明确拒绝并说明原因，绝不静默回退。

## 交付

| 层 | 改动 |
| --- | --- |
| 矩阵 | 目标表升级为「平台 × 架构 × 方案」六个：`darwin-arm64`（supported，真机装过）、`win32-x64` 的 cuda12 / cuda13 / amd-directml / intel-xpu（candidate）、`linux-x64-cuda12`（candidate）。每个方案带自己的 pin（Python 运行时、PyTorch wheel **数组**、ComfyUI commit）与体积估算 |
| pin 核对 | python-build-standalone 20261021 的 win/linux 资产 digest；`download.pytorch.org` cu128 / cu130 / xpu 的 torch 2.9.1 cp312 win_amd64 wheel 与 linux cu128 wheel；PyPI 的 torch 2.4.1 + torchvision 0.19.1 + torch-directml 0.2.5.dev240914（AMD 那条基座是 torch 2.4.1，不是 2.9.1） |
| 驱动判定 | `driver.ts`：四态 `satisfied` / `unsatisfied` / `unknown` / `not-required` + 注入探测；NVIDIA 下限 cuda12 570.0、cuda13 580.0；探测不到一律 `unknown`——不阻断但**绝不声称通过**；mac arm64 明确 `not-required` |
| 失败矩阵扩展 | 新增失败码 `driver-unsatisfied` / `variant-required` / `unsupported-variant`（共 11 个）；三码的唯一主行动都是「更换方案」 |
| 版本绑定 | `.ready` 记录 `variant` 与全部 pin；**换方案也算不一致** → `version-mismatch`（需要更新） |
| 解析语义 | 多候选平台（Windows）不猜：没选方案返回 `variant-required` + 选项；选了本平台没有的方案返回 `unsupported-variant`（**不折叠成「平台不支持」**） |
| 画布 | 方案列表（名称 / 支持度 / 驱动要求与下限 / 体积 / 宿主说明原文）、驱动四态人话、问题行与「选择方案」主行动；未知 id 回落宿主 label；候选 + 驱动不满足时主行动直接变「选择方案」（省一次注定失败的下载） |

## 真实浏览器验收

装置：M4 worktree 的真实宿主 + 同源画布页；mac 真路径 3 张，强制平台（把临时装置的平台解析固定为 win32/x64）2 张。

| 截图 | 方式 | 断言 |
| --- | --- | --- |
| `issue-3726-m4-01-variant-matrix.png` | 真（mac） | 六行齐全：macOS 支持·不需要额外驱动·107 MB；CUDA 12.8 候选·≥570.0·2.7 GB；CUDA 13.0 候选·≥580.0·1.8 GB；AMD DirectML 候选·说明写明基座 torch 2.4.1；Intel XPU 候选；Linux CUDA 12.8 候选·≥570.0·936 MB |
| `issue-3726-m4-02-driver-unknown.png` | 强制平台 | 驱动行 `data-driver=unknown`，未说成通过 |
| `issue-3726-m4-03-variant-required.png` | 强制平台 | 问题行「这台机器有多套显卡方案，请先选一个」+ 唯一主行动「选择方案」，六行全未选中 |
| `issue-3726-m4-04-version-mismatch-variant.png` | 真（mac） | 选择保持本机方案、`.ready.variant` 写成另一个方案 → 失败 +「需要更新」+「更新」 |
| `issue-3726-m4-05-variant-not-applicable.png` | 真（mac） | 选 Windows 方案后安装被拒 → 「这个方案不适用于当前设备，请换一个方案」（不再是「当前设备暂不支持托管后端」） |

宿主侧另验（`issue-3726-m4-step1.json`）：矩阵 6 项与字段口径、驱动四态（注入 probe）、预检 `unknown` 不阻断 / `unsatisfied` 计入失败、`variant-required` 与 `unsupported-variant`、版本绑定配方。

## 验收中修掉的两个界面问题

1. **驱动「未知」只把原因藏在悬停里**：行内原来只说「尚未判定」，精确原因（查不到 NVIDIA 驱动版本）在 `title` 里。现在行内直接显示宿主原因（`unknown` → 「… · 查不到 NVIDIA 驱动版本」；`unsatisfied` → 「… · 需要不低于 X，当前 Y」），`satisfied` / `not-required` 只留结论（避免废话）。
2. **1728×883 下够不到内容（真 bug）**：覆盖层没有滚动容器，实测内容高 1065 / 视口 883，第 6 行方案与「保存」按钮在视口外且滚不到。现在覆盖层 `overflow-y: auto` + 头部 sticky；实测滚到底 `scrollTop 182` → 「保存」按钮 `bottom 867 ≤ 883` 可见，六行方案 + 两个目录 + 保存全部可达。顺带把深色主题下透明底的「选择目录」按钮改成可见底色（原来像不可点）。

## 未覆盖（如实标注）

- **Windows / Linux 的安装没有任何真机验证**：矩阵里 win32 / linux 的 pin、体积、`candidate` 状态都是上游元数据与纯函数结论；端到端「选择 → 安装 → 就绪」需要对应平台的机器。
- **驱动四态是注入探测**，不是真机驱动读取（本机只有 mac；nvidia-smi / DirectML / XPU 探测代码在目标平台上的实际输出未验证）。
- 截图 02 / 03 是强制平台产物（改的是临时装置里的平台解析，未动仓库），不是 Windows 机器。
- 「方案不适用」的失败态要在真的点过一次安装后出现；只打开节点时是「未安装 + 问题行」。
- 矩阵里 `notes` 是宿主中文原文，英文界面下仍是中文（要双语得宿主给 key，避免两边各抄一份漂移）。

## 自动化检查

- 整包 `pnpm --filter omnimux-workflow test` → **3036/3036**（画布 4 个测试文件 37 条含「11 个失败码的画布主行动 == 宿主 failureAction」逐码断言）
- `typecheck` 三段绿；`verify-anti-slop` 3/3
- 旧标准变更：按 spec 声明更新 6 条既有用例（wheels 数组、多候选语义、驱动结论注入、设置新增字段、假 service 新方法、画布失败码清单）
