# 规格：平台矩阵 + 驱动判定 + 版本绑定与更新（M4 / Issue #3726）

## 业务目标

M2a–M3 把 mac arm64 这条路走通。要 1:1 对齐 MiniMax 的平台矩阵，还得回答三件事：Windows 上三种显卡方案装哪个、这台机器的驱动够不够、以及用户换了方案或我们升级了固定版本之后怎么知道要更新。本任务把矩阵做成**数据 + 显式能力状态**：能装的照旧，装不了的明确拒绝并说明原因，**绝不静默回退**。

## 用户关键操作旅程

1. 用户打开节点 → 状态里带上「这台机器能选哪些方案」（每个变体的支持度与驱动结论）。
2. mac 用户：只有 darwin-arm64 是「支持」，驱动结论是「不需要额外驱动」，无需选择。
3. Windows + NVIDIA 用户：可选 cuda12 / cuda13；驱动版本低于该方案下限 → 该方案标「驱动不满足」并说明需要什么版本；驱动查不到 → 标「未知」而不是通过。
4. Windows + AMD 用户：只有 amd-directml 可选，界面说明它基于较旧的 PyTorch 基座（2.4.1）而不是 2.9.1。
5. 用户选了非本平台/非候选的变体 → 明确拒绝（人话原因），不替换成别的变体。
6. 已装变体或固定版本与当前选择不一致 → 「需要更新」+ 更新动作（保留用户数据与模型目录）。

## 期望 UI 反馈

- 方案列表每行给：名称、支持度（支持 / 候选 / 不支持）、驱动结论、预计体积。
- 驱动不满足时说清「需要什么」；驱动未知时说「查不到」，不许说「通过」。
- AMD 那条要写出基座差异（这是用户会踩的坑：装了 AMD 方案后用不了较新的模型特性）。

## 变更点

1. `plan.ts`：目标表升级为「平台 × 架构 × 变体」，每个变体带 `variant` / `status`（`supported` | `candidate`）/ `notes` / 自己的 pin（Python 运行时、PyTorch wheel、ComfyUI commit）与体积；新增 `listComfyBackendTargets()` 矩阵摘要、`resolveComfyBackendTarget(platform, arch, variant?)`、`driverRequirement(target)`（`none` / `nvidia` / `directml` / `xpu` + NVIDIA 下限版本）。
2. `driver.ts`（新，纯 + 注入探测）：`checkDriver(target, probe)` → `{ status: 'satisfied' | 'unsatisfied' | 'unknown' | 'not-required', detail, required? }`；mac → `not-required`；win-nvidia → 读驱动版本比对下限（cuda12 与 cuda13 下限不同）；win-amd → 查 DirectML 运行时；intel → 查 XPU 运行时；探测不到 → `unknown`（不阻断但也不声称通过）。
3. `preflight.ts`：新增失败码 `driver-unsatisfied`；预检把驱动 `unsatisfied` 计入失败（`unknown` 不计入）。
4. `settings.ts`：新增 `variant`（默认空 = 按本机最稳的方案）。
5. `service.ts`：目标按 `variant` 解析；候选方案需要用户显式选择才允许安装（否则明确拒绝）；`.ready` 记录 `variant` 与全部 pin；变体或 pin 变化 → `version-mismatch`。
6. `routes.ts`：`state` 带上矩阵摘要与所选方案的驱动结论。
7. 画布：方案列表 + 驱动结论 + 拒绝/更新文案；中英双语。
8. 单测：矩阵每个变体的支持度与 pin 完整性、驱动四种结论、`unknown` 不当通过、候选方案需显式选择、变体变化触发更新。

## 非目标

在 Windows/Linux 上真机安装验证（本机没有这些平台，证据里如实标注未验证）；模型权重下载；真实出图；把 cuda12/cuda13 的驱动安装包替用户装。

## 新用户基线

默认仍是「按本机平台解析」：新用户不选也能在 mac 上装好；Windows 用户会被要求选一个方案（因为三种方案互斥且取决于硬件），并且驱动不满足时明确拒绝。

## 假设

1. 假设 python-build-standalone 20261021 同时提供 win32-x64 与 linux-x64 的 CPython 3.12.15 资产（已核对 digest）。
2. 假设 `download.pytorch.org/whl/{cu128,cu130,xpu}` 的 torch 2.9.1 cp312 win_amd64 wheel 可用（已核对存在性与 sha256）。
3. 假设 AMD 路必须用 `torch-directml` 0.2.5.dev240914（要求 torch 2.4.1 / torchvision 0.19.1），因此该变体的基座与其它变体不同。
4. 假设驱动下限可用版本号比较表达（NVIDIA cuda13 要求较新驱动，cuda12 较宽松），不依赖驱动安装包探测。
5. 假设矩阵只声明「我们知道的」，未知就是未知：没有探测手段的平台/硬件一律 `unknown`。

## 证伪方式

1. 若候选方案在用户没选的情况下被安装，则不成立——断言默认解析在 win32 上给出「需要选择」而不是随便挑一个。
2. 若驱动 `unknown` 被当成通过，则不成立——注入探测失败，断言预检不因 `unknown` 放行驱动不满足的变体、界面也说「查不到」。
3. 若驱动不满足仍能安装，则不成立——注入低版本驱动，断言预检失败码是 `driver-unsatisfied` 且没开始下载。
4. 若换变体后旧 `.ready` 仍被当成就绪，则不成立——改 `.ready` 的 variant，断言状态是「需要更新」。
5. 若 mac 上出现「驱动未知」而不是「不需要」，则不成立——断言 darwin-arm64 的驱动结论是 `not-required`。

