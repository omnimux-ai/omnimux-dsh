# Issue #2579 链接胶囊：实现与验收报告

工作树：`.worktrees/omnimux-quick-shortcut-link-chip-issue-2579`
分支：`agent/omnimux-quick-shortcut-link-chip-issue-2579`（基线 82b5d1050，本地 origin/main 已前移到 263f74182）
规格：`specs/quick-shortcut-link-chip.spec.md`

## 一、根因确认与修法

| 项 | 结论 |
| --- | --- |
| 根因 | 快捷方式把链接写成提示词槽位**文本令牌** `[视频]`/`[商品]`，而 `usePromptSlotEnhancer` 只用 CSS Custom Highlight 给文本加底色，不渲染组件 → 界面里就是纯文本。`dockStyles.ts` 的 `[data-composer-chip]` 样式与 `AttachmentSubmitBridge` 的读取通道都在，缺的是「创建胶囊节点」这一环。 |
| 修法 | 新增胶囊节点与形态真源，点快捷方式/点卡槽时插入真胶囊（图标 + 名称 + 分隔线 + 可粘贴链接的输入框 + ×）；提交时由既有桥按 `data-omx-*-token` 读回链接。 |

**修正过程中由真实浏览器推翻的一个实现假设（重要）**：最初按规格字面把胶囊插进 `contenteditable` 光标处。
真实环境实测：宿主输入框是 Lexical 编辑器，它每次更新都会清掉自己根节点下的**非受管子节点**——
点「复刻爆款视频」后草稿写对了（`请用我的产品复刻这个爆款视频`），但胶囊节点当场被抹掉
（`chipCount` 2 → 0，卡槽仍显示「已填」）。因此胶囊宿主改为**输入框卡片内、由本插件创建的胶囊行**
`[data-composer-card] > .omx-link-chip-row`：宿主 React 不管这个外部子节点，它稳定存在，
位置就贴在输入行上方，视觉上仍是「输入框里的链接胶囊」。证据见
`runs/` 下的历史运行与 `chip-scenario.json`。

## 二、改了哪些文件

新增：

- `plugins/omnimux/src/client/composer-quick-shortcuts/linkChip.js` —— 胶囊形态真源（种类 → 图标 / 名称 / 占位 / 删除名 / 提交形态 / 令牌属性）、纯转换 `quickLinkChipMarkdown`、宿主通道让路判据 `isQuickLinkChipTarget`。
- `plugins/omnimux/src/client/composer-quick-shortcuts/linkChip.test.js`、`dom.chip.test.js` —— 纯逻辑与节点行为测试（node:test + jsdom）。

修改：

- `composer-quick-shortcuts/dom.js` —— 胶囊创建 / 插入 / 读取 / 删除 / 整组替换 + `omnimux:quick-link-chips:changed` 事件；删掉纯文本 `insertTokenAtCursor`（本轮死代码）。
- `composer-quick-shortcuts/ComposerQuickShortcuts.jsx` —— 点快捷方式：写提示语 → 整组替换胶囊；撤回：写回剥离后的草稿 → 清胶囊。
- `composer-quick-shortcuts/links.js` —— 卡槽两态判据从「草稿里有令牌」改为「输入框里有该种类胶囊」（保留手打令牌兼容），新增 `quickLinkKindsInDraft` / `mergeQuickLinkKinds`。
- `composer-quick-shortcuts/styles.js` —— 胶囊行与胶囊样式（`.omx-link-chip(-row)`），两种胶囊用既有 `--dsw-alias-*` token 区分（视频 = `state-business-primary`，商品 = `state-warn-primary`），零业务内联样式。
- `attachments/AttachmentTray.tsx` —— 点卡槽插入对应胶囊；卡槽禁用态改由胶囊节点种类驱动（订阅胶囊变更事件后读一次节点，渲染期不读 DOM）。
- `composer-add/AttachmentSubmitBridge.jsx` —— **成对补齐商品胶囊读取**（`[商品: url]`，沿用既有商品槽位填充形态），视频维持 `[视频](url)`；胶囊输入框里的回车不再触发发送/草稿；清视频令牌的事件派发整体兜错（原先抛错会中断后面全部提交流程——本轮自引入的回归，已修）。
- `attachments/usePasteVideoInterceptor.ts` —— 往胶囊输入框粘贴链接时让路（原先会被宿主的视频粘贴拦截截走）。
- `attachments/dockStyles.ts` —— 去掉已无渲染方的 `[data-composer-chip="video"]` 同义样式（保留官方原生 `source=link` 胶囊的皮肤）。
- `locales.js` —— 新增 4 条文案（两个占位 + 两个删除读屏名，中英各一份）。
- 测试：`links.test.js`（判据改签名并补胶囊种类用例）、`composer-video-token.test.js`（补 5 条胶囊提交用例，覆盖空草稿 / 空胶囊 / 有 url / 两种同存 / 已存在不重复）、`tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`（断言从 `[视频] [商品]` 文本改为胶囊节点）。

