---
title: "Google Vids (Veo) 视频生成侧边栏入口与内测标记功能规格与文案字典 (Spec Plan)"
id: "spec-google-vids-sidebar-entry"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-25"
authors: ["许清楚 (Xu)", "高见远 (Architect)", "裴像素 (Frontend)"]
subsystem: "omnimux-video"
issue: "#2657"
---

# Google Vids (Veo) 视频生成侧边栏入口与内测标记功能规格与文案字典 (Spec Plan)

> **设计基准**：严格遵循 `docs/contracts/sidebar-extra-entries.md` 侧边栏行契约、`docs/contracts/ui-copywriting-and-naming-standards.md` 全局 UI 微文案规范及现代 SaaS 极简标准。  
> **唯一真源**：本文档与 `docs/prd/google-vids-sidebar-entry.prd.md` 构成前端开发与质量验收的唯一真源，严禁任何形式的自由发挥。

---

## 1. 契约架构与排位规则（Architecture & Rank Contract）

### 1.1 侧边栏协调器参数
`plugins/omnimux-video` 客户端必须通过向全局侧边栏协调器（`window.__omnimuxSidebar`）注册独立行，不得私自使用 DOM `insertBefore` 挂载：

| 属性名称 | 类型 | 锁定值 | 契约依据与说明 |
|---|---|---|---|
| `id` | `string` | `'omnimux-video-google-vids-entry'` | 唯一条目注册标识，防重复注入 |
| `rank` | `number` | `7.5` | 排在灵感社区（Rank 7）之后、产品库（Rank 8）之前 |
| `datasetKey` | `string` | `'data-omnimux-google-vids-entry'` | 自动化测试与契约选取的标准 Marker |
| `customClassName` | `string` | `'omnimux-google-vids-entry'` | 扩展类名，前缀严格遵循规范 |
| `access` | `string` | `'offline'` | 离线可点击准入：点击直接唤起工作台面板，内部由 Studio 自身引导门禁处理 Google 登录与剪辑工程就绪态 |
| `tabId` | `string` | `'omnimux-video:google-vids'` | 唤起的 Workbench Tab 唯一命名空间 ID |

---

## 2. DOM 结构与样式 Token 映射表（DOM & Styling Spec）

### 2.1 DOM 结构模板（逐层锁定）
```html
<button
  type="button"
  class="omnimux-sidebar-nav-entry omnimux-google-vids-entry"
  data-omnimux-google-vids-entry=""
  data-tab-id="omnimux-video:google-vids"
  title="Google Vids · 内测版"
  aria-label="Google Vids · 内测版"
>
  <span class="omnimux-sidebar-nav-entry-icon" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" role="presentation" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2.5" width="12" height="11" rx="2.5" stroke="currentColor" stroke-width="1.3" />
      <path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor" />
    </svg>
  </span>
  <span class="omnimux-sidebar-nav-entry-label">Google Vids</span>
  <span class="omnimux-sidebar-alpha-badge" aria-label="Alpha · 内测">内测版</span>
</button>
```

### 2.2 尺寸与设计令牌规格表（Metrics & Token Table）

| 部件 / 属性 | 数值 / 表达式 | 关联 Token | 违背判定（FAIL 条件） |
|---|---|---|---|
| **行高 (Height)** | `32px` | 固定行高 | `!= 32px` |
| **水平内边距** | `0 8px` | 固定内边距 | 出现 `padding-top/bottom` 或水平非 `8px` |
| **容器圆角** | `8px` | 同主侧边栏会话行圆角 | `!= 8px` |
| **默认背景** | `transparent` | 默认透明 | 出现默认灰色或阴影 |
| **悬停背景 (Hover)** | `var(--dsw-alias-interactive-bg-hover)` | DSH 原生交互 Hover | 硬编码 hex 色值、变灰 |
| **激活背景 (Active)** | `var(--dsw-alias-interactive-bg-active)` | DSH 原生交互 Active | 仅选中状态着色，严禁双高亮 |
| **图标尺寸 (Icon Box)** | `14px × 14px` | 与文字 14px 光学体量完全一致 | 出现 13px 或 16px 图标 |
| **图标与文字间距** | `6px` | 侧边栏行间距 | `!= 6px` |
| **标签字号/行高** | `14px / 20px` | `var(--dsw-font-s-14)` | 非 14px 字号 |
| **标签文字颜色** | `var(--dsw-alias-label-primary)` | 文本主色 | 灰色或彩色文字 |
| **徽标外边距** | `margin-left: auto; flex: none;` | 右对齐自适应排版 | 居中或固定 left |
| **徽标内边距** | `0 5px` | 极简微胶囊内边距 | 超过 6px 内边距 |
| **徽标字号/行高** | `12px / 16px` | 紧凑型辅助字号 | 大于 12px |
| **徽标边框** | `1px solid var(--dsw-alias-border-l2)` | DSH 次级边框 Token | 实心背景、警示彩色边框 |
| **徽标文字颜色** | `var(--dsw-alias-label-secondary)` | 次级标签文本色 | 亮白、正红、警示黄 |
| **徽标圆角** | `4px` | 徽章标准圆角 | 非 4px 圆角 |

