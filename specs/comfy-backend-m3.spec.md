# 规格：托管后端失败态矩阵 + 安装目录与模型目录选择（M3 / Issue #3717）

## 业务目标

M2a 装得起来、M2c 有界面，但失败只有一句「安装失败」：磁盘不够、端口被别的程序占着、装完的版本和当前固定目标不一致，用户都看不出来；安装位置固定、已有的模型目录用不上。M3 把「为什么装不上」讲清楚，并把安装根与模型目录变成用户可选项（默认行为不变）。

## 用户关键操作旅程

1. 用户点「安装后端」→ 宿主先预检（平台支持、目录可写、磁盘够、端口没被别的程序占）→ 任一不通过就立刻返回明确原因与下一步，**不开始下载**。
2. 磁盘不够 → 界面说「需要约 X、可用 Y」并给「更换安装目录」；端口被占 → 说「18188 被其它程序占用」；mac 上不做驱动检查 → 明确说「本机不需要额外驱动」，不假装检查过。
3. 用户点「选择安装目录」→ 原生/浏览式选目录 → 校验绝对路径、可写、空间 → 通过后状态里的安装根立刻变成新目录，后续安装落在新目录。
4. 用户已有自己的模型目录 → 设置后启动参数带上模型路径配置，**不复制不移动**用户文件；未设置时行为与 M2a 一致。
5. 已装版本与当前固定目标不一致（例如升级了插件的固定版本）→ 状态给出「需要更新」+「更新」动作，用新固定版本重装，保留用户数据与模型目录。

## 期望 UI 反馈

- 每类失败一句人话原因 + 唯一主行动（重试安装 / 换目录 / 释放端口 / 更新），不并列多个选择。
- 「本机不需要额外驱动」要说出来，不能沉默（沉默等于假装检查过）。
- 目录设置与模型目录设置放在同一处，默认值可见（默认是插件数据目录）。

## 变更点

1. `preflight.ts`（纯）：`estimateRequiredBytes(target)`（下载 + 解压 + 依赖的保守值）、`checkDriver(target)`（mac arm64 → `not-required`；其它平台 → `unknown` 且**不阻断**）、`runPreflight({target, writable, freeBytes, portFree})` → `{ok, failures}`；失败码：`unsupported-platform` / `install-dir-not-writable` / `insufficient-disk` / `port-occupied`。
2. `settings.ts`（纯 + 落盘）：`{ installRoot?, modelsPath? }`，`validateBackendSettings` 校验绝对路径、存在性、可写、空间；默认空 = 插件数据目录。
3. `plan.ts`：状态新增 `failure: ComfyBackendFailure | null`；`versionMatches(ready, target)` 比较已装 pin 与目标 pin；`modelsConfigYaml(modelsPath)` 生成 `--extra-model-paths-config` 用的 YAML。
4. `service.ts`：安装根来自设置；install/start 前跑预检（注入 `statfsSync` 与端口探测）；失败写 `failure` 码；`.ready` pin 与目标不一致 → `failed` + `version-mismatch`；启动带 `--extra-model-paths-config`（生成 `local-models.yaml`）。
5. `routes.ts`：新增 `GET/POST /omnimux-workflow/api/comfy-backend/settings`（读/改，校验失败 400 + 原因）；`state` 带 `failure`、`settings`、`requiredBytes`、`driver`。
6. 画布：失败分类文案与主行动、目录选择器（复用既有 `pick` / `browse-directory`）、模型目录设置、更新提示；中英双语。
7. 单测：预检四类失败与通过、设置校验（相对路径/不存在/不可写）、版本比对、状态带 failure 码。

## 非目标

win cuda12/13、amd-directml、intel-xpu 的实际安装与驱动下载（M4；本任务只留判定接口与显式拒绝）、模型权重下载、真实出图、M2c 已有六态语义的改动。

## 新用户基线

新用户机器：默认安装根是插件数据目录，模型目录为空（不指向任何开发机路径）；磁盘/端口检查在真实机器上跑，不依赖任何预置状态。

## 假设

1. 假设磁盘需求可用「下载体积 + 解压后体积 + venv 依赖」的保守估计表达，不需要精确预测 pip 解析结果（实测 venv ≈1.9GB、安装根含缓存 ≈668MB）。
2. 假设端口占用可以用「尝试监听 18188 失败」判定，且能区分「我们的后端已在跑」（`/system_stats` 200）与「别的程序占着」。
3. 假设 mac arm64 上不需要额外驱动（PyTorch 用 MPS），因此驱动检查在 mac 上结论是「不需要」而不是「通过」。
4. 假设「版本不符」只由 `.ready` 里的 pin 与当前目标表比较得出，不依赖网络查询最新版本。
5. 假设用户模型目录只需传给 ComfyUI（`--extra-model-paths-config`），插件不负责索引或校验模型文件。

## 证伪方式

1. 若预检不通过仍开始下载（磁盘/端口），则不成立——注入假可用空间与真占端口，断言没有产生下载文件。
2. 若目录不可写却被接受，则不成立——用只读目录验证被拒并给原因。
3. 若 mac 上驱动检查沉默（既不说不通过也不说不需要），则不成立——断言 `checkDriver` 返回 `not-required` 且界面有文案。
4. 若版本不符被当成正常就绪运行，则不成立——手改 `.ready` 的 commit，断言状态是「需要更新」而不是就绪。
5. 若设置模型目录后用户文件被复制/移动，则不成立——记录目录内容与 mtime 前后比对。
6. 若端口被别的程序占用时提示「我们的后端已在跑」，则不成立——用一个非 ComfyUI 的监听者占端口验证文案。

## 验收标准

1. 四类预检失败（平台/目录/磁盘/端口）各有单测 + 真实触发方式；mac 驱动结论为「不需要」。
2. 设置安装目录后：状态里的安装根变为该目录，安装产物落在该目录，只读目录被拒。
3. 设置模型目录后：启动命令含 `--extra-model-paths-config`，生成的 YAML 指向该目录，用户文件零改动（mtime/内容不变）。
4. 版本不符：状态给出「需要更新」+ 更新动作，更新后 pin 与目标一致。
5. 失败分类进状态（`failure` 码），界面按类型给唯一主行动。
6. 单测/typecheck/`pnpm verify:product-baseline`/anti-slop 全绿；真实浏览器证据含「磁盘不足」「端口占用」「版本不符」「目录选择成功」四张。

## 旧标准变更

无（M3 不改既有用例的断言；新增用例均为新增文件）。

## 文档影响

本规格；证据 MD/JSON；`THIRD-PARTY-NOTICES-comfyui.md` 不变（无新第三方组件）。
