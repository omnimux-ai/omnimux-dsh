# 灵感分享：云端条目零上传分享路径（Issue #1996）

## 一、目标（Objective）

### 1.1 用户问题

灵感社区有「全部 / 本地 / 云端 / 账号监控」四个标签。**云端卡片同样渲染「分享」按钮**（分享入口在弹层里是无条件渲染的），但点击后直接返回 `404 not found`。

根因：云端条目编号（如 `2789`）只存在于云端库，**不在本地库**（本地库 id 全是 `insp_xxxxxxxx` 形态）。而当前分享链路第一步就是 `store.get(id)` 读本地记录 → 扑空 → 404。这不是缺素材，是**没有区分本地/云端两种数据来源**。

### 1.2 用户诉求

云端灵感本来就在云端，**不应该再下载再上传一遍**；应走「零上传」通道，把云端已有素材地址直接提交发布，秒出链接。

### 1.3 成功标准（可测）

| # | 成功标准 | 判定方式 |
| --- | --- | --- |
| SC1 | 打开任一云端卡片 → 分享 → 「创建链接」成功返回云端真实 `share_url` | 自动化测试 + 真实浏览器证据 |
| SC2 | 云端分享全过程**没有任何素材上传调用**（0 次 upload） | 端到端测试断言 upload 调用次数为 0 |
| SC3 | 发布前对封面、视频分别做可读性探测；封面不可读 → 报错不发链接；视频不可读 → **照常发布**（封面+文案），并在结果区明确标注 | 端到端测试断言标注文案出现且不含播放器 |
| SC4 | 云端条目进度阶段为 `preparing → publishing → done`，**不含 `uploading`** | 端到端测试断言阶段序列 |
| SC5 | 本地条目分享路径**行为不变**（仍是 上传素材 → 发布，阶段含 `uploading`） | 端到端测试回归断言 |
| SC6 | 中英文案 key 集合完全对齐 | 既有 locale 对齐测试 |

## 二、命令（Commands）

```bash
# 中枢单测（注意：src/text/* 有 10 例既有失败，与本改动无关）
corepack pnpm --filter omnimux test

# 域插件单测
corepack pnpm --filter omnimux-inspiration test

# 端到端
node --test tests/e2e/inspiration-cloud-share.e2e.test.mjs

# 静态
git diff --check
```

## 三、项目结构（Project Structure）

| 路径 | 职责 |
| --- | --- |
| `plugins/omnimux/src/official/inspiration-share.js` | 中枢 `inspirationShare` 能力：`publishLocal`（本地上传→发布）与本次新增 `publishRemote`（云端正成地址→探测→发布） |
| `plugins/omnimux/src/official/inspiration.js` | 云端调用原语（`publishInspirationShare` 等），仅中枢可 import |
| `plugins/omnimux-inspiration/src/http-handlers.js` | 域插件 `handleShare`（前置校验 + 后台任务 + 轮询行）与 `handleGetItem` |
| `plugins/omnimux-inspiration/src/share-status.js` | 分享生命周期契约（服务端） |
| `plugins/omnimux-inspiration/src/client/share-status.js` | 分享生命周期呈现契约（客户端） |
| `plugins/omnimux-inspiration/src/client/locales.js` | 中英文案 |
| `tests/e2e/inspiration-cloud-share.e2e.test.mjs` | 本任务端到端 |
| `docs/evidence/inspiration-cloud-share-*` | 本任务证据 |

## 四、代码风格（Code Style）

- 既有范式不变：中枢 `ctx.provide('inspirationShare', api)` 暴露能力，域插件 `ctx.get('inspirationShare')` 消费；域插件**不得** import 中枢内部实现。
- 错误一律用 `OmnimuxError(code, 中文可读原因)`；失败必须落在行上（`share_error`），不得静默。
- 注释解释「为什么」，不复述「做了什么」。

```js
// 云端条目已经在云端，再把素材拉回来上传一遍是纯浪费：直接用现成地址发布。
if (!coverReadable && !mediaReadable) {
  throw new OmnimuxError('omnimux-share-no-asset', '云端素材当前都不可访问，无法生成分享')
}
```

## 五、用户操作旅程与期望界面反馈

### 旅程 A：云端条目分享（本次新增）

1. 用户在灵感社区切到「全部」或「云端」标签，卡片带 `is_local === false` 标记。
2. 点卡片打开预览弹层 → 点右上角「分享」。
3. 弹层内出现分享区，点「创建链接」。
4. **界面反馈（进度，真实阶段）**：
   - 步骤 1「准备素材」高亮；
   - 步骤 2「发布中」高亮；
   - **不出现**「上传素材」这一步（云端零上传）。
5. **界面反馈（成功）**：结果区显示云端返回的真实链接 + 复制按钮 + 有效期，右上角「已发布」标签。
6. **界面反馈（视频不可读，最关键的失败降级）**：仍然成功出链接，但结果区额外显示一条明确提示：**「云端视频素材当前不可访问（上游存储问题，工单 #257），本次仅分享封面与文案」**。分享结果里**绝不出现打不开的播放器**。

