# 规格：ComfyUI 托管后端安装与启动（M2a / Issue #3690）

## 业务目标

用户要「画布上放一个 ComfyUI 节点，打开即全屏进入 ComfyUI 编辑器，且自带安装检查与安装」。M1（#3681）已交付页面型节点 + 全屏层，但框里要有真编辑器，机器上必须先有一个在跑的 ComfyUI。本规格做 M2a：**托管后端的安装器与启动器**——从**上游固定版本**拉取（不自建 bundle、不自建 CDN），装到插件数据目录（与我们的源码分离），启动在专用端口 18188，并把状态与进度落成文件供前端读取。

装好并启动后，M1 的节点指向 `http://127.0.0.1:18188` 就能打开**真 ComfyUI 编辑器**（本轮验收即以此为准）。

## 用户关键操作旅程

1. 用户打开 ComfyUI 页面节点 → 后端未安装时（M2c 才做引导 UI，本轮由宿主路由与文档承担）用户经宿主路由发起安装。
2. 安装：下载固定版本 Python 运行时（sha256 校验）→ 解压 → 建 venv → 按平台装固定版本 PyTorch → 拉 ComfyUI 固定 commit 源码 → `pip install -r requirements.txt` → 写 `.ready`。全程进度写 `install-state.json`。
3. 启动：`<venv>/bin/python ComfyUI/main.py --port 18188 --base-directory <userdata> --enable-cors-header "*"`，detached；就绪探测 `GET /system_stats`。
4. 就绪后：节点指向 18188 → 全屏层里就是真 ComfyUI 编辑器（M1 已有能力）。
5. 停止：结束该后端进程（只结束我们自己的 pid）。

## 期望 UI 反馈

本轮不改 M1 的界面（M2c 接状态 UI）。宿主提供 `GET /omnimux-workflow/api/comfy-backend/state` 返回状态机与进度，供 M2c 直接消费。

## 变更点

1. 纯函数计划器 `src/workflow/comfyBackend/plan.ts`：平台/架构 → 目标描述（Python 运行时 URL+sha256+体积、PyTorch 版本与 wheel URL+sha256、ComfyUI 仓库+tag+commit、安装根、端口、预计体积）；状态机取值与进度归一化；平台不支持时明确拒绝。
2. 宿主服务 `src/workflow/comfyBackend/service.ts`：安装根（默认插件数据目录下 `comfyui-backend/`）、`install-state.json`（阶段 + 百分比 + 心跳 + 错误码）、日志文件、并发锁；`install()`（异步任务，重活交给子进程）、`start()`、`stop()`、`state()`、`probeReady()`。
3. 路由 `src/workflow/comfyBackend/routes.ts`：`GET /omnimux-workflow/api/comfy-backend/state`、`POST .../install`、`POST .../start`、`POST .../stop`，并入既有 dispatcher（同一 prefix，不二次 register）。
4. GPL 合规产物：`licenses/ComfyUI-GPL-3.0.txt`（上游 LICENSE 原文）+ `THIRD-PARTY-NOTICES-comfyui.md`（固定 tag/commit、源码获取方式、未修改声明、可分离说明）。
5. 启动参数与目录布局对齐逆向事实：端口 18188、`--base-directory <installRoot>/userdata`、`--enable-cors-header "*"`（浏览器直连，不经网关代理）；ComfyUI 独立目录（升级整目录替换，userdata 保留）。

## 非目标

- 不做前端状态 UI / 安装引导（M2c）；不做失败态矩阵全量（M3）；不做 Windows/Linux/AMD/Intel 平台产物（M4，本轮只落 mac arm64 的真实安装，其他平台在计划器里显式拒绝）。
- 不下载模型权重（用户自备）；不做版本更新流程（M4）。
- 不修改 ComfyUI 源码（用上游固定 commit，一行不改）；不把 ComfyUI 代码折进我们的源码。

## 新用户基线