### 2.3 折叠态 CSS 规则
必须包含以下 CSS，保证侧边栏折叠至 56px 时平滑降级：
```css
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] {
  width: 36px;
  min-width: 36px;
  padding: 0;
  justify-content: center;
}
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] .omnimux-sidebar-nav-entry-label,
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] .omnimux-sidebar-alpha-badge {
  display: none !important;
}
```

---

## 3. UI 元素白名单与黑名单字典（Element Whitelist & Blacklist）

### 3.1 元素白名单（允许且仅允许以下 3 个子元素）
1. `span.omnimux-sidebar-nav-entry-icon`：仅包含一个 14×14 单色 SVG。
2. `span.omnimux-sidebar-nav-entry-label`：仅包含纯文本标签。
3. `span.omnimux-sidebar-alpha-badge`：仅包含「内测版」或「Alpha」纯文本徽标。

### 3.2 显式红线黑名单（严禁出现，出现即打回）
- ❌ **严禁任何前缀/后缀装饰 Emoji**：如 `💎 Google Vids`、`✨ 内测版`、`🔥 New`。
- ❌ **严禁双重 Badge**：如既打 `[内测版]` 又打 `[Veo]` 或 `[Beta]`。
- ❌ **严禁任何副标题/描述段落**：行内禁止 `small`、`p`、`div` 等描述副行。
- ❌ **严禁彩色或实心徽标**：严禁 `background: #ff4d4f` 或渐变色背景。

---

## 4. 逐字文案与国际化字典（Canonical Copy & i18n Dictionary）

前端代码中的国际化翻译模块必须严格包含以下键值，逐字对齐，严禁改写：

```javascript
export const GOOGLE_VIDS_SIDEBAR_I18N = {
  zh: {
    'sidebar.google_vids.nav': 'Google Vids',
    'sidebar.google_vids.badge': '内测版',
    'sidebar.google_vids.tooltip': 'Google Vids · 内测版',
    'workbench.google_vids.tab': 'Google Vids'
  },
  en: {
    'sidebar.google_vids.nav': 'Google Vids',
    'sidebar.google_vids.badge': 'Alpha',
    'sidebar.google_vids.tooltip': 'Google Vids · Alpha',
    'workbench.google_vids.tab': 'Google Vids'
  }
};
```

### 文案反向断言测试清单（Negative Assertions）
1. `label` 正则断言：必须精确匹配 `/^Google Vids$/`，不得包含 `(Veo)` 或 `视频生成`。
2. `badge` 正则断言：中文必须精确为 `/^内测版$/`，英文必须精确为 `/^Alpha$/`。

---

## 5. 工作台挂载与单激活槽仲裁契约（Workbench Mount & Activation Contract）

### 5.1 Stage Store 挂载实现范式
在 `plugins/omnimux-video/src/client/sidebar-entry.js` 中创建与 `window.__omnimuxWorkbench` 对齐的 Stage Store：

```javascript
import { createSidebarEntry } from 'dsh-ui-kit';
import { GOOGLE_VIDS_SIDEBAR_I18N } from './locales.js';

export const ENTRY_SELECTOR = '[data-omnimux-google-vids-entry]';
export const GOOGLE_VIDS_TAB_ID = 'omnimux-video:google-vids';

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
  <rect x="2" y="2.5" width="12" height="11" rx="2.5" stroke="currentColor" stroke-width="1.3" />
  <path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor" />
</svg>`;