### 旅程 B：本地条目分享（回归，行为不变）

1. 用户在「本地」标签打开本地卡片 → 分享 → 创建链接。
2. 进度阶段仍是「准备素材 → **上传素材** → 发布中」，成功后给出云端真实链接。

### 旅程 C：封面也不可读

- 封面与视频都不可读 → 分享失败，错误文案说明云端素材当前都不可访问，**不产生任何链接**。

## 六、测试策略（Testing Strategy）

- 框架：`node --test`（仓库既有）；单测与被测模块同目录 `*.test.js`。
- 层级：
  - 中枢 `inspiration-share.test.js`：`publishRemote` 的零上传、地址绝对化、探测判定、视频不可读降级、封面不可读报错。
  - 域插件 `http-handlers` / `http-entry.test.js`：云端 id 走云端分支、本地行仍走本地分支、阶段序列、`share_notice` 落行、轮询可读到云端任务行。
  - 客户端 `share-status.test.js`：云端阶段列表不含 `uploading`；提示文案渲染。
  - 端到端 `tests/e2e/inspiration-cloud-share.e2e.test.mjs`：SC1–SC5 全覆盖，且断言 **upload 调用次数为 0**。
- 覆盖率期望：新增分支必须有断言覆盖「视频不可读」与「本地不受影响」。

## 七、边界（Boundaries）

### 总是做
- 先落规格再写代码；改动后跑 `omnimux` 与 `omnimux-inspiration` 两个包的测试。
- 云端调用、凭证解析、provider 路由只在中枢 `plugins/omnimux/` 内。
- 真实反映实际动作的进度，严禁前端定时器假造进度。
- 中英 key 集合对齐。

### 先问
- 新增依赖、改数据库 schema、改 CI、改上游接口。

### 绝不
- 域插件 import 中枢内部实现、自带 provider 客户端、保存密钥。
- 静默给一个打不开的播放器。
- 拼装/伪造分享链接。
- 借本次任务修复上游视频存储缺陷（工单 laozhong86/OmniMux#257，本次不修，只如实处理）。

## 八、上游契约事实（已实测确证）

- 上游**没有**「把已有云端条目转成分享链接」的专用接口；但 `POST /api/inspiration/v1/publish` 接受**任意字符串**形式的 `media_url` / `cover_url`，因此可用现成云端地址实现零上传发布。
- 云端公开列表 `GET https://omnimux.ai/api/inspiration/v1/public/inspirations` 返回 camelCase：`id`、`type`、`title`、`caption`、`coverUrl`、`mediaUrls[]`、`embedUrl`、`category` 等；`coverUrl` / `mediaUrls[]` 是**相对路径**，形如 `/api/inspiration/v1/public/media/...`，发布前必须绝对化。
- **实测可读性**：封面匿名可读（抽样 12/12 正常，GET 带 Range 返回 206）；视频/图集公开与登录两条通道均 404（抽样 7/7）。后者是上游存储缺陷（工单 #257），本次不修。
- 该公开媒体端点**不支持 HEAD**（HEAD 一律 404），可读性探测必须用 **GET + `Range: bytes=0-0`**，避免拉全量。

## 九、假设（Assumptions）

1. 云端条目在客户端行上带 `is_local === false`（`loadInspirationsAtomic` 已如此标记），本地行带 `is_local === true`。
2. 云端分享任务不需要跨重启持久化：它没有上传阶段，生命周期以秒计；进程内任务表足够。本地分享仍按既有设计把状态写进本地行。
3. 云端素材地址由客户端从已加载的云端行上取，提交给域插件；中枢负责「只接受 OmniMux 云端素材地址」的校验与绝对化，页面无法借此把任意外部地址发布到用户账号下。

## 十、验收用例（Acceptance Cases）

| ID | 前置 | 操作 | 期望 |
| --- | --- | --- | --- |
| AC1 | 云端行 `is_local:false`，封面可读、视频可读 | POST `/omnimux/inspiration/local/2789/share` | 202 + 任务行；最终 `share_status=done` 且有 `share_url`；**upload 调用 0 次** |
| AC2 | 同上，但视频探测 404 | 同上 | 仍 `done` 且有 `share_url`；行上带视频不可读标记；界面提示「云端视频素材当前不可访问（上游存储问题，工单 #257），本次仅分享封面与文案」 |
| AC3 | 封面与视频都不可读 | 同上 | `share_status=failed`，`share_url` 为空，错误文案说明云端素材都不可访问 |
| AC4 | 本地行 `insp_xxx` | 同上 | 走本地分支：阶段含 `uploading`，行为与改造前一致 |
| AC5 | 云端任务运行中 | GET `/omnimux/inspiration/local/2789` | 200 返回任务行，客户端轮询能读到真实阶段 |
| AC6 | — | 云端分享进行中 | 客户端步骤列表为「准备素材 → 发布中」，**不含**「上传素材」 |
| AC7 | — | 切中/英语言 | 新增文案 key 两侧都存在 |