## 三、胶囊与提交读取

- 节点：`span.omx-link-chip.omx-link-chip--{video|product}`，带 `data-composer-chip`、`data-omx-video-token="true"` / `data-omx-product-token="true"`、`data-omx-chip-label`、`contenteditable="false"`；内部 = 图标 + 名称 + 分隔线 + `input`（placeholder「粘贴 TikTok 视频链接」/「粘贴商品链接或 ID」）+ `button`（× 删除）。全部 DOM API 创建，零 `innerHTML`、零内联样式。
- 提交：视频 → `[视频](url)`（既有桥逻辑，`composer-video-token.test.js` 钉死）；商品 → `[商品: url]`（既有商品槽位填充形态，`ProductUrlPopover` → `onReplaceSlot` 写的就是它，`promptSlotDetector` 也按「名称: 值」解析）。空输入不写正文、也不删胶囊；草稿已有同链接不重复追加。

## 四、测试真实结果（最终代码）

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | 82 通过 / 0 失败 |
| `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts` | 129 通过 / 0 失败 |
| `node --test plugins/omnimux/src/client/composer-video-token.test.js` | 8 通过 / 0 失败（含新增 5 条胶囊用例） |
| `node --test plugins/omnimux/src/client/media-viewer/*.test.js` | 86 通过 / **1 既有红灯**：`generation feedback: real browser transport-to-viewer journeys`（与本次改动文件无交集，未触碰 media-viewer） |
| `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | 5 通过 / 0 失败 |

## 五、L0 门禁

- `node scripts/auto-qa-gate.mjs . --diff --base origin/main` → **PASS**（扫描 15 个变更源码文件；SYNTAX / LIFECYCLE / SECURITY / TOKENS / GUARDS 全绿）。
- `git diff --check` → 无输出（干净）。
- 旁证：`node scripts/scan-ui-gates.mjs` 报 6 处**既有**违规（ProductCreateLinkModal / SkillCard / SkillsPanel），均不在本次改动文件内。

## 六、真实浏览器验收（agent 侧交付门槛）

环境：本工作树自身构建的完整应用（`ui` 合成模式、动态端口、自清理），真实无头 Chrome + CDP；
截图与逐条断言在 `.agent-reports/quick-shortcut-link-chip/`：

| 截图 | 证明什么 |
| --- | --- |
| `chip-00-hero.png` | 新对话 Hero 里四条快捷方式在位（先确认掉宿主的「内测声明」遮挡层） |
| `chip-01-clone-chips.png` | 点「复刻爆款视频」后**输入框内只有视频一枚胶囊**（262×26 正几何），草稿里只有提示语、没有 `[视频]` 纯文本；商品卡槽仍可点 |
| `chip-01b-product-chip-via-slot.png` | 点上方「商品」卡槽后商品胶囊才出现（两枚胶囊），两枚卡槽随即同时变灰不可点 |
| `chip-02-video-url-filled.png` | 往视频胶囊输入框里真键盘输入 TikTok 链接后，值落进胶囊 |
| `chip-03-typing-and-highlight.png` | 输入框照常打字、胶囊不被宿主重渲染吃掉、既有 `[xx]` 槽位高亮仍在 |
| `chip-04-after-remove-product.png` | 点 × 删掉商品胶囊：节点消失，商品卡槽恢复可点（视频卡槽仍禁用） |
| `chip-05-switch-shortcut.png` | 切「拆解爆款视频」：提示语与胶囊整组替换，只剩视频胶囊，无残留 |

`chip-scenario.json`：**28 / 28 条断言通过**（含 `no-console-exceptions`；收尾修复后的最新一次重跑，见第九节）。
复现命令：`node .agent-reports/quick-shortcut-link-chip/boot-app.mjs --scenario .agent-reports/quick-shortcut-link-chip/chip-scenario.mjs`
（跑完留档后按 SIGINT 回收，日志尾行必须是 `清理完成：{"cleaned":true}`）。

**关于 ego-browser**：本次未用 ego-browser，原因是环境的一次性登录令牌按 `docs/contracts/plugin-qa.md`
只允许「受信调用者内存内换同源 Cookie，不打印、不落盘」，而 ego 是独立浏览器进程，无法在不落盘凭据的前提下
共享该会话。改用的路径与仓库自身的完整应用验收运行器（无头 Chrome + CDP、内存内登录、动态端口、自清理）同源，
证据为真实浏览器 PNG + 结构化报告；ego 的缺位如实登记在此，不冒充。

## 七、遗留与需产品裁决

1. **胶囊宿主位置（需确认）**：规格写「在输入框（contenteditable）内插入」，实测宿主 Lexical 会清掉外部节点，
   故实现为「输入框卡片内的胶囊行」（贴着输入行上方）。若要严格落在可编辑区内部，只能改用宿主原生
   `reference-chip` 节点——但那个节点只有「图标 + 名称」，没有输入框与 ×，与设计稿不符。
2. **「插到光标处」语义**：胶囊在行内按插入顺序排列（行尾追加），不再有「光标处 / 末尾」之分。
3. **删除胶囊不删用户已粘贴的真链接**：× 只删胶囊节点；用户自己粘进草稿正文的链接不受影响。
4. **空胶囊会随提交留在输入框**（未填链接时不写正文、也不自动删除），下次发送仍会带上空胶囊等待填写。
5. ~~快捷方式与链接的对应关系、文案、技能映射均未改动：`clone`/`selling` 仍各带两枚胶囊（视频 + 商品 / 商品 + 视频），
   与改动前的 `[视频] [商品]` 一致。~~ **已由第九节收尾修复推翻**（那是实现偏差，不是口径）：
   点快捷方式只插 `defaultLink` 一枚，`extraLinks` 只在点上方卡槽时插入。快捷方式与技能、文案的映射仍未改动。
3 中「删除胶囊不删用户已粘贴的真链接」仍然成立；第 4 条的空胶囊行为未变。

## 九、收尾修复（Issue #2579 第二轮）：恢复 `extraLinks` 的真实语义

**问题**：上一轮实现让「点快捷方式」= 插入 `quickShortcutLinks(entry)`（默认链接 + 可追加链接），
所以点「复刻爆款视频」会同时插视频与商品两枚胶囊。真源 `catalog.js` 的语义是
`defaultLink` 为点击即预填、`extraLinks` 为「上方卡槽可点、点了才追加」，产品口径也是复刻默认只预填视频。

**修法**（最小改动，不动卡槽集与技能映射）：

| 文件 | 改动 |
| --- | --- |
| `composer-quick-shortcuts/catalog.js` | 新增 `quickShortcutDefaultLinks(entry)`（只回 `defaultLink`，至多一枚）；把 `quickShortcutLinks` 的文档钉成「**卡槽集**，不是插入集」 |
| `composer-quick-shortcuts/ComposerQuickShortcuts.jsx` | 点快捷方式时插入集改用 `quickShortcutDefaultLinks`，会话态存 `links` 仍为卡槽集（上方两枚卡槽照旧渲染、两态照旧） |
| `composer-quick-shortcuts/links.js` | 撤回剥离的注释改成「卡槽集会写入的链接种类数」，与新的写入路径一致（逻辑未变） |
| `composer-quick-shortcuts/catalog.test.js` / `dom.chip.test.js` | 新增「点 clone 后只有 video 一个胶囊」「点上方商品卡槽后才出现商品胶囊、随后两枚卡槽都不可点」「删掉商品胶囊后该卡槽恢复可点」「切换整组替换」等断言 |
| `tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | 「点复刻插两枚胶囊」改为「只插视频胶囊」，另加带货只插商品胶囊的用例 |
| `.agent-reports/.../chip-scenario.mjs` | 浏览器场景断言同步改对：新增「clone 只插视频」「商品卡槽可点 → 点击后商品胶囊出现且卡槽变不可点」两步 |

