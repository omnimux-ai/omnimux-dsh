# Issue #2562 输入框下方四条快捷方式 — 第二轮交付报告（数据分叉收敛）

工作区：`.worktrees/omnimux-composer-quick-shortcuts-issue-2562`（分支 `agent/omnimux-composer-quick-shortcuts-issue-2562`，基线 `origin/main` = `072037a0b`）
本轮目标：按用户拍板恢复技能数据，让四条快捷方式真正可解析、可渲染，并完成真实浏览器验收。
结论一句话：**数据分叉已收敛，四条 slug 全部可解析、单测与相关回归全绿；浏览器验收仍未拿到有效证据 → BLOCKED（原因与证据见第 6 节，不是「没做」，是宿主不加载本工作树构建）。**

---

## 1. 本轮改了什么文件

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `plugins/omnimux-market/catalog/preset-skills.json` | 修改（+466 行，0 删 0 改） | `tiktok-agent`、`omni-agent` 各恢复 3 个分类、13 款技能；既有 112 款与其余 5 个 preset 条目一字未动 |
| `plugins/omnimux-market/src/client/preset-skill-lookup.test.js` | 修改 | 断言方向翻转（见第 4 节）+ 新增「恢复的创作视频 / 创作图片分类与 12 款技能」数据测试 |
| `plugins/omnimux-market/lib/client/skill-picker-logic.js` | 已修改（上一轮） | 类型编译产物，随 `src` 保持一致 |
| `plugins/omnimux/lib/client.js`、`plugins/omnimux-market/lib/client.js` | 本地重建（未跟踪构建产物） | 用仓内既有构建入口重建，让运行时能读到本轮数据与代码；这两个文件在本仓是 gitignore 的 |
| `specs/composer-quick-shortcuts.spec.md` | 修改 | 增加「数据分叉的收敛（用户拍板）」与「浏览器验收状态（第二轮）」两节 |
| `.agent-reports/composer-quick-shortcuts/` | 新增证据 | 环境截图 2 张 + 本轮测试原始输出 + 复现脚本 `tooling/` |

上一轮的实现文件（`composer-quick-shortcuts/*`、`MediaConfigControls.jsx`、`AttachmentTray.tsx`、`PromptSlotsChips.tsx`、`apply.js` 等）本轮未再改动，除数据与测试外只重建了构建产物。

**未做的事**：没有 push / 开 PR / merge / 物化开发版；没有改动工作区外任何文件（含 `~/.omnimux-dev`）。

## 2. 两个分类与 12 款的落地情况

`tiktok-agent` 与 `omni-agent` 的分类数组现为：

```
创作视频、创作图片、搜索爆款视频、ugc-testimonial、storytelling-script、image-static、
video-ads、product-showcase、meme-native、other
```

（恢复的 3 个分类置于最前，点开「技能」菜单即可看到并点选。）

技能条目 13 款，字段形状与既有 112 条完全一致（16 个字段，无自造字段）：

| 分类 | slug | name | id | 封面 |
| --- | --- | --- | --- | --- |
| 创作视频 | replicate-viral-video | 复刻爆款视频 | sk-tk-replicate-viral | skill-card-2 |
| 创作视频 | create-selling-video | 创作带货视频 | sk-tk-create-selling-video | skill-card-3 |
| 创作视频 | video-hook-analysis | 视频拆解 | sk-tk-selling-hook-analysis | skill-card-4 |
| 创作视频 | video-script-creation | 视频脚本创作 | sk-tk-script-creation | skill-card-5 |
| 创作视频 | video-prompt-generation | 视频提示词生成 | sk-tk-prompt-generation | skill-card-6 |
| 创作视频 | video-generation | 视频生成 | sk-tk-video-render | skill-card-7 |
| 创作图片 | video-storyboard-image | 视频分镜图 | sk-tk-storyboard-image | skill-card-9 |
| 创作图片 | product-image-set | 商品套图 | sk-tk-product-image-set | skill-card-10 |
| 创作图片 | aplus-content | A+内容 | sk-tk-aplus-content | skill-card-2 |
| 创作图片 | image-replication | 图片复刻 | sk-tk-image-replication | skill-card-3 |
| 创作图片 | multi-angle-product-images | 多角度产品图 | sk-tk-multi-angle | skill-card-4 |
| 创作图片 | ai-virtual-try-on | AI 换装 | sk-tk-virtual-tryon | skill-card-5 |
| 搜索爆款视频 | reverse-video-prompt | 反推视频提示词 | sk-tk-reverse-prompt | skill-card-6 |

填充口径：`title` = `name` = `titleZh`（文案逐字取自 `presets/tiktok-agent/skills.json`）；`skill` = `slug`；`category` 用中文分类 id；`summary` = `description`；`installed: true`、`isHot: false`、`isNew: false`、`downloads: 0`；`cover` = `catalog/covers/skills/skill-card-N.webp`（N 与 `coverIndex` 一致，8 张既有通用封面循环复用，全部指向真实文件）。`titleEn` 按要求**未编造**、直接省略。

