# 《新会话吸底输入框宽度对齐顶部默认输入框原生上限（方案 A）PRD 原型与 UI 元素/文案字典规格（Spec Plan）》

**作者**：产品经理 许清楚（Xu）  
**执行角色**：架构师 高见远、前端开发 裴像素、质量保证 钱质检  
**版本**：v1.0 (2026-09-26)  
**状态**：已批准签发（Approved for Engineering Implementation）  
**关联任务**：新会话欢迎页吸底输入框宽度原生对齐重构（方案 A）  

---

## 一、产品概况与目标（PRD Overview）

### 1. 业务背景与用户诉求
在 OmniMux 会话工作台的新会话欢迎页（Session Guide）中，输入框（Composer）支持随着页面滚动在“顶部流式原位（Inline）”与“底部悬浮吸底（Docked）”之间动态切换。
用户反馈：**新会话欢迎页中，向下滚动后吸底的底部输入框过宽，与顶部默认输入框的视觉宽度脱节**。
用户明确要求采纳**「方案 A」**：吸底状态下的输入框宽度必须与顶部默认输入框原生上限完全保持一致。

### 2. 现状技术根因剖析（Root Cause Analysis）
经产品与架构联合排查，当前宽度脱节由两层逻辑不一致导致：
1. **顶部默认输入框遵循 DSH 官方原生响应式规范**（`session-guide/styles.js:50-54`）：
   ```css
   [data-omnimux-starter-host] [data-composer-card] {
     width: 100%!important;
     max-width: var(--dsh-composer-card-max-width, 952px)!important;
     margin-inline: auto!important;
   }
   ```
   在宽屏下封顶为 `952px`，在紧凑/分栏态下自适应为容器宽度（约 `712px` 或 `100%`），居中舒适。
2. **底部吸底输入框被独立硬编码脱轨**（`useComposerDocking.js:23` 与 `session-guide/styles.js:3149-3157`）：
   - JS 几何计算硬编码了老旧阈值：
     ```javascript
     export const DOCK_MAX_WIDTH = 780;
     const width = Math.min(available, Math.max(DOCK_MAX_WIDTH, measureInlineComposerDemand(card)));
     root.style.setProperty('--omnimux-dock-width', `${Math.round(width)}px`);
     ```
   - CSS 吸底样式强制覆盖了原生最大宽度：
     ```css
     [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card] {
       position: fixed!important;
       left: var(--omnimux-dock-left, 0px)!important;
       width: var(--omnimux-dock-width, 100%)!important;
       max-width: none!important; /* 致命隐患：完全摧毁了 952px 原生上限！ */
       margin: 0!important;
       bottom: var(--omnimux-dock-bottom, 20px)!important;
       z-index: 45!important;
     }
     ```
   - 产生双重缺陷：
     - 若 JS 计算退化或视口极宽且 `available` 计算偏大时，`max-width: none` 会导致输入框被撑得过宽（甚至胀满 100% 视口）；
     - 若 JS 命中旧阈值，则被截断在 780px，与顶部 952px 形成明显的“跳变割裂感”，破坏了沉浸式产品体验。

### 3. 方案 A 核心决策与价值
1. **统一原生基准（Native Width Parity）**：吸底状态彻底共享 `var(--dsh-composer-card-max-width, 952px)`，无论是宽屏、中屏还是窄屏，输入框视觉尺寸与顶部完全等宽。
2. **动态几何同步**：移除写死的 780px，将基准宽度动态对齐宿主原位卡片宽度与 CSS 变量上限，精准水平居中。
3. **关联组件联动无缝**：收起按钮（`.omnimux-trending-undock`）与素材导轨（`.omx-attachment-dock`）在吸底宽度变更后依然严格吸附并对齐。
4. **消除视觉跳变**：用户向下滚动吸底、向上滚动归原位时，输入框横向边界不产生抖动或跳变。

### 4. 明确不做事项（Non-Goals — 显式红线）
- **绝不引入额外配置项**：不向用户暴露“输入框宽度调节”开关，保持现代 SaaS 零配置交付；
- **绝不增加解释性文案**：不添加任何“吸底模式”、“已居中”等辅助说明；
- **绝不引入新 Badge 或图标**：保持操作区零冗余，不给输入框添加任何修饰性胶囊或标签；
- **不重写收起状态机核心逻辑**：完整继承 v2.0 的三态机（TOP / BOTTOM / COLLAPSED）与滚动静默守卫，本次仅聚焦几何与宽度契约对齐。

