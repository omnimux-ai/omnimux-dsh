# ComfyUI 托管后端：宿主退出时关闭后端进程

## 目标

宿主（DeepSeek Harness 插件宿主进程）退出时，自动关闭本服务启动的 ComfyUI 后端进程，不再留下孤儿 python 进程。对齐 MiniMax Design 的行为：`backend-owner.json` 记录宿主与后端 pid，宿主退出时清掉。

## 背景

- 实测：OmniMux dev 宿主退出后，ComfyUI 后端（pid 88904，`detached` + `unref` 启动）变成 PPID=1 的孤儿进程，仍占用 18188 端口和约 750MB+ 内存。
- 现状代码：`service.ts` 的 `stop()` 只被 HTTP 路由暴露且无任何调用方；插件 dispose（`workflow/index.ts`）不管后端进程；`start()` 用 `detached: true` 启动后端，宿主进程退出后没有任何清理路径。

## 假设

宿主退出（正常 process.exit、SIGINT、SIGTERM）时执行一个注册的退出钩子：读 `backend-owner.json`，若 `hostPid === process.pid` 则对 `backendPid` 发 SIGTERM 并删除 owner 文件；宿主崩溃/被 SIGKILL 时 owner 文件残留，下次 `start()` 探测到旧宿主已死时先回收（kill 后端 + 清文件）再启动新后端。

## 证伪方式

1. 单测：模拟 owner 文件 + 假 spawn/kill，断言宿主退出钩子只对「自己是 owner」的后端发 SIGTERM，且删除 owner 文件；不是 owner 时不杀。
2. 单测：`start()` 在 `probeReady()` 命中已有后端（别家宿主在跑）时不登记 ownership、不杀；owner 宿主已死（pid 不可活）且后端可探活时，回收旧后端。
3. 单测：手动 `stop()` 同步清掉 owner 文件。
4. 手工验证：Dev 环境启动 ComfyUI → 退出宿主 → `ps` 无残留 python 进程。

## 范围

- `plugins/omnimux-workflow/src/workflow/comfyBackend/service.ts`：owner 登记、退出钩子、孤儿回收、stop 清理、新增 `dispose()`（卸载时摘除退出钩子）。
- `plugins/omnimux-workflow/src/workflow/index.ts`：dispose 时调用 `comfyBackend.dispose()`。
- 新增测试 `comfyBackendOwner.test.mjs`。

## 新用户基线

无新增依赖：新用户没装后端时 owner 文件不存在，钩子空转无副作用。错误表面：owner 文件不可写时仅记日志，不阻断启动。

## 旧标准变更

- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendOwner.test.mjs` :: `孤儿回收：旧宿主已死且后端探活时，kill 旧后端并重启新后端`
  - 原断言：在 ready 分支断言回收顺序，表达绕弯且依赖手写 owner 文件。
  - 必须改的理由：改为「spawn 路径下先 kill 旧后端、再登记新 owner」的直接断言，覆盖真实链路。
  - 新期望证据：断言 kill 收到一次 SIGTERM、spawn 发生一次、owner 文件指向新宿主与新 pid。
- `plugins/omnimux-workflow/src/workflow/comfyBackend/comfyBackendOwner.test.mjs` :: `退出钩子：自己是 owner 时 kill 后端并清掉 owner 文件`
  - 原断言：手写 owner 文件绕过 spawn 路径，owner 登记链路未被覆盖。
  - 必须改的理由：完整走 `start()` spawn → owner 登记 → exit 触发 的真实链路，断言相同效果但覆盖更真。
  - 新期望证据：spawn 后 owner 文件含本进程 hostPid 与 backendPid；emit exit 后后端收到 SIGTERM 且 owner 文件被删除。

## 非目标

- 不做「宿主崩溃后开机自启后端」；
- 不做跨宿主抢占后端（别家 owner 活着就复用，不接管 kill）；
- 不碰 MiniMax Design 的共享安装（`~/.hub-global`，那套有自己的 owner 机制）。
