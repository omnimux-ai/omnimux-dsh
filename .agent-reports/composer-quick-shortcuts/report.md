# Issue #2562 输入框下方四条快捷方式 — 交付报告（第二、三轮）

工作区：`.worktrees/omnimux-composer-quick-shortcuts-issue-2562`（分支 `agent/omnimux-composer-quick-shortcuts-issue-2562`，基线 `origin/main` = `072037a0b`）
第二轮目标：按用户拍板恢复技能数据，让四条快捷方式真正可解析、可渲染，并完成真实浏览器验收。
第三轮目标：处理独立代码审查提出的必改 4 条 + 建议 8 条，并把文档与提交事实对齐（见第 3 节更正与第 9 节）。
结论一句话：**数据分叉已收敛、审查意见已全部处理（详情改），单测与相关回归全绿；浏览器验收仍未拿到有效证据 → BLOCKED（原因与证据见第 6 节，不是「没做」，是宿主不加载本工作树构建）。**

---

## 1. 本轮改了什么文件

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `plugins/omnimux-market/catalog/preset-skills.json` | 修改（第二轮 **+458 行 / -0 行**；第三轮再 +26 行 `titleEn`） | `tiktok-agent`、`omni-agent` 各恢复 **2 个分类、13 款技能**（创作视频 7 + 创作图片 6）；既有 112 款与其余 5 个 preset 条目一字未动 |
| `plugins/omnimux-market/src/client/preset-skill-lookup.test.js` | 修改 | 断言方向翻转（见第 4 节）+ 数据测试 + 第三轮新增「字段集与既有条目一致、`titleEn` 非空」断言 |
| `plugins/omnimux-market/lib/client/skill-picker-logic.js` | 已修改（第二轮） | 类型编译产物，随 `src` 保持一致 |
| `plugins/omnimux/lib/client.js`、`plugins/omnimux-market/lib/client.js` | 本地重建（未跟踪构建产物） | 用仓内既有构建入口重建，让运行时能读到本轮数据与代码；这两个文件在本仓是 gitignore 的。第三轮已再次重建 hub 包（3165958 字节），并实测包内 `resolveComposerSessionId` / `showModelSummary` / `stripQuickShortcutText` 均命中、已删除的 `hasLinkToken` 命中 0 次 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/*`、`attachments/AttachmentTray.tsx`、`media-viewer/*` | 第三轮修改 | S1/H2/H3/M1–M6/M10–M12 的落地（见第 9 节） |
| `plugins/omnimux/src/client/composer-quick-shortcuts/session.js` + `session.test.js` | 第三轮新增 | 会话标识派生的唯一实现 + 「两侧同源」钉子（见第 9 节 H3） |
| `plugins/omnimux/src/client/composer-quick-shortcuts/links.test.js` | 第三轮新增 | 链接令牌 / 卡槽两态 / 撤回剥离的语义用例（`hasLinkToken` 删除后由它承接覆盖） |
| `specs/composer-quick-shortcuts.spec.md` | 修改 | 增加「数据分叉的收敛（用户拍板）」与「浏览器验收状态（第二轮）」两节；第三轮按提交事实校正分类数、款数与 diff 行数 |
| `.agent-reports/composer-quick-shortcuts/` | 新增证据 | 环境截图 2 张 + 测试原始输出 + 复现脚本 `tooling/` |

第二轮之后，实现文件在第三轮被逐一复核并修正（见第 9 节）；数据与测试之外没有重建构建产物以外的额外动作。

**未做的事**：没有 push / 开 PR / merge / 物化开发版；没有改动工作区外任何文件（含 `~/.omnimux-dev`）。

## 2. 两个分类与 13 款的落地情况

`tiktok-agent` 与 `omni-agent` 的分类数组现为：

```
创作视频、创作图片、ugc-testimonial、storytelling-script、image-static、
video-ads、product-showcase、meme-native、other
```

（恢复的 2 个分类置于最前，点开「技能」菜单即可看到并点选；**没有第三个分类**。）

技能条目 13 款（创作视频 7 款 + 创作图片 6 款），字段形状与既有 112 条完全一致（**16 个字段**，含 `titleEn`，无自造字段）：

| 分类 | slug | name | id | 封面 |
| --- | --- | --- | --- | --- |
| 创作视频 | replicate-viral-video | 复刻爆款视频 | sk-tk-replicate-viral | skill-card-2 |
| 创作视频 | create-selling-video | 创作带货视频 | sk-tk-create-selling-video | skill-card-3 |
| 创作视频 | video-hook-analysis | 视频拆解 | sk-tk-selling-hook-analysis | skill-card-4 |
| 创作视频 | video-script-creation | 视频脚本创作 | sk-tk-script-creation | skill-card-5 |
| 创作视频 | video-prompt-generation | 视频提示词生成 | sk-tk-prompt-generation | skill-card-6 |
| 创作视频 | video-generation | 视频生成 | sk-tk-video-render | skill-card-7 |
| 创作视频 | reverse-video-prompt | 反推视频提示词 | sk-tk-reverse-prompt | skill-card-6 |
| 创作图片 | video-storyboard-image | 视频分镜图 | sk-tk-storyboard-image | skill-card-9 |
| 创作图片 | product-image-set | 商品套图 | sk-tk-product-image-set | skill-card-10 |
| 创作图片 | aplus-content | A+内容 | sk-tk-aplus-content | skill-card-2 |
| 创作图片 | image-replication | 图片复刻 | sk-tk-image-replication | skill-card-3 |
| 创作图片 | multi-angle-product-images | 多角度产品图 | sk-tk-multi-angle | skill-card-4 |
| 创作图片 | ai-virtual-try-on | AI 换装 | sk-tk-virtual-tryon | skill-card-5 |

填充口径：`title` = `name` = `titleZh`（文案逐字取自 `presets/tiktok-agent/skills.json`）；`titleEn` 为行业通行英文名（英文界面 `skillTitle` 走英文分支取它）；`skill` = `slug`；`category` 用中文分类 id；`summary` = `description`；`installed: true`、`isHot: false`、`isNew: false`、`downloads: 0`；`cover` = `catalog/covers/skills/skill-card-N.webp`（N 与 `coverIndex` 一致，8 张既有通用封面循环复用，全部指向真实文件）。

## 3. 第 13 款（反推视频提示词）的归属，以及一处已更正的历史记录

- 用户口径：恢复「创作视频」「创作图片」两个分类；四条快捷方式都要渲染，第 4 条的技能胶囊是「反推视频提示词」。
- 仓库事实：`reverse-video-prompt` 在预设真源 `presets/tiktok-agent/skills.json` 里归属另一个分类 `搜索爆款视频`。
- 落地结果：**按产品口径并入 `创作视频`**（该分类 7 款），**不额外立第三个分类**，也不恢复 `搜索爆款视频` 的其余技能，保持最小改动。
- 数据与文案已逐字取自预设真源，四条快捷方式 slug 全部可解析（见第 4 节）。
- **历史记录更正**：本报告第 2 轮曾写「额外恢复了 `搜索爆款视频` 分类与该 1 款技能」、分类列表含三个分类、第 13 款归属 `搜索爆款视频`——均与提交事实不符，现按实测数据改正为上述内容。数据文件实测 **+458 行 / -0 行**（提交 `99f3ccaab`），并非当时所写的 +466 行。

## 4. 四条快捷方式的解析结果

数据层已用真实代码路径验证（`findPresetSkill`，与运行时 `window.__omnimuxSkillLibrary.resolvePresetSkill` 同一实现）：

| 快捷方式 | slug | 解析结果 | 胶囊名 |
| --- | --- | --- | --- |
| `clone` | replicate-viral-video | ✅ presetId=tiktok-agent，installed=true | 复刻爆款视频 |
| `breakdown` | video-hook-analysis | ✅ presetId=tiktok-agent，installed=true | 视频拆解 |
| `selling` | create-selling-video | ✅ presetId=tiktok-agent，installed=true | 创作带货视频 |
| `reverse` | reverse-video-prompt | ✅ presetId=tiktok-agent，installed=true | 反推视频提示词 |

`preset-skill-lookup.test.js` 的既有分叉断言已按真实状态翻转：

- 旧：「四条 slug 均不在 `catalog/preset-skills.json` → `findPresetSkill` 返回 null」（上一轮的临时护栏）
- 新：「四条 slug 现在都能从会话技能选择器的预设绑定解析到，且 `slug`/`name`/`installed`/来源预设 均正确」

新增数据测试四条：
1. `tiktok-agent` 分类含 `创作视频`、`创作图片`，且两者都出现在分类页签里（`tabs[0]` 仍是 `all`）；
2. 13 款技能都在货架上，每个分类数量与清单一致（创作视频 7 + 创作图片 6），`skill`/`name`/`title`/`titleZh`/`titleEn`/`category`/`description`/`summary`/`installed`/`isHot`/`isNew`/`downloads` 齐备，`cover` 与 `coverIndex` 一致**且文件真实存在**（`existsSync`）；
3. `omni-agent` 与 `tiktok-agent` 恢复内容一致（默认菜单与快捷方式不会打架）；
4. **新增 13 款的字段集与既有条目完全一致，且 `titleEn` 非空**（第三轮补上，防止再漏字段）。

## 5. 测试真实结果（含既有红灯对比）

**第三轮（本轮，修正后实测）**

| 命令 | 改动前 | 改动后 |
| --- | --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | 11/11 通过 | **26/26 通过**（新增 `links.test.js` 10 例、`session.test.js` 5 例，`catalog.test.js` 中已删的 `hasLinkToken` 用例随之移除） |
| `node --test plugins/omnimux-market/src/client/preset-skill-lookup.test.js` | 9/9 通过 | **10/10 通过**（新增字段集一致性断言） |
| `node --test plugins/omnimux/src/client/attachments/*.test.js *.test.ts` | 122/122 通过 | **122/122 通过** |
| `node --test plugins/omnimux/src/client/media-viewer/*.test.js` | 87 例：86 通过 / 1 失败 | 87 例：**86 通过 / 1 失败**，失败项同名 `generation feedback: real browser transport-to-viewer journeys`（与主干既有红灯一致，改动前后实测同一项） |
| `node --test plugins/omnimux/src/client/session-guide/*.test.js` | 36/36 通过 | **36/36 通过** |
| `git diff --check` | — | 干净（无空白错误） |

**第二轮（数据分叉收敛那轮，保留原记录）**

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-market/src/client/preset-skill-lookup.test.js` | 9/9 通过（当时新增 3 例） |
| `node --test plugins/omnimux/src/client/attachments/*.test.js` | 26/26 通过（当时只跑了 `.test.js`，未含 `.test.ts`） |
| `pnpm --filter omnimux test` | 2596 例，2568 通过 / 28 失败 |
| `pnpm --filter omnimux-market test` | 928 例，859 通过 / 68 失败（未采改动前基线，只报现状） |
| `git diff --check` | 干净（无空白错误） |

**既有红灯对比（用户点名要看的一条）**

- `plugins/omnimux-market/src/client/skill-picker-logic.test.js`
  - 改动前：`tests 40 / pass 31 / fail 9`（`✖` 行 11 条）
  - 改动后：`tests 40 / pass 31 / fail 9`（`✖` 行 11 条）
  - **结论：本轮的改动完全没有改变它**。它期望的是 #2379 之前的老结构（7 个中文分类 / 45 技能 / drama 23 / marketing 5 分类），按要求未修。
- `plugins/omnimux-market/src/client/skill-linkage.test.js`（同目录另一个既有红灯文件，用户未点名，但被本轮数据改动影响）
  - 改动前：`tests 4 / pass 0 / fail 4`
  - 改动后：`tests 4 / pass 3 / fail 1`
  - 剩下 1 条失败是「`搜索爆款视频` 下应有 `video-analysis` / 竞品爆款复盘」——该技能不在本次恢复清单里，属刻意不扩范围。
- 全包 `pnpm --filter omnimux test` 的 28 例失败均为既有红灯（`src/text/execute.test.js` 的 `operation required…` 系列、catalog contract/facade、auth dispatcher、stage/sidebar 等），与本次改动无关。

原始输出留档：`.agent-reports/composer-quick-shortcuts/tmp/*.txt`（含 `skill-picker-logic.before/after`、`skill-linkage.before/after`、整包 `omnimux-test.after`、`market-test.after`）。

## 6. 浏览器验收：做到了什么，卡在哪里（BLOCKED）

**已经真实完成的（不是模拟、不是 HTTP 200）**

- 在任务工作树内执行 `scripts/test-env-bootstrap.mjs` 的 `startTestEnvironment({ root, mode: 'ui' })`：动态端口、任务私有 profile、合成凭据、本机模拟模型端点；返回 `evidenceLevel: full`、`taskPluginsInstalled: true`、`seededWorkspace: ws_qa_media`。
- 用 **ego-browser** 打开真实浏览器 → 完成同源 token→Cookie 登录（303）→ 进入完整应用 → 关闭「内部测试须知」→ 进入新会话，拿到输入框（placeholder：`Describe what you want to build, / commands, @ files or sessions`）。
- 全程按 ego skill 生命周期执行，收尾 `await task.finish({ keep: [] })`：`closedSpace: true`，8 个 Page 全部关闭，无悬挂 TaskSpace。
- 环境截图：`qa-env-home.png`、`qa-env-composer.png`（本目录内）。

**卡点（可复现的证据链）**

宿主把插件客户端产物打成了构建时快照，运行时读的是 **Dev `~/.omnimux-dev` 里那份已合入 main 的旧构建**，而不是任务私有 profile 里的本工作树构建：

1. 任务私有 profile 已按工作树正确装配（可验证）：`<private>/dsh/profiles/omnimux/node_modules/omnimux-market/lib/client.js` 与 `.materialize-snapshots/plugins/omnimux/lib/client.js` 都是指向本工作树 `lib/client.js` 的软链，`grep -c resolvePresetSkill` = 1、`grep -c omx-quick-shortcut` = 12（即本分支新增内容确实在 profile 里）。
2. 浏览器实际拿到的模块不含本分支任何新增：`GET /plugins/??…omnimux-market/client.js` 返回文本中 `resolvePresetSkill` 命中 **0**、`sk-tk-replicate-viral` 命中 **0**；hub 模块中 `omx-quick-shortcut` 命中 **0**。三处 rev（`a6903d64b46a` / `4ee51ceb5dae` / `79aefcbad3d7bd71`）在我改写 profile 前后完全不变。
3. 对拍本工作树构建：同样两个标记分别命中 1 与 13，可见「0 命中」不是我的构建写坏了，而是根本没被加载。
4. 因此运行时 `window.__omnimuxSkillLibrary` 不存在、`[class*="omx-quick-shortcut"]` 节点数为 0 —— 这既解释了「看不到四条快捷方式」，也说明**界面侧的四条逐项核对（提示语逐字、胶囊名、链接胶囊、模型/参数按钮显隐、卡槽两态、切换互斥、关技能不伤内容、技能菜单两个分类）在本环境下无法取得**。

**为什么没有绕过去**

- 把未合入产物写进 `~/.omnimux-dev` 或改应用包：仓库铁律明令禁止（Dev 不得接收未合入产物、不得改官方包装），超授权。
- 仓内另一个 Agent 侧入口 `pnpm test:worktree-web`（worktree 隔离 Web QA 运行器）只覆盖 Stage 类插件（accounts / inspiration / assets / workflow / publish / analytics），**没有会话输入框区**，接不上本次改动；自建私有宿主夹具被证据合同明确排除，不能算验收。
- 试过用 HOME 垫片把两个包的构建产物装进私有 profile（脚本已留档在 `tooling/`），profile 侧生效但宿主不读，如上。

**结论**：真实浏览器 + 真实应用环境这条路是通的（登录、进会话、截图都拿到了），但**让宿主加载本工作树的插件构建**这一步在本任务授权内无解，故四条快捷方式的逐条浏览器验收如实报 **BLOCKED**，不用单测或 HTTP 200 冒充。

## 7. 仍未做到 / 待确认

1. **四条快捷方式的浏览器逐条核对**：BLOCKED（见第 6 节）。需要一条能让宿主加载未合入插件构建的路径，或等合入后物化到 Dev 再由人工/自动化在 45120 上核对。第三轮同样受此限制：本轮修好的工具条单行布局与媒体面板「零新增可见节点」，判据落在源码级断言（`media-composer-direct.e2e.test.js` 校验容器弹性声明与回执开关默认值），不是像素级实机证据。
2. ~~第 13 款技能与第三个分类~~：**已按提交事实改正**（第 3 节）——只有两个分类，`reverse-video-prompt` 并入 `创作视频`，无需再裁决。
3. `VideoLinkPopover` / `ProductUrlPopover` 仍未接入（上一轮已说明）：四条快捷方式点击时没有真实 URL 可填，链接胶囊是占位令牌而非带 URL 的 markdown 链接。
4. `skill-linkage.test.js` 仍有 1 条既有红灯（`video-analysis` / 竞品爆款复盘 不在恢复清单），刻意不扩范围。
5. ~~英文界面标题 `titleEn` 省略~~：**第三轮已补齐**，13 款 × 2 个预设共 26 条 `titleEn`，英文界面不再回退中文名；字段集与既有 112 条完全一致（16 字段），并有断言钉住。

## 8. 建议下一步

1. 浏览器验收：合入 + 物化到 Dev 后，在 45120 上按本文第 6 节列出的 8 项逐条核对（提示语逐字 / 技能胶囊名 / 链接胶囊 / 模型与参数显隐 / 删胶囊后卡槽可点 / 链接在框内卡槽不可点 / 切换只留一颗技能 / 点 ✕ 后提示语与链接保留），并打开技能菜单确认 `创作视频`（7 款）、`创作图片`（6 款）两个页签；顺带核对媒体面板底部工具条仍是**单行**（生成方式 ｜ 模型 ｜ 参数展示 ──► 发送）。
2. 交审查员复核第三轮的 S1/H1/H2/H3 与 M1–M12 处置。
3. 合入后按既有铁律物化到开发版（正式版不写）。

## 9. 第三轮：代码审查意见的处置结果（2026-09-22）

审查跑了 17 个文件、0 失败、29 条意见。必改 4 条 + 建议 8 条已全部处理，无「判定不改」项。

| 意见 | 处置 | 落地位置 |
| --- | --- | --- |
| S1 媒体面板工具条被拆成竖排 | 已修 | `media-viewer/styles.js` 给 `.omx-media-config-controls` 补 `display:flex; align-items:center; gap:8px; flex-wrap:nowrap; min-width:0`；`.omx-media-config-summary` 改为 `showModelSummary` 开关控制，**默认不渲染**，仅快捷方式消费方显式打开 |
| H1 13 款新增技能缺 `titleEn` | 已修 | `preset-skills.json` 两段各补 13 条（26 条）；`preset-skill-lookup.test.js` 新增「字段集与既有条目完全一致 + `titleEn` 非空」断言 |
| H2 写草稿失败却继续改状态 | 已修 | `ComposerQuickShortcuts.jsx`：`writeDraft` 返回 false 即整条不生效，store 与技能通道都不提交；撤回分支同样处理 |
| H3 会话标识派生与附件托盘不一致 | 已修 | 新增 `composer-quick-shortcuts/session.js` 的 `resolveComposerSessionId`，快捷方式与托盘都调它；新增 `session.test.js` 钉住「两侧同源、都不再自造 `'default'` 单点」 |
| M6 提交后不再收起浮层 | 已修 | `MediaViewerComposer.jsx` 的 `handleSend` 恢复 `closePopovers()`（等价于抽取前的 `setActivePopover(null)`） |
| M12 e2e 断言被拼接削弱 | 已修 | `media-composer-direct.e2e.test.js` 改为分别断言：媒体面板断言**使用形态**（`<MediaConfigControls config={config} showModeSwitch />`、不渲染回执节点），共享控件单独断言结构 |
| M3 托盘自持一份标签映射 | 已修 | `AttachmentTray.tsx` 复用 `quickLinkLabels`，删掉本地副本与死导入（`quickLinkToken`、重复的 `dom.js` import） |
| M1 渲染期读 DOM | 已修 | 两态判据改由输入框已解析令牌的响应式投影（`detectedSlotsDraftText`）驱动 |
| M2 合并数组后高亮错槽 | 已修 | 按槽位 id 在合并后数组重算 `activeSlotIndex` |
| M4 卡槽重复插入同名令牌 | 已修 | 卡槽点击入口再判一次已填（`isQuickLinkSlotFilled` 的生产调用方） |
| M5 effect 依赖缺 `setMode`/`closePopovers` | 已修 | 先解构再依赖 |
| M10 `hasLinkToken` 是无人调用的伪真源 | 已修 | 删除 `hasLinkToken`（判据唯一实现留在 `links.js` 并被托盘的点击入口真正消费），`dom.js` 注释同步改正 |
| M11 撤回清掉整个草稿 | 已修 | 新增 `stripQuickShortcutText`：只剥本快捷方式写入的令牌与提示语前缀，用户追加文字原样保留 |
| M9 文档与数据打架 | 已修 | 本报告第 1/2/3/4/7 节与 `specs/composer-quick-shortcuts.spec.md` 的「数据分叉的收敛」一节按提交事实改正（两个分类 / 13 款 / +458 行 / 16 字段） |

**明确未动（按要求）**：`omnimux-market/src/client/skill-picker-logic.test.js` 的既有红灯、`media-viewer` 的 `generation feedback: real browser transport-to-viewer journeys`、既有 112 款技能与其余 preset。

## 附：复现脚本

- `.agent-reports/composer-quick-shortcuts/tooling/qa-host.mjs`：在工作树内起 ui 模式完整应用（动态端口、私有 profile），并用仅回环的握手口把同源登录 Cookie 交给浏览器脚本；登录 URL 与令牌只在该进程内存流转，不打印不落盘。
- `.agent-reports/composer-quick-shortcuts/tooling/qa-shim.mjs`：把工作树构建的 `lib/client.js`（以及 `catalog/preset-skills.json`）叠加进任务私有 profile 的符号链接垫片，不改动 `~/.omnimux-dev`。
