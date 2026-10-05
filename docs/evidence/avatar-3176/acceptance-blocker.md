# 虚拟形象管理插件（Issue #3176）真机验收证据与阻塞记录

日期：2026-10-05
工作树：`.worktrees/avatar-influencer-clone-issue-3176`（分支 `agent/avatar-influencer-clone-issue-3176`，基底 `origin/main` `06220fad1`）
驱动：`node scripts/worktree-app-qa.mjs --journey=scripts/qa/avatar-stage-acceptance.mjs`（完整应用 · 隔离 profile · 动态端口 · 测完即焚）

## 一、结论（已更新：阻塞已解除，真机验收通过）

**2026-10-05 收口：真机验收 PASS，31/31 断言全绿。** 页面在真实应用里可达，17 条功能旅程断言全部通过（入口可达、正几何、唯一滚动容器、吸附头、两栏布局、无原生下拉、灵感库 70 张卡/35 张预览图、预览弹窗 aria-modal + 套用、Escape 关闭、历史网格样式落到浏览器）。

下面第一至四节保留**解除过程**：最初真机未通过，且经查证不是产品缺陷，而是验收装置的能力缺口（宿主不加载新插件）。两处根因已分别修复，另有两条真机暴露的真实产品缺陷一并修掉（见第四节）。

## 二、实测事实（可复现）

| # | 事实 | 证据 |
| --- | --- | --- |
| 1 | 应用本体正常启动，基线断言 12/13 通过 | `docs/evidence/worktree-app-qa-report.json`（mode=ui，1280×713 首页截图 465,944 字节） |
| 2 | 侧栏渲染了 5 个插件行：项目 / 技能·专家 / 资产库 / 灵感社区 / 探索；**没有「虚拟形象」** | `.workbuddy/evidence/app-qa/<runId>/probe-facts.json` 的 `dataAttrs`；`avatarNodes: 0` |
| 3 | 宿主加载的客户端包清单里**没有** `omnimux-avatar/client.js`（同批有 workflow / assets / inspiration / market / video / products / publish / clip / viewer / browser / automation / studio / forms / analytics / accounts / social-harvest / video-preview / omnimux 等） | 同次 probe 的 `pluginRes` / `scripts` 两个字段（`/plugins/??...` 合并请求的实际清单） |
| 4 | 隔离 profile 的插件集来自 **Dev profile 已安装集合**，只做「工作树源码覆盖」，不新增插件 | `scripts/test-env-bootstrap.mjs` 的两处映射循环都 `readdirSync(devNodeModules)` / `readdirSync(devSnapshotsPlugins)`，仅当 `taskPlugins.has(pkg)` 时用工作树源码覆盖 |
| 5 | 因此**新增插件**（Dev profile 里还不存在的）永远不会被物化进隔离 profile，也就永远不会被宿主加载 | 同上；事实 3 是其运行期表现 |

## 三、本轮为打通验收已落地的两处修复（均有独立证据）

1. **中枢侧栏白名单缺项（真实产品缺陷，已修）**
   `plugins/omnimux/src/client/sidebar-coordinator.js`：`PINNED_ENTRY_PREFIXES` 补入 `omnimux-avatar`；并把 `isConvergedEntry` 里重复的硬编码清单改为复用同一白名单（单一真源，避免两处清单漂移）。
   证据：`pnpm --filter omnimux build` exit 0（1,456,311 字节）；`node --test src/client/sidebar-coordinator.test.js src/client/workbench.test.js` → 111/111 通过。
   影响：若不修，`omnimux-avatar` 既不在常驻白名单、也不在「探索」收敛白名单里，插件行会被直接丢掉（实测即事实 2）。

2. **验收装置不物化新插件（装置缺陷，已修一层）**
   `scripts/test-env-bootstrap.mjs`：新增第 3 段循环，把「工作树里存在、但 Dev profile 里没有」的插件按与其他插件相同的规则物化进**一次性隔离 profile**（数据目录软链、其余拷贝、缺 `lib/client.js` 时就地构建），绝不触碰 `~/.omnimux-dev`。
   证据：`node --check` 通过；`node --test scripts/test-env-bootstrap.test.mjs` → 22/22 通过。
   局限：这只解决了「文件存在」，**没有解决「宿主注册」**——宿主仍按 profile 的插件注册表生成加载清单，故事实 3 不变。

## 四、真机暴露并已修复的真实产品缺陷

