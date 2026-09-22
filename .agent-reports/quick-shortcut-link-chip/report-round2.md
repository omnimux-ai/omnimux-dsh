# Issue #2579 链接胶囊 · 审查修复轮（第 1 轮）报告

工作树：`.worktrees/omnimux-quick-shortcut-link-chip-issue-2579`
分支：`agent/omnimux-quick-shortcut-link-chip-issue-2579`（基线 `4b59e3742`）
规格：`specs/quick-shortcut-link-chip.spec.md`（本轮新增「已知行为与取舍」一整节）
审查输入：严重 0 / 高 0 / 中 12 / 低 6

## 一、本轮必须修（中）

| 编号 | 结论 | 改法 | 证据 |
| --- | --- | --- | --- |
| 中-1 视频分支无条件删节点 | 已修 | `composer-add/AttachmentSubmitBridge.jsx`：新增 `consumeChip()`，只有链接**真的进了草稿**（写进去了，或草稿里已有同一条链接）才 `node.remove()`；`setDraft` 抛错时保留胶囊、`console.warn` 留痕、清令牌逻辑仍只在真追加后执行 | `composer-video-token.test.js`：`视频胶囊：写入失败时保留胶囊，用户填的链接不许丢`（`failAppend` 夹具让追加块写入抛错） |
| 中-2 商品分支丢弃回执 | 已修 | 同上，商品走同一个 `consumeChip()` | 同文件：`商品胶囊：写入失败时同样保留胶囊`、`两种胶囊都写不进去时两枚都留着` |
| 中-3 读/删/替换作用域是整个 document | 已修 | `dom.js` 新增并导出 `resolveComposerCard(anchor)`：从调用点向上找本会话 `[data-composer-seat]`（其次 `[data-phase]`），再在座位内取 `[data-composer-card]`；`insertQuickLinkChip` / `readQuickLinkChipKinds` / `removeQuickLinkChips` / `replaceQuickLinkChips` 全部改走它；提交桥读取同样收敛到本会话卡片；全文档兜底只在「定位不到座位 **且** 文档里恰好只有一张卡片」时启用（注释写明条件），多张卡片下返回 null → 不动作 | `dom.chip.test.js` 新增 5 条（双卡片夹具）、`composer-video-token.test.js` 新增 `提交只读本会话卡片里的胶囊` |
| 中-4 `replaceQuickLinkChips` 非原子 | 已修 | 改为「先解析胶囊行 → 行拿得到才清旧插新 → 行拿不到就整条不动（返回 0）」 | `dom.chip.test.js`：`拿不到胶囊行时整条不动：不先把旧胶囊清掉` |
| 中-5 提交标记随语言漂移 | 已修（按规格固定名） | `linkChip.js` 新增 `commitLabel`（视频/商品，语言无关），`quickLinkChipMarkdown(kind, url)` 去掉 label 参数、一律用固定名；胶囊**显示名**仍跟随语言。取舍与理由写进规格第 1 条 | `linkChip.test.js`：`提交名是语言无关的固定名：界面语言不改变提交标记` |
| 中-7 撤回剥离上限按卡槽集算 | 已修（整段删除） | `links.js`：删掉 `shortcutTokenPattern` / `tokenSpans` / `consumeLeadingTokens` / `consumeTrailingTokens` 与 budget 逻辑；`stripQuickShortcutText` 现在只剥「仍在草稿开头的提示语」（本通道写入的文本令牌数为 0，胶囊清理由删除通道承担） | `links.test.js`：撤回一组 8 条重写，含「用户手打的同名令牌一枚都不吃」「markdown 形态链接同样不动」；浏览器 `chip-scenario.json` 的 `retract-keeps-user-typed-token` |
| 中-8 商品「已填」判据不认自己的形态 | 已修 | `links.js`：为 `markdown === 'markdown-slot'` 的种类建 `[<名称>: <值>]` 槽位形态匹配（口径同 `promptSlotDetector` 的「名称: 值」，跨语言），`quickLinkKindsInDraft` 裸令牌与槽位形态两条判据并集 | `links.test.js`：`商品认自己的提交形态 [商品: <值>]...`（含 `[商品:]` 不算已填、`[视频: xxx]` 不算视频） |
| 中-6 / 中-9 / 中-10 / 中-11 | 登记 | 未改代码，写进规格「已知行为与取舍」第 3、4、5、7 条 | `specs/quick-shortcut-link-chip.spec.md` |

## 二、顺手修

- **低-4**：`AttachmentTray.tsx` 的卡槽点击不再丢弃 `insertQuickLinkChip` 回执——新增共用模块 `composer-quick-shortcuts/notice.jsx`（`useQuickWriteNotice` + `QuickWriteNotice`，文案 `quickShortcuts.notice.writeFailed`、类名 `omx-quick-shortcut-notice`、`role="status"`），四条快捷方式与素材卡槽行**共用同一条轻提示**；插不进去即 `notifyWriteFailed()`。
- **低-1**：`dom.js` 删除「已 early return 后仍写 `typeof document !== 'undefined' ? document : null`」的死代码（`insertQuickLinkChip` 现在直接用 `document` 与锚点解析）。

## 三、规格新增「已知行为与取舍」清单

