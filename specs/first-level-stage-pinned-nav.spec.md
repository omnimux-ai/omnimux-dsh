# 一级页滚动收敛 · 页头与一级/二级 Tab 固定

- 任务单：Issue #1977
- 分支：`feat/omnimux-stage-sticky-nav-issue-1977`
- 规格状态：draft（待人工确认后进入实现验收）
- 关联契约：`docs/contracts/first-level-page-layout.md`（L1）、`docs/contracts/client-ui-remediation.md`（形态定界）、`docs/contracts/ui-design-guidelines.md`（几何/控件）

## 1. 目标（Objective）

**建什么**：把「页头（标题+副标题）+ 动作行 + 一级 Tab + 二级分类行固定；只有内容数据区滚动」定为所有一级页（工作台 Tab 页）的统一布局契约，并逐页落地。

**为何**：当前一级页在向上滚动时会把导航一起滚走，用户失去「我在哪一层分类」的上下文，需要回滚才能切分类。

**用户是谁**：使用 OmniMux 桌面端创作工作台、在右侧工作台打开一级页（资产库 / 技能·专家 / 项目 / 灵感社区 / 自动化 / 数据分析 / 发布）日常操作的用户。

**成功长什么样**：
1. 在任一含 Tab 的一级页里向上滚动内容，页头与一级/二级导航行始终停在滚动区顶部，直到内容滚完。
2. 切换一级/二级分类后，滚动位置回到该分类的内容顶部（不继承上一分类的滚动偏移）。
3. 只有「内容数据区」出现滚动条；页头栈没有独立滚动条，也没有被裁切的半行。

### 验收标准（可测）

| ID | 场景 | 期望 |
|---|---|---|
| AC-1 | 资产库·本地：向上滚动卡片网格 800px | 标题「资产中心」、副标题、动作行、`本地/云端/产品库` Tab、类型 Chip 行仍在视口内且 y 坐标与滚动前一致（±1px） |
| AC-2 | 资产库·云端：向上滚动卡片网格 800px | `全部/角色/场景/道具/素材/风格/声音` 与二级子分类两个 Chip 行固定不动；卡片网格滚走 |
| AC-3 | 资产库·产品库：向上滚动 | 产品分类行固定不动 |
| AC-4 | 技能/专家：向上滚动卡片网格 800px | `Skill / 我的 Skill / 专家市场` 一级 Tab 与二级分类 Chip 行固定不动；卡片网格滚走 |
| AC-5 | 其余一级页（项目 / 灵感社区 / 自动化 / 数据分析 / 发布 / 账号等） | 其一级/二级导航行若存在，滚动时固定不动；若页面本无二级行，只要求页头与一级行固定 |
| AC-6 | 任一页切换分类 | 内容区 `scrollTop` 归零 |
| AC-7 | 无内容可滚（空态/首屏未溢出） | 不出现第二条滚动条、不出现双滚动条；布局不跳动 |
| AC-8 | 静态门禁 | `pnpm verify:stages` 与新增的布局断言在回归时失败（负向对照：把导航行移回滚动容器内 → 门禁变红） |

## 2. 命令（Commands）

```bash
# 在任务工作树根目录执行
cd .worktrees/omnimux-stage-sticky-nav

# 静态门禁（一级页契约）
pnpm verify:stages
pnpm test:ui                       # UI01~UI10 静态扫描（原生控件/内联样式/裸色/字阶）

# 受影响插件单测
pnpm --filter omnimux-assets test
pnpm --filter omnimux-market test
pnpm --filter omnimux-products test

# 真实浏览器 Web 验收（工作树隔离，动态端口，自清理）
pnpm test:worktree-web assets
pnpm test:worktree-web all

# 规格/契约文档
git diff --check
pnpm doc:lint
```

## 3. 项目结构（Project Structure）