新用户机器上没有 ComfyUI、没有 Python 依赖：安装器自带固定版本 Python 运行时，不依赖系统 Python、不依赖 homebrew、不依赖用户已装的任何东西；默认安装根在插件数据目录内，不用本机绝对路径或 dev profile 路径。

## 假设

1. 假设 python-build-standalone 的 `install_only` 产物是 relocatable 的（解压即可用，`bin/python3` 可执行），因此不需要系统 Python。
2. 假设 PyPI 的 `torch` 2.9.1 有 mac arm64 / cp312 的 wheel（已核对：`torch-2.9.1-cp312-none-macosx_11_0_arm64.whl`，sha256 `c0d25d1d…ad7e`），装它能覆盖 macOS 的 MPS 推理路径。
3. 假设 `tar`（macOS/Linux 自带、Windows 10+ 自带）足以解压 `.tar.gz` 产物，无需引入解压依赖。
4. 假设 ComfyUI 在 18188 上开启 `--enable-cors-header "*"` 后，画布 island 能直接 iframe 打开并通信（M1 已验证跨源 iframe 可加载）。
5. 假设安装过程放在宿主进程内的异步任务里（重活交子进程），进度写状态文件即可，不需要独立 detached worker（我们的宿主没有 10 分钟 RPC 上限）。

## 证伪方式

1. 若 Python 运行时解压后不能直接跑（依赖系统库/绝对路径），则「不依赖系统 Python」不成立——用解压后的 `bin/python3 -V` 与 `-c "import venv"` 实测。
2. 若 `pip install` 在 venv 里装不动（网络/索引/版本），则安装链路不成立——保留完整日志并如实报告卡在哪一步。
3. 若启动后 `GET /system_stats` 不就绪或端口被占，则「启动即可用」不成立——记录进程退出码、stderr 与端口占用情况。
4. 若 sha256 校验形同虚设（不校验或校验失败仍继续），则不成立——故意改一个字节的产物必须被拒。
5. 若安装把文件写到安装根之外（污染用户目录/源码树），则不成立——安装前后对比安装根与仓库目录。
6. 若真 ComfyUI 页面在 M1 全屏层里打不开（被嵌入限制挡住），则端到端不成立——用真实浏览器打开并截图。

## 验收标准

1. `GET .../state` 在未安装时返回 `not-installed` + 目标描述（平台、Python 版本、ComfyUI tag/commit、预计体积）。
2. `POST .../install` 在 mac arm64 上完成一次**真实安装**：Python 运行时 sha256 校验通过、venv 建成、torch 2.9.1 装上、ComfyUI 固定 commit 源码就位、`requirements.txt` 安装完成、`.ready` 落盘。
3. 安装过程中 `state` 持续反映阶段与百分比（不卡在 0，也不提前到 100）。
4. `POST .../start` 后 `GET http://127.0.0.1:18188/system_stats` 返回 200；`POST .../stop` 后进程结束且端口释放。
5. 真实浏览器：ComfyUI 页面节点指向 `http://127.0.0.1:18188`，打开全屏层后里面是**真 ComfyUI 编辑器**（截图证据）。
6. 安装根之外无新增文件（不污染源码树与用户目录）；`userdata/` 在重复安装/升级时保留。
7. 纯函数计划器单测覆盖：mac arm64 命中固定目标、不支持的平台显式拒绝、进度归一化边界、状态机取值；`pnpm --filter omnimux-workflow test` / typecheck / `pnpm verify:stages` / anti-slop 全绿。
8. GPL 合规产物就位：上游 LICENSE 原文 + NOTICE（固定 tag/commit + 源码获取方式 + 未修改声明）。

## 文档影响

- 本规格；证据 MD/JSON 记录真实安装与启动的关键输出（sha256 校验、就绪探测、浏览器截图）。
- `THIRD-PARTY-NOTICES-comfyui.md` 与 `licenses/ComfyUI-GPL-3.0.txt` 是产品随包合规产物。