---

## 二、信息架构与极简原型线框（Prototype Wireframe）

### 1. 宽屏常规态线框对比（Viewport >= 1200px）

#### 顶部初始态（TOP / Inline）
```
┌────────────────────────────────────────────────────────────────────────┐
│                        OmniMux 会话工作台顶部                           │
│                                                                        │
│                      [ 欢迎标语 / 快捷 Pills ]                          │
│                                                                        │
│                ┌──────────────────────────────────┐                    │
│   margin: auto │  [data-composer-card]            │ margin: auto       │
│   (对称居中)   │  宽屏原生上限: max-width: 952px    │ (对称居中)         │
│                │  width: 100% (自适应当前列)       │                    │
│                │                                  │                    │
│                │  [素材导轨 / 快捷加号 / 输入文本]  │                    │
│                └──────────────────────────────────┘                    │
│                                                                        │
│                 [ 模板卡片 / 灵感卡片 / 推荐列表 ]                       │
│                                ↓ 向下滚动                              │
└────────────────────────────────────────────────────────────────────────┘
```

#### 底部吸底态（BOTTOM / Docked）—— 方案 A 对齐后
```
┌────────────────────────────────────────────────────────────────────────┐
│                 [ 模板卡片 / 灵感卡片 / 推荐列表 ]                       │
│                                                                        │
│                                                                        │
│                                                ┌────────┐              │
│                                                │ [收起] │ (紧贴右上角) │
│                ┌───────────────────────────────┴────────┐              │
│   --dock-left  │  [data-composer-card]                  │ 对称右边距   │
│   (精准居中)   │  --omnimux-dock-width: 952px           │              │
│                │  max-width: var(--dsh-...-max-width)   │              │
│                │  【与顶部宽度像素级 1:1 绝对一致】      │              │
│                │                                        │              │
│                │  [素材导轨 / 快捷加号 / 发送操作栏]    │              │
│                └────────────────────────────────────────┘              │
│               ←────── bottom: 20px 安全悬浮底边 ──────→                │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. 分栏/紧凑态线框（Split View / Sidebar Open / Viewport < 952px）
```
┌──────────────────────────────────────┐
│        中间栏可用宽度: 712px          │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │                                └──┼───┐
│  │ [data-composer-card]              │[收起] (自适应右上角)
│  │ width: min(available, 952px)      │   │
│  │ 实际宽度: 712px - 24px = 688px    │   │
│  │ 【两边各留 12px 安全内边距】      │───┘
│  └────────────────────────────────┘  │
│ ←────── bottom: 20px 安全悬浮 ─────→ │
└──────────────────────────────────────┘
```

---

## 三、UI 元素与 SaaS 极简文案字典（UI & Copy Spec — 唯一真源）

### 1. UI 元素白名单与布局属性锁定表

| 区域 / 组件选择器 | 元素类型 | 允许渲染状态 | 核心几何与样式白名单属性 | 严禁附加项（显式红线） |
|---|---|---|---|---|
| `[data-omnimux-starter-host]` | 宿主根容器 | 常驻 | 承载 `--omnimux-dock-width` 与 `--omnimux-dock-left` 动态注入。 | 严禁外层写死任何限制居中的固定宽度。 |
| `[data-composer-card]` (Inline 态) | 原生输入框 | 页面处于顶部可见范围 | `width: 100%!important;`<br>`max-width: var(--dsh-composer-card-max-width, 952px)!important;`<br>`margin-inline: auto!important;` | 严禁在 Inline 态附加吸底样式或多余阴影。 |
| `[data-composer-card]` (Docked 态) | 原生输入框 | 页面滑出顶部不可见区（且未收起） | `position: fixed!important;`<br>`left: var(--omnimux-dock-left, 0px)!important;`<br>`width: var(--omnimux-dock-width, 100%)!important;`<br>`max-width: var(--dsh-composer-card-max-width, 952px)!important;`<br>`bottom: var(--omnimux-dock-bottom, 20px)!important;`<br>`z-index: 45!important;` | **【红线】严禁出现 `max-width: none!important`**；严禁多余外边框或装饰 Badge。 |
| `.omnimux-trending-undock` | 收起操作项 | 仅吸底态浮现 | `position: fixed; z-index: 46;`<br>`left: calc(var(--omnimux-dock-left, 0px) + var(--omnimux-dock-width, 100%));`<br>`transform: translateX(calc(-100% - 4px));`<br>紧凑气泡胶囊，半透明中性底色。 | 严禁在顶部流式态渲染；严禁加入关闭 `×` 符号；严禁使用彩色背景。 |
| `.omx-attachment-dock` | 素材导轨 | 常驻卡片内 | `width: 100%!important;`<br>`max-width: 100%!important;`<br>`margin: 0!important;`<br>`box-sizing: border-box!important;`<br>首张素材卡片左边距严格与底栏加号对齐。 | 严禁横向溢出卡片内壁。 |

### 2. 文案逐字锁定规范（Zero Overdesign，零多余废话）

| 控件对象 | 当前标准文案（中/英 逐字锁定） | 严禁文案（反面教材） | 决策依据与规范要求 |
|---|---|---|---|
| **吸底收起操作项** | 中文：`收起`<br>英文：`Collapse` | ❌ `收起输入框`<br>❌ `收起底部栏`<br>❌ `收起 (对齐原生)` | 纯动词锚定，零同义词叠加。输入框形态具备明确意向，不需要重复宾语。 |
| **输入框占位符** | 原生注入文案保持 100% 原样 | ❌ `请输入内容 (原生对齐)` | 原生透传，零篡改。 |
| **吸底提示 / 气泡** | **【无】零文案** | ❌ `已自动停靠至底部`<br>❌ `952px 宽屏模式` | 严禁出现任何解释性气泡、副标题或新手引导提示条。 |

---

## 四、技术实现架构指导（Architecture & Implementation Guidance）

供架构师高见远与前端开发裴像素对照实施：

### 1. `useComposerDocking.js` 几何计算重构

#### A. 废除写死常量
- 将 `export const DOCK_MAX_WIDTH = 780` 重构为：
  - 支持向后兼容常数，或标记为 deprecated fallback；
  - 核心计算采用动态提取逻辑，默认基准常数升级为 `NATIVE_COMPOSER_MAX_WIDTH = 952`。

#### B. 动态原生上限测量函数 `dockGeometry(card, band)`
```javascript
/**
 * 计算吸底输入框的宽度与水平居中坐标。
 * 契约：严格对齐 DSH 官方原生卡片上限与响应式逻辑。
 */