export function createGoogleVidsStageStore(t) {
  let store = null;
  const ensure = () => {
    if (store) return store;
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined;
    if (!api || typeof api.createSidebarStore !== 'function') return null;
    store = api.createSidebarStore({
      tabId: GOOGLE_VIDS_TAB_ID,
      title: () => t('workbench.google_vids.tab') || 'Google Vids',
    });
    return store;
  };
  return {
    getSnapshot() {
      return Boolean(ensure()?.getSnapshot?.());
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      const ready = ensure();
      if (ready && typeof ready.subscribe === 'function') return ready.subscribe(listener);
      let unsub = () => {};
      const started = Date.now();
      const timer = setInterval(() => {
        const next = ensure();
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer);
          unsub = next.subscribe(listener);
          listener();
          return;
        }
        if (Date.now() - started > 8000) clearInterval(timer);
      }, 50);
      return () => {
        clearInterval(timer);
        unsub();
      };
    },
    open() {
      ensure()?.open?.();
    },
    close() {
      ensure()?.close?.();
    },
    set(next) {
      if (next) this.open();
      else this.close();
    },
    readBox() {
      return ensure()?.readBox?.() || { top: 0, left: 0, width: 0, height: 0 };
    },
  };
}

export function mountSidebarEntry(_stage, t, locale) {
  return createSidebarEntry({
    id: 'omnimux-video-google-vids',
    rank: 7.5,
    label: () => t('sidebar.google_vids.nav') || 'Google Vids',
    badge: () => t('sidebar.google_vids.badge') || '内测版',
    tooltip: () => t('sidebar.google_vids.tooltip') || 'Google Vids · 内测版',
    iconSvg: ICON_SVG,
    stageStore: createGoogleVidsStageStore(t),
    locale,
    access: 'offline',
    customClassName: 'omnimux-google-vids-entry',
    datasetKey: 'data-omnimux-google-vids-entry',
  });
}
```

### 5.2 单激活槽仲裁铁律（The Single Rail Slot Law）
1. **单一事实来源**：`entry.dataset.active` 必须完全由 `stageStore.getSnapshot()` 判定，严禁条目内部自行判断 `isOpen` 或监听 DOM 事件私设高亮。
2. **多栏联动排他**：
   - 当中间会话列展开且选中了会话时，工作台侧边栏条目必须处于未激活态；
   - 当点击其他条目（如资产库、灵感社区）唤起其对应面板时，Google Vids 条目必须立即撤回激活态。

---

## 6. 前端实施检查单与验收门禁（PM Acceptance Checklist）

| 序号 | 检查项目 | 验收标准 / 断言命令 | 责任人 | 判定 |
|---|---|---|---|---|
| **AC-01** | Marker 属性存在 | `document.querySelector('[data-omnimux-google-vids-entry]') !== null` | 裴像素 | 必检 |
| **AC-02** | Rank 排位准确 | 条目位于灵感社区（Rank 7）下方，产品库（Rank 8）上方 | 裴像素 | 必检 |
| **AC-03** | 图标光学规格 | SVG `viewBox="0 0 16 16"`，宽高 `14×14`，单色细线 | 裴像素 | 必检 |
| **AC-04** | 中文文案锁定 | Label 为 `Google Vids`，Badge 为 `内测版` | 裴像素 | 必检 |
| **AC-05** | 英文文案锁定 | 切换英文后，Label 为 `Google Vids`，Badge 为 `Alpha` | 裴像素 | 必检 |
| **AC-06** | 零冗余元素检查 | 条目内直接子元素数 $\le 3$，无任何 Emoji / Extra Badge | 严过关 | 必检 |
| **AC-07** | 激活态互斥 | 打开 Google Vids Tab 时有且仅有自身高亮，点击新会话后立即熄灭 | 严过关 | 必检 |
| **AC-08** | 折叠态自愈 | 宿主加 `[data-sidebar-collapsed]` 后，Label 与 Badge 消失，宽度 36px 居中 | 严过关 | 必检 |

---
*规格说明书签署完毕。请前端开发工程师裴像素严格依据本规格实施编码。*