## 3. 必须显式上报的一处口径冲突（第 13 款）

- 用户口径一：**只恢复 `创作视频`、`创作图片` 两个分类，各 6 款，共 12 款**。
- 用户口径二：**四条快捷方式都要渲染，第 4 条的技能胶囊是「反推视频提示词」**。
- 仓库事实：`reverse-video-prompt`（反推视频提示词）在预设真源里归属**第三个分类 `搜索爆款视频`**，不属于上述两个分类中的任何一个。

两条口径在同一份数据上无法同时成立。按「与仓库事实冲突时以事实为准，不要硬凑」，处理为：**额外恢复它自己的真实分类 `搜索爆款视频` 与该 1 款技能**（共 13 款 / 3 个分类）。没有把它塞进不适用的分类，也没有顺手恢复 `搜索爆款视频` 的其余 9 款（保持最小改动）。

若产品只要「两个分类、宁可第 4 条不渲染」，删掉该分类与这 1 款即可，四条快捷方式会按既有契约（技能缺失即不渲染）自动只显示三条——这一取舍需要主理人/用户确认一句。

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

新增数据测试三条：
1. `tiktok-agent` 分类含 `创作视频`、`创作图片`，且两者都出现在分类页签里（`tabs[0]` 仍是 `all`）；
2. 12 款技能都在货架上，且每个分类恰好 6 款，`skill`/`name`/`title`/`titleZh`/`category`/`description`/`summary`/`installed`/`isHot`/`isNew`/`downloads` 齐备，`cover` 与 `coverIndex` 一致**且文件真实存在**（`existsSync`）；
3. `omni-agent` 与 `tiktok-agent` 恢复内容一致（默认菜单与快捷方式不会打架）。

## 5. 测试真实结果（含既有红灯对比）

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-market/src/client/preset-skill-lookup.test.js` | **9/9 通过**（上一轮 6/6，本轮新增 3 例） |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/catalog.test.js + preset-skill-lookup.test.js` | **20/20 通过** |
| `node --test plugins/omnimux/src/client/attachments/*.test.js` | **26/26 通过** |
| `pnpm --filter omnimux test` | 2596 例，**2568 通过 / 28 失败**（上一轮实测为 2567/29；差异来自上一轮修好的 `media-composer-direct.e2e.test.js`） |
| `pnpm --filter omnimux-market test` | 928 例，**859 通过 / 68 失败**（未在改动前采集整包基线，故只报现状） |
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

1. **四条快捷方式的浏览器逐条核对**：BLOCKED（见第 6 节）。需要一条能让宿主加载未合入插件构建的路径，或等合入后物化到 Dev 再由人工/自动化在 45120 上核对。
2. **第 13 款技能与第三个分类**：见第 3 节，属对口径冲突的按事实处理，请主理人确认是否保留。
3. `VideoLinkPopover` / `ProductUrlPopover` 仍未接入（上一轮已说明）：四条快捷方式点击时没有真实 URL 可填，链接胶囊是占位令牌而非带 URL 的 markdown 链接。
4. `skill-linkage.test.js` 仍有 1 条既有红灯（`video-analysis` / 竞品爆款复盘 不在恢复清单），刻意不扩范围。
5. 英文界面标题：`titleEn` 未编造、直接省略，英文界面会按既有回退显示中文名（与仓内既有 legacy 条目同一行为，`skillTitle` 单测已钉住），不会出现空标题。

## 8. 建议下一步

1. 请用户/主理人确认第 3 节的取舍（保留「搜索爆款视频 + 反推视频提示词」，还是砍掉让第 4 条不渲染）。
2. 浏览器验收建议改为：合入 + 物化到 Dev 后，在 45120 上按本文第 6 节列出的 8 项逐条核对（提示语逐字 / 技能胶囊名 / 链接胶囊 / 模型与参数显隐 / 删胶囊后卡槽可点 / 链接在框内卡槽不可点 / 切换只留一颗技能 / 点 ✕ 后提示语与链接保留），并打开技能菜单确认 `创作视频`、`创作图片` 两个页签各 6 款。
3. 交审查员做行级审查（跨 hub 与 market 两个插件；数据文件 `preset-skills.json`、`preset-skill-lookup.test.js`、`apply.js` 是重点）。

## 附：复现脚本

- `.agent-reports/composer-quick-shortcuts/tooling/qa-host.mjs`：在工作树内起 ui 模式完整应用（动态端口、私有 profile），并用仅回环的握手口把同源登录 Cookie 交给浏览器脚本；登录 URL 与令牌只在该进程内存流转，不打印不落盘。
- `.agent-reports/composer-quick-shortcuts/tooling/qa-shim.mjs`：把工作树构建的 `lib/client.js`（以及 `catalog/preset-skills.json`）叠加进任务私有 profile 的符号链接垫片，不改动 `~/.omnimux-dev`。
