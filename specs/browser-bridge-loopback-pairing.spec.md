# 浏览器插件配对提示纠偏与素材条外观收敛规格 (Issue #2078)

## 1. 业务问题与背景
用户在浏览器（ego lite，加载 `plugins/omnimux-browser/extension/dist`）打开插件浮动工作台时，页面持续显示红色错误「未连接 dsh（请检查设置中的地址与 token）」，发送任何消息都失败；同时页面素材缩略图外多出一层无用的背景卡片。

### 1.1 已确证的事实链
1. **现场状态**：扩展落盘设置为 `ws://127.0.0.1:45120/ext/bridge` + `token: ""`（`…/Local Extension Settings/inmgnhdibihgiobaoclifhmjgkheffeb` 写入序列最后一条）。
2. **实测拒绝**：对活动桥（45120）以空 token 发 `hello` → `CLOSED code=4002 reason=bad token`；带 `~/.omnimux-dev/ext-bridge-token` 的真实 token → `hello.ok`。
3. **令牌强制是有意为之的安全修复**：安全扫描 BROWSER-01（高危）要求「Require the bearer/pairing secret for every client」，`aec5b0750`（PR #1992）据此删除了回环 `chrome-extension://` 免密捷径，并同步改写了 `tests/server.spec.ts` 的断言。**不得回退该修复。**
4. **真正的缺陷是产品表面自相矛盾**：`extension/README.zh.md`、面板设置文案、`panel/strings.ts` 三处仍宣称「Chrome 回环免密 / 留空即可」，而扩展默认 `token: ''`。→ 用户按界面提示留空 → 永远连不上 → 只看到通用的「未连接 dsh」，无任何可执行的下一步。
5. **外观**：`App.tsx` 中 `div.page-media-bar` 给素材条套了一层带边框与底色的卡片。

## 2. 核心改动规范（不改变任何认证判定）

### AC-1: 配对真实情况如实告知（扩展设置与文档）
- `extension/src/panel/strings.ts` 的 `tokenHelp` / `tokenPlaceholder`（zh/en）改为：任何实例（本机回环同样）都必须填写配对令牌。
- `App.tsx` 设置页 Token 字段的内联说明与占位符同步纠正，并给出获取位置（应用侧令牌文件）。
- `extension/README.zh.md`、`extension/README.md` 的「开始使用」第 3 条删除「Chrome 回环无需地址或 Token」的错误承诺，改为两种构建都必须粘贴配对令牌。

### AC-2: 失败时给出可执行的下一步
- `extension/src/background/index.ts` 的 `gatewayRpc`：当桥未连接且 `settings.token` 为空时，错误文案明确指向「还没有配对令牌，请在插件设置里粘贴本机应用的配对令牌」；令牌非空时保持原文案（地址/令牌不符）。
- 文案分中英两版，跟随既有 `getUiLocale()`。

### AC-3: 粘贴容错
- `App.tsx` 的 `saveSettings`：落盘前对 token 做 `trim()`，消除复制带来的首尾空白/换行（桥端按字节精确比对，尾随换行会表现为「令牌错误」）。`bridgeUrl` 不 trim（保持原行为）。

### AC-4: 素材条去除背景卡片
- 移除 `App.tsx` 中包裹 `MediaSnifferBar` 的 `div.page-media-bar`（保留其在 `footer.composer` 内、输入框上方的位置）。
- `styles.css` 删除 `.page-media-bar`，改为 `.composer > .media-sniffer-shelf { margin-bottom: 8px; }` 保持与输入框的间距；缩略图尺寸、选中态白描边、悬浮预览等行为不变。

### AC-5: 回归保护
- 新增/更新单测覆盖 AC-2（空令牌 → 配对专用文案；非空令牌 → 通用文案，中英各一）。
- 既有安全断言（`tests/server.spec.ts` 的回环 Origin 免密必须被拒绝）保持不变，本任务不得触碰 `src/server.ts` 的认证判定。

## 3. 验收证据
- 单测：`plugins/omnimux-browser` 相关 vitest 套件全绿（含既有 `tests/server.spec.ts` 安全断言）。
- 真实浏览器（独立工作树内 Chromium + 真实扩展构建）：① 空令牌状态下发送消息，错误文案指向「配对令牌」而非通用提示；② 填入真实令牌后连接成功（`hello.ok`）；③ 素材条缩略图外无背景卡片，截图落盘。