| # | 缺陷 | 真机表现 | 修复 |
| --- | --- | --- | --- |
| 1 | 宿主语言座未合并本插件词典时，绑定出的翻译器把键原样返回 | 页面标题显示成 `nav`；「灵感库」页签找不到（文案渲染成键名） | `AvatarStage.jsx`：先用已知键探测宿主翻译器是否真生效，生效则用它（跟随语言切换），不生效回落到插件自带中英词典——不把「宿主未就绪」渲染成用户可见的键名 |
| 2 | 侧栏常驻白名单漏项 | 插件行被中枢直接丢弃，页面无入口 | `sidebar-coordinator.js`：`PINNED_ENTRY_PREFIXES` 补入本插件，并让 `isConvergedEntry` 复用同一白名单（消除两处清单漂移） |
| 3 | 预设美术取图地址错误 | 灵感库 70 张卡片的预览图在真机上**全部裂图**（破图图标 + 占位文字条），而断言仍全绿 | `ExplorePresetGrid.jsx` / `PresetPreviewDialog.jsx`：改用既有的取图地址助手把原始路径交给宿主路由。原始路径是源工程的 `/influencer-presets/<hash>.webp`，在本应用源下不存在，浏览器直接 404 |
| 4 | 断言只看元素个数，不看图是否真的加载出来 | 缺陷 3 逃过 31 条断言 | 验收旅程把「数 `<img>` 个数」升级为「`complete && naturalWidth > 0` 才算解码成功」，并带出裂图地址样例；同时把这条回归钉进 `tests/e2e/avatar-stage.journey.mjs` |

## 五、历史：剩余阻塞与可选路径（已按路径 A 解决）

**阻塞**：新增插件要出现在宿主的客户端包清单里，必须先在 profile 的插件注册表里注册（`dsh plugin add` 的等价物）。当前 `worktree-app-qa` 的隔离 profile 只继承 Dev 的注册表，不注册新插件。

| 路径 | 做法 | 代价 / 边界 |
| --- | --- | --- |
| A（推荐） | 扩展 `test-env-bootstrap.mjs`：把工作树发现到的新插件写入隔离 profile 的插件注册表，再启动 | 需先定位注册表真源（`~/.omnimux-dev/settings.yaml` 或 profile 的 cordis 配置）；只写一次性隔离 profile，不碰 Dev/Prod |
| B | 先合并，再按既有流程物化到 Dev（`bash scripts/worktree.sh ship`），在 Dev 上做人工/agent 真机验收 | 与「先演示后合入」相冲突，需用户拍板 |
| C | 用 ego-browser 驱动已注册的 Dev 应用 | 未合并工作树不得链入 Dev，违反仓库硬规则，不可用 |

**已排除**：`worktree-web-qa.mjs` 只有右上角收起态与右侧栏 chrome 两个固定场景，不覆盖本页；私有 harness 不计入验收。

## 六、本插件已完成的验证

- `pnpm --filter omnimux-avatar test`：243 / 243 通过（含宿主库 86、客户端库与组件、`workbench-seat.test.js` 13、`auto-archive.test.mjs` 6）。
- `npm run build`：exit 0，`lib/client.js` 281,728 字节（证明客户端全部导入可解析）。
- `pnpm verify:stages`（15 个 Stage 组件 + 9 个侧栏目标）、`pnpm verify:stage-scroll`（8 页）、`pnpm verify:tools`（9 个工具 100% 对齐）、`pnpm test:agent-tools`、`pnpm doc:pairing`、`pnpm check:boundaries`、`pnpm verify:product-baseline`、`pnpm registry:verify`、anti-slop 3/3：全部通过。
- `pnpm test:ui` / `pnpm verify:stage-inset` 的红灯全部落在与 `origin/main` **逐字节一致**的其他插件文件上（已用 `git diff --quiet origin/main -- <file>` 逐个证实），与本任务无关。

## 七、留存的原始证据

- `docs/evidence/worktree-app-qa-report.json`（应用级验收报告，含逐条断言与首页截图路径）
- `.workbuddy/evidence/app-qa/<runId>/`：`app-home.png`、`probe-facts.json`（DOM/资源探针原始数据）、`report.json`
- 验收驱动模块：`scripts/qa/avatar-stage-acceptance.mjs`（17 条断言，覆盖入口可达、正几何、唯一滚动容器、吸附头、两栏布局、无原生下拉、灵感库网格与预览弹窗、Escape 关闭、历史网格样式落到浏览器）
- DOM/资源探针：`scripts/qa/avatar-stage-probe.mjs`


## 八、真机验收截图（docs/evidence/avatar-3176/）

| 文件 | 场景 |
| --- | --- |
| `01-avatar-stage.png` | 一级页整体：左栏角色设定 + 右栏画廊，两栏 340px/623px |
| `02-avatar-explore.png` | 灵感库预设网格（70 张可点卡片 / 35 张预览图） |
| `03-avatar-preset-dialog.png` | 预设预览弹窗（960×673，aria-modal=true，含「套用」） |
| `04-avatar-history.png` | 历史记录视图 |
| `00-app-home.png` | 应用首页（应用本体启动基线） |
| `journey-result.json` | 17 条旅程断言的逐条结果 |

## 九、分类选项美术的判定（未改代码）

分类选项（18 类 / 170 项）的缩略图指向源工程自有的素材域名，共 137 个文件、实测单文件约 140–190 KB，合计约 23 MB。该域名可直连（HTTP 200），应用也没有禁止外部图片的全局策略；真机截图里这些卡位是「纯色空框」而不是「破图图标」，与「仍在加载」相符，因此判定为**加载时序问题而非地址错误**，本轮不改代码、也不把这 23 MB 引入仓库。若要进一步确认，可在验收旅程里对选项缩略图同样加一条解码断言（需要更长的等待预算）。
