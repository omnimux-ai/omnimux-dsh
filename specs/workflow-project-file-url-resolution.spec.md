# 规格：项目文件流 URL 的视频路径解析（Issue #1827）

## 问题陈述

已绑定项目的创作画布中，视频节点（媒体落在项目 `artifacts/`，节点只有 `relativePath` + `mediaUrl`，没有 `realPath`）点击工具条「提取音频」时失败：

- 浏览器控制台：`POST /omnimux-workflow/api/workspaces/<ws>/extract-audio` → **404**
- 节点卡片：**生成失败 / 未找到指定视频文件**
- 视频文件本身存在且可正常播放，视频处理能力正常（同一请求改用真实绝对路径即 200 成功）。

链路断裂点：前端把节点 `mediaUrl`（项目文件流地址）原样作为 `videoPath` 提交，而后端 `resolveVideoAbsolutePath` 只识别 `?path=`（本机文件地址）、`/omnimux-workflow/media/*`、绝对路径与若干目录拼接，**不识别 `?rel=` 项目文件流形式**。剥掉 query 后得到 `/omnimux-workflow/api/workspaces/<id>/file`，因以 `/` 开头被误判为绝对路径返回，存在性校验失败 → `video-not-found` 404。

影响面：`videoDeconstruct`（内容拆解）、`videoStoryboard`（分镜表）、`audioExtract`（提取音频）共用该解析器。前两者当前被静默保底回退掩盖（见 Issue #1826），本修复是它们在移除保底后仍能真实成功的前置条件。

## 关键用户旅程

**J1 — 已绑定项目画布的视频节点提取音频（主旅程）**

1. 打开已绑定本地项目的创作画布，画布中存在一个视频节点，其媒体来自项目 `artifacts/`（节点无 `realPath`，`mediaUrl` 形如 `/omnimux-workflow/api/workspaces/<ws>/file?rel=artifacts%2F<file>.mp4`）。
2. 点击该视频节点工具条的「提取音频」。
3. 期望：请求返回 **200**；下游音频节点进入就绪态，显示音频时长与可播放的音频；toast 提示「音频提取完成，音频节点已就绪」。
4. 期望（不得出现）：404、卡片「生成失败 / 未找到指定视频文件」。

**J2 — 同一视频节点的「内容拆解」「分镜表」**

与 J1 同源的视频节点点击「内容拆解」或「分镜表」时，解析出的视频路径为项目内真实绝对路径，后续分析基于真实视频而非保底模板。

**J3 — 既有路径形式不回归**

以本机绝对路径、`/api/local-file?path=`、`/omnimux-workflow/media/*`、远程 HTTP(S) 地址提交的操作，行为与修复前完全一致。

## 验收标准

- **AC1**：`resolveVideoAbsolutePath` 对 `/omnimux-workflow/api/workspaces/<ws>/file?rel=<urlencoded rel>` 返回项目内真实绝对路径，且该路径通过存在性校验。
- **AC2**：`rel` 含 URL 编码、中文、空格时仍正确还原（如 `artifacts/1789382217265_b28bc57e-322e-44f7-87e9-629d6966.mp4`、`测试 素材/a b.mp4`）。
- **AC3**：越界或非法 `rel`（`../` 逃逸、绝对路径、空值、不存在文件）不得返回项目根之外的路径；解析失败时按既有语义落到保底返回值，不抛未捕获异常。
- **AC4**：`/api/project-file?workspace=<ws>&rel=<rel>` 别名形式同样可解析（使用路由路径上的工作区标识，不信任 query 中的工作区，避免跨工作区读取）。
- **AC5**：既有形式回归：绝对路径、`?path=`、`/omnimux-workflow/media/*`、`mediaDir` 拼接、HTTP(S) 直通行为不变。
- **AC6**：路由级端到端：`POST /omnimux-workflow/api/workspaces/<ws>/extract-audio` 携带项目文件流 `videoPath` 返回 200，`ok:true`，响应含 `audioPath`/`mediaUrl`/`format`；磁盘产生音频文件。

## 验收用例（自动化，`node --test`）

| 用例 | 断言 |
| --- | --- |
| U1 `?rel=` 编码相对路径命中项目文件 | 返回 `<projectRoot>/artifacts/<file>` |
| U2 中文 + 空格路径 | 返回还原后的真实路径 |
| U3 `../` 逃逸 | 返回值不在项目根之外 |
| U4 不存在的 `rel` | 不抛异常，返回值不存在于项目外 |
| U5 `/api/project-file?...&rel=` 别名 | 同 U1 |
| U6 既有形式（绝对路径 / `?path=` / media 前缀 / http） | 与修复前一致 |
| E1 路由级 `?rel=` 提取音频 | 200 + `ok:true` + 落盘音频文件 |
| E2 路由级越界 `rel` | 404 `video-not-found`（安全边界保持） |

## 非目标

- 不改动前端 `resolveVideoDeconstructPath` 的返回优先级（前端返回 `mediaUrl` 是既定契约，后端应认识本系统自己产生的地址形式）。
- 不改动视频理解 / 抽帧 / 静默保底回退逻辑（归 Issue #1826）。
- 不改动官方宿主发行包，不新增产品能力，不改模型契约。