**未改动**（顺带确认，原本就对）：点上方卡槽插入的是该卡槽那一枚（`extraLinks` 的那种）胶囊，
插入后卡槽不可点，删掉胶囊后恢复可点——`AttachmentTray.onSelectSlot` 插入前二次判定 `isQuickLinkSlotFilled`，
禁用态来自 `splitQuickLinkSlots(presentKinds, quickLinkSlots)`，`presentKinds` 由胶囊增删事件重读节点。

**本轮验证（真结果）**：

| 命令 / 证据 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | 89 通过 / 0 失败 |
| `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts` | 129 通过 / 0 失败 |
| `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | 6 通过 / 0 失败 |
| `node scripts/auto-qa-gate.mjs . --diff --base origin/main` | PASS（17 个变更源码文件；未执行浏览器验收） |
| `git diff --check` | 无输出，exit 0 |
| `boot-app.mjs --scenario …`（真实无头 Chrome + CDP，本工作树构建 `74d9814…`） | `chip-scenario.json` **28 / 28 通过**；页面探测同时通过（title=OmniMux，输入框三个选择器全部命中，送出产物与本工作树构建一致） |

新断言读数（摘自 `chip-scenario.json`）：

- `clone-inserts-default-link-only`：`chipCount 1, kinds ["video"]`；
  `clone-no-product-chip` 通过；`clone-video-slot-disabled`：视频卡槽 disabled、商品卡槽 enabled。
- `product-slot-clickable-before-click`：真实鼠标点击（mode=mouse，落点自校验 hitIsSelfOrChild）时卡槽 `disabled:false`；
  `product-slot-inserts-chip`：`chipCount 2, kinds ["video","product"]`；
  `product-slot-disabled-after-insert`：两枚卡槽同时 disabled。
- `remove-keeps-video-chip` + `removed-slot-clickable-again`：删掉商品胶囊后该卡槽恢复可点（视频卡槽仍禁用）。
- `switch-replaces-group`：切「拆解」后只剩视频胶囊。

截图（本轮重跑覆盖，落 `.agent-reports/quick-shortcut-link-chip/`）：
`chip-01-clone-chips.png`（点复刻后**只有视频胶囊**）、
`chip-01b-product-chip-via-slot.png`（点上方商品卡槽后商品胶囊出现、两枚卡槽同时变灰）、
`chip-02-video-url-filled.png`、`chip-03-typing-and-highlight.png`、
`chip-04-after-remove-product.png`、`chip-05-switch-shortcut.png`。

**本轮附带修的一处工具缺陷**：`.agent-reports/.../page-probe.mjs` 在 `Page.navigate` 后立刻
`Runtime.evaluate`，新执行上下文未就绪时读到 `undefined`，`JSON.parse` 抛
`"undefined" is not valid JSON`（概率性，上一轮 22:37 那次运行的摘要里 `probe:null` 即此因）。
已改为小步重试等待快照（15s 上限，超时才判失败）；本轮页面探测因此首次拿到真实通过读数。
只改任务自有工具，未动仓库脚本。

## 十、清理（承接第八节，收尾修复后重述）

测试环境已按脚本自带清理路径回收（本轮两次运行均在 SIGINT 后打印 `清理完成：{"cleaned":true}`；
无 `.test-env-*` 残留、无遗留应用进程与无头 Chrome）；清理按 pid 与工作目录核对，
未按命令行特征批量终止其它任务的环境。