```
plugins/<plugin>/src/client/*Stage.jsx|plaza-shell.js|skill-plaza.js   # 页面骨架（固定栈 + 唯一滚动区）
plugins/<plugin>/src/client/styles.js|css.js                          # 该页的骨架样式（flex 列 + overflow 归属）
plugins/<plugin>/src/*.test.js                                        # 该插件的布局/契约断言
scripts/verify-stage-contracts.mjs                                    # 一级页静态门禁（新增固定栈断言）
docs/contracts/first-level-page-layout.md                             # L1 契约：新增强制条款
.workbuddy/evidence/…                                                 # 浏览器取证产物（截图/报告）
```

## 4. 代码风格（Code Style）

沿用仓库既有形态：客户端为 `.jsx`/`.js`（Babel 内联 JSX，无 TS）、样式为各插件 `styles.js` 里的模板字符串 CSS、类名 `omnimux-<plugin>-<part>`（market 为 `sh-*`）。

骨架的唯一合法形状（三个同级子节点，滚动只发生在最后一个）：

```jsx
<div className="omnimux-<p> -stage">            {/* 根：flex 列 + overflow:hidden */}
  <PageHeader … />                              {/* Layer 1  固定 */}
  <div className="omnimux-<p>-stage-toolbar">…  {/* Layer 3  固定 */}
  <div className="omnimux-<p>-body">            {/* Layer 4  唯一滚动区 */}
    <div className="omnimux-<p>-scroll">…</div>
  </div>
</div>
```

```css
/* 固定栈：不滚、不被压缩 */
.omnimux-<p>-stage-toolbar { flex: none; }
/* 唯一滚动区：吃掉剩余高度，自己滚 */
.omnimux-<p>-body { flex: 1; min-height: 0; overflow: auto; }
```

禁止：把导航行放进滚动区；给根容器 `overflow: auto`；`position: fixed` 盖住会话列。

## 5. 测试策略（Testing Strategy）

| 层 | 位置 | 覆盖 |
|---|---|---|
| 静态契约断言 | `plugins/<pkg>/src/*layout*.test.js`、`scripts/verify-stage-contracts.mjs` | 骨架顺序、滚动区唯一、导航行不在滚动区内 |
| 单元测试 | `plugins/<pkg>/src/client/*.test.js` | 分类切换后滚动位置归零的纯函数/行为 |
| 真实浏览器 | `pnpm test:worktree-web <stage>` | 几何断言 + 滚动前后 y 坐标对比 + 截图取证 |
| UI 门禁 | `pnpm test:ui` | 不引入原生控件/内联样式/裸色 |

覆盖率期望：不新增无断言代码；每个被改页面至少一条静态断言 + 一条浏览器几何断言。

## 6. 边界（Boundaries）

- **总是**：先改规格再改代码；改动只落在本工作树；跑 `pnpm verify:stages` + `pnpm test:ui` + 受影响插件单测；把浏览器证据落盘。
- **先问**：改动 `personal/dsh-ui-kit`（独立仓库，跨工作区）；把共享壳做成新的 Cordis 插件；改官方 `packages/`；动 MVP 范围外的功能。
- **绝不**：在主检出改业务源码；`position: fixed` 盖会话列；复制规格草稿到主检出；未拿到用户对演示的确认就合入正式分支；提交密钥。

## 7. 假设（Assumptions）

1. 「固定」达到视觉效果即可，用 flex 固定栈实现，不用 `position: sticky`——避免双层滚动条与背景穿透问题。
2. 一级页的滚动容器应是**内容数据区**本身，而不是整个页面根；因此修复方式是「把导航行移出滚动区」或「把滚动区下移到数据网格」。
3. 技能/专家页（`omnimux-market` plaza）与资产库云端/产品库是主要违约面；其余一级页需逐页核对。
4. 共享抽象本轮落在「契约条款 + 静态门禁 + 统一的骨架形状」，不做跨仓库的 kit 组件抽取；kit 抽取作为二期，需用户显式授权。

## 8. 待确认（Open Questions）

1. 二期是否把 `StageRoot / StageNav / StageScroll` 下沉到 `dsh-ui-kit`（独立仓库，需授权）？
2. 「固定」范围是否包含动作行（`+ 添加资产` 等）？本规格按「包含」处理（与资产库现行为一致）。