## 验收标准

1. 矩阵摘要包含 5 个变体，支持度与 pin 与规格一致；每个变体的 pin 完整（URL + sha256 + 体积）。
2. 驱动四种结论各有单测；`unknown` 不阻断但不声称通过。
3. 候选方案需显式选择：默认解析给出「需要选择」，选了不满足驱动的变体给 `driver-unsatisfied` 并说明。
4. 变体或 pin 变化触发「需要更新」。
5. mac 真机：状态里 darwin-arm64 是 supported、驱动 `not-required`、其它变体是 candidate 且驱动 `unknown`。
6. 单测/typecheck/anti-slop 全绿；证据含真实浏览器截图（矩阵列表 + 驱动未知 + 选到不满足被拒 + 更新提示），并如实标注 Windows/Linux 未真机验证。

## 旧标准变更

- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendPreflight.test.mjs` :: `驱动：mac arm64 明确「不需要」，其它平台 unknown 而不是假装通过`
  - 原断言：`checkDriver(DARWIN) === 'not-required'`，并断言 linux 目标解析失败。
  - 必须改的理由：M4 把驱动判定从三态（`not-required`/`unknown`/`unsupported`）升级为四态（`satisfied`/`unsatisfied`/`unknown`/`not-required`）并返回详情对象；同时 linux-x64 从「不支持」变成「有候选方案」。
  - 新期望证据：darwin-arm64 → `not-required`；win32-x64 的 nvidia 变体在注入低版本驱动时 → `unsatisfied` 且带下限；注入探测失败 → `unknown`；`unknown` 不阻断预检。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendPreflight.test.mjs` :: `预检全通过时 ok，且给出需求体积与驱动结论`
  - 原断言：`runPreflight(...).driver === 'not-required'`。
  - 必须改的理由：M4 起预检不再自己判驱动，而是接受 `driverVerdict` 输入（判定在 `driver.ts`，要注入探测）；不注入时结论是 `unknown`，**绝不能默认成通过**。
  - 新期望证据：不注入 → `unknown`；注入 `not-required` → `not-required` 且 `ok` 为真。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendPreflight.test.mjs` :: `设置解析与安装根：坏文件回落默认值，用户值优先`
  - 原断言：`parseSettings` 结果与 `{installRoot, modelsPath}` 深比。
  - 必须改的理由：设置新增 `variant`（M4 方案选择），解析结果多一个字段。
  - 新期望证据：`parseSettings` 结果含 `variant: ''`；坏值回落仍成立。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/plan.test.mjs` :: `mac arm64 命中固定目标：Python 3.12 + torch 2.9.1 + ComfyUI 固定 commit`
  - 原断言：`target.torch.wheel` 与 `target.torch.sha256`。
  - 必须改的理由：`torch` 从单个 wheel 变成 wheel 数组（AMD 那条要装 torch 2.4.1 + torchvision + torch-directml 三个）。
  - 新期望证据：`target.torch.wheels[0].wheel` 含 `cp312`，`wheels[0].sha256` 长度 64。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/plan.test.mjs` :: `不支持的平台显式拒绝，不回退到别的平台产物`
  - 原断言：`win32/x64` → `unsupported-platform`；`linux/x64` → 不支持。
  - 必须改的理由：M4 起 win32/x64 有四套显卡方案（未选方案时不猜，返回 `variant-required` + 选项），linux/x64 有一个候选方案。
  - 新期望证据：`win32/x64` → `variant-required` 且 `options.length > 1`；`linux/x64` → ok 且 `support === 'candidate'`；`darwin/x64`（Rosetta）仍 `unsupported-platform`。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendLog.test.mjs` :: `状态路由仍走共享路径真源`
- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendRoutes.test.mjs` :: `state 走 GET 200；install 走 POST 202；start/stop 各 200 且各调一次`
  - 原断言：不变（假 service 的 `settings`/状态调用次数）。
  - 必须改的理由：`state` 路由新增矩阵与驱动信息，假 service 需要实现 `currentTarget` / `targetProblem` / `driverVerdict` 三个新方法；断言本身不改。
  - 新期望证据：两条用例继续通过，`state` 仍是 200 且 `body.status.state` 正确。
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyBackendFailure.test.mjs` :: `失败码集合与宿主 plan.ts 逐值一致`
  - 原断言：画布失败码清单与宿主 `COMFY_BACKEND_FAILURES` 深比（M4 前是 8 个）。
  - 必须改的理由：M4 新增 `driver-unsatisfied` 与 `variant-required` 两个码，宿主清单变成 10 个；这条用例的价值正是「两边必须一致」，所以画布侧同步加两个码（不改判定方式）。
  - 新期望证据：两边清单仍是深比相等，且新增两码各自的「唯一主行动」是「更换方案」。

## 文档影响

本规格；证据 MD/JSON；`THIRD-PARTY-NOTICES-comfyui.md` 补一句「候选平台的 wheel 来源与未验证状态」。