function dockGeometry(card, band) {
  const rect = band?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0) return null;

  // 1. 获取中间内容滚动的真实列边界
  const column = card?.closest?.('[data-conversation-scroll], [class*="centerCol"]')?.getBoundingClientRect?.() || rect;
  const leftEdge = Math.max(rect.left + 12, column.left);
  const rightEdge = Math.min(rect.left + rect.width - 12, column.right ?? (column.left + column.width));
  const available = Math.max(0, rightEdge - leftEdge);
  if (!available) return null;

  // 2. 读取原生配置的卡片最大宽度（优先读 computedStyle CSS 变量，兜底 952px）
  let nativeMaxWidth = 952;
  const win = card?.ownerDocument?.defaultView || window;
  if (win?.getComputedStyle && card) {
    const rootStyle = win.getComputedStyle(card);
    const parsedMax = parseFloat(rootStyle.getPropertyValue('--dsh-composer-card-max-width'));
    if (Number.isFinite(parsedMax) && parsedMax > 0) {
      nativeMaxWidth = parsedMax;
    }
  }

  // 3. 方案 A 核心计算：宽度上限完全对齐原生 nativeMaxWidth，自适应 available
  const demandWidth = measureInlineComposerDemand(card);
  const baseTargetWidth = Math.min(available, nativeMaxWidth);
  const width = Math.min(available, Math.max(baseTargetWidth, demandWidth));

  // 4. 水平精确居中
  const left = leftEdge + (available - width) / 2;

  return { width, left };
}
```

### 2. `styles.js` 样式修复与收敛
在 `plugins/omnimux/src/client/session-guide/styles.js:3149-3157` 中：
```css
/* 修复前 */
[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card] {
  position:fixed!important;
  left:var(--omnimux-dock-left, 0px)!important;
  width:var(--omnimux-dock-width, 100%)!important;
  max-width:none!important; /* ← 必须彻底删除 */
  margin:0!important;
  bottom:var(--omnimux-dock-bottom, 20px)!important;
  z-index:45!important;
}