1. 提交标记固定为语言无关的中文名（中-5 的裁决与其影响面）。
2. 撤回只剥提示语、绝不吃用户手打令牌；用户改过提示语时整条保留（中-7 的取舍）。
3. 胶囊游离于编辑器文档模型之外：全选删除 / 撤销重做 / 复制草稿都不含胶囊（中-10）。
4. 卡槽两态只在胶囊变更事件里同步，宿主重建卡片后可能停留在禁用态；恢复路径（中-6）。
5. 商品标记的值语义需产品口径确认，本轮不发明补附件逻辑（中-9）。
6. 整组替换非原子的残余情形（拿到行之后插入失败不回滚）与其不可达论证（中-4 补充）。
7. `plugins/omnimux/tests/e2e/*.e2e.test.mjs` 不被任何收集器执行（`plugins/omnimux/scripts/run-tests.mjs` 的 glob 只有 `src/**/*.test.js|ts`，CI 的 quality-gate 无 `tests/e2e` 收集）→ 不构成自动防线（中-11）；「命令」一节也标注了这一点。
8. 低-2 / 低-3 / 低-5 / 低-6 / 低-7 未附条目正文，本轮无法逐条登记具体内容（见「未解决」）。

规格「成功标准」同时补了 S8–S11 四条可验收判据（写入失败不丢链接、作用域收敛、撤回不吃用户内容、商品形态认得出来）。

## 四、测试真实结果（最终代码）

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | **91 通过 / 0 失败**（新增 5 条作用域与原子性用例、撤回一组重写） |
| `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts` | **129 通过 / 0 失败** |
| `node --test plugins/omnimux/src/client/composer-video-token.test.js` | **11 通过 / 0 失败**（新增 4 条：视频/商品/双胶囊写入失败保节点、提交只读本会话卡片） |
| `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | 6 通过 / 0 失败（手动跑；CI 不收集该目录） |

测试口径：不是放宽断言。`dom.test.js` 的「写失败给轻提示」一条随轻提示搬家到共用模块，断言改为「组件渲染 `<QuickWriteNotice>` + 共用模块含文案键与 `role="status"` + 中英文案在字典里」并**新增**一条「素材卡槽行必须读回执、给提示、渲染同一条轻提示」；撤回相关旧断言按新语义整体重写（旧断言依赖已删除的剥离逻辑）。

## 五、L0 门禁与静态检查

- `node scripts/auto-qa-gate.mjs . --diff --base origin/main` → **PASS**（22 个变更文件 / 扫描 19 个；SYNTAX / LIFECYCLE / SECURITY / TOKENS / GUARDS 全绿）。
- `git diff --check` → 无输出（干净）。
- 另跑 `scripts/verify-stage-contracts.mjs`、`scripts/scan-ui-gates.mjs`：报告的问题全部落在**本次未触碰**的文件（`omnimux-social-harvest/HarvestStage.jsx`、`omnimux-accounts` 侧栏、`components/product-picker/ProductCreateLinkModal.jsx`、`session-guide/skills/SkillCard.jsx`、`SkillsPanel.jsx`），属既有红灯，非本轮引入。

## 六、浏览器证据（本工作树自身构建，已刷新）

- 运行：`node .agent-reports/quick-shortcut-link-chip/boot-app.mjs --scenario .agent-reports/quick-shortcut-link-chip/chip-scenario.mjs`（真实无头 Chrome + CDP，动态端口，跑完全部场景后 SIGINT 自清理：`清理完成`、无 `.test-env-*` 残留）。
- 产物：`chip-scenario.json`（`pass: true`，**32 项检查全过**）、`chip-01…06*.png`、`env-summary.json`、`runs/2026-09-22T15-20-30-315Z-pid98175/`。
- 用的就是本轮改动后的客户端产物：`plugins/omnimux/lib/client.js`，sha256 `cfc98d76f15fe1de…`，3233709 字节（改动前 3211491 字节）。
- 场景新增 4 项针对本轮修复的读数：
  - `retract-typed-token-at-draft-tail`：撤回前草稿 `请帮我分析拆解这个视频。 我的补充 [视频]`，手打令牌在末尾；
  - `retract-removes-chip`：撤回后 `chipCount = 0`；
  - `retract-keeps-user-typed-token`：撤回后草稿 `我的补充 [视频]`——提示语被剥掉、用户手打的 `[视频]` 留下（旧实现会连它一起剥掉）；
  - `no-write-failure-notice` / `no-console-exceptions`：全流程无轻提示、无控制台异常。

## 七、仍未解决 / 需产品裁决

1. **中-9 商品标记值语义**（`[商品: <url 或 ID>]` vs 既有真源的「商品名 + 真附件」）：需产品口径与接口口径，本轮未发明补附件逻辑。
2. **中-6 卡槽两态恢复路径**：宿主重建卡片后的事件补发仍缺失（恢复靠再点快捷方式或删/插胶囊），已在规格登记。
3. **中-10 胶囊不在编辑器文档模型内**：宿主 Lexical 会清外部节点的硬事实所致，全选删除 / 撤销重做 / 复制草稿的行为已如实写进规格。
4. **中-11 端到端用例无自动防线**：`plugins/omnimux/tests/e2e/*` 不被 CI 收集（仅手动跑），已在规格标注。
5. **低-2 / 低-3 / 低-5 / 低-6 / 低-7 条目正文缺失**：本轮只收到编号，未收到具体描述，无法逐条登记或判断是否可低成本修；请审查员补条目正文。
6. **分屏（多卡片）只在单元测试覆盖**：浏览器场景是单会话 Hero，双卡片收敛仅由 `dom.chip.test.js` / `composer-video-token.test.js` 的夹具证明，未取得分屏真机/真浏览器证据。