/* 修复后（方案 A） */
[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card] {
  position:fixed!important;
  left:var(--omnimux-dock-left, 0px)!important;
  width:var(--omnimux-dock-width, 100%)!important;
  max-width:var(--dsh-composer-card-max-width, 952px)!important; /* 严格对齐原生上限 */
  margin:0!important;
  bottom:var(--omnimux-dock-bottom, 20px)!important;
  z-index:45!important;
}
```

### 3. 关联控件协同性保障
1. **收起按钮 `.omnimux-trending-undock`**：
   - 依赖公式：`left: calc(var(--omnimux-dock-left, 0px) + var(--omnimux-dock-width, 100%));`
   - 当 `--omnimux-dock-width` 变为 952px 时，收起按钮自动位移至 952px 右边缘外侧 4px 处，无需修改收起按钮的定位代码，完美契合。
2. **素材导轨 `.omx-attachment-dock`**：
   - 维持 `width: 100%!important; max-width: 100%!important;`；
   - 内部卡片自然随 952px 输入框内壁铺展，避免右侧截断或异常换行。

---

## 五、实施与验收计划（Implementation & Acceptance Plan）

### 1. 阶段分工与交付节拍
- **Stage 1（产品经理 许清楚）**：完成并下发 PRD、UI 线框原型与 Spec 文档（落盘至 `specs/composer-dock-width-native-parity.spec.md`）；
- **Stage 2（前端开发 裴像素）**：
  1. 重构 `useComposerDocking.js` 中的 `dockGeometry`，消除硬编码 780px，支持读取 `--dsh-composer-card-max-width` 并以 952px 宽屏基准对齐；
  2. 修正 `styles.js` 中的吸底卡片样式，将 `max-width: none!important` 替换为 `max-width: var(--dsh-composer-card-max-width, 952px)!important`；
  3. 更新/补充自动化单元测试与响应式断言；
- **Stage 3（质量保证 钱质检）**：执行真实尺寸渲染核验、分栏断点与极端尺寸压测，出具 QA 证据链；
- **Stage 4（产品经理 许清楚）**：对照白名单表进行零过度设计与 UI/文案一致性验收，签发 `PM_SIGN_OFF`。

### 2. 量化验收条件（Acceptance Criteria）

- [ ] **AC-1（宽屏尺寸一致性验收）**：在视口宽度 >= 1440px 环境下，新会话欢迎页顶部初始状态下 `[data-composer-card]` 测量宽度为 952px；向下滚动吸底后，吸底状态下的 `[data-composer-card]` 测量宽度**严格为 952px (误差 <= 1px)**，禁止出现 780px 或 100% 撑满视口。
- [ ] **AC-2（样式白名单与红线验收）**：检查构建后的 CSS/样式表，吸底状态下的 `[data-composer-card]` **绝对不存在 `max-width: none`**，必须包含 `max-width: var(--dsh-composer-card-max-width, 952px)` 规则。
- [ ] **AC-3（水平居中对齐验收）**：在宽屏吸底状态下，`[data-composer-card]` 的左右两侧外间距保持相等（`Math.abs(leftEdgeSpace - rightEdgeSpace) <= 1px`），在视口中间列严格水平居中。
- [ ] **AC-4（窄屏与分栏自适应验收）**：
  - 在分栏紧凑态（中间栏宽度约 712px）或窄屏（窗口宽度 800px）下，吸底输入框宽度自适应收缩至可用空间（两边各保留 12px 安全内边距），不产生横向滚动条，与顶部初始态自适应行为 100% 吻合。
- [ ] **AC-5（收起按钮联动定位验收）**：在 952px 宽屏及窄屏自适应状态下，点击吸底浮现的 `.omnimux-trending-undock` 按钮均紧贴输入框右上角（右边缘外侧 4px），无错位、无脱节。
- [ ] **AC-6（素材导轨贴合验收）**：存在待复刻/已附加素材卡片时，`.omx-attachment-dock` 宽度贴合 952px 卡片内壁，加号按钮与首张素材卡片垂直靠左对齐，布局紧凑规整。
- [ ] **AC-7（零多余文案与元素验收）**：全页面无新增任何多余文案，收起按钮文案严格保持为「收起」，无任何修饰性 Badge、图标或括号长句。
- [ ] **AC-8（自动化测试全绿）**：相关单测套件 100% 通过，覆盖原生宽度对齐断言。
