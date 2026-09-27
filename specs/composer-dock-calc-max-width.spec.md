# 《新会话吸底输入框支持 calc(...) 动态最大宽度求值与栏目绝对居中规格（Spec Plan）》

**作者**：产品经理 许清楚（Xu）  
**执行角色**：前端开发 裴像素、代码审查 审秋毫、质量保证 严过关  
**版本**：v1.0 (2026-09-26)  
**工作树**：`omnimux-dsh-wt-composer-dock-calc-max-width-2715`  
**关联任务**：解决由于 `--dsh-composer-card-max-width` 赋值为 `calc(...)` 导致 parseFloat 得到 NaN 误回退至 952px，从而与实际渲染宽度（如 672px）脱节产生偏左畸变的缺陷。

---

## 一、问题背景与技术根因

### 1. 业务现象与实机证据
用户实机指正：“输入框宽度正常了 但是 在会话区域靠左了？当前是全局居中？我要的是栏目页面的居中”。
实机探查与 CDP 深入求值证据：
- 视口宽度 1728px，侧边栏 280px，右侧会话栏目工作台范围 `[280px, 1728px]`（宽度 1448px）；
- 宿主卡片在原生 DSH 体系下继承的 CSS 变量为：
  `--dsh-composer-card-max-width: calc(640px + 32px)`；
- 浏览器真实渲染计算的 `computedStyle(card).maxWidth` 为 `672px`，顶部流式原位真实渲染宽度亦为 `672px`；
- 原 `useComposerDocking.js` 与 `TrendingReplicateSection.jsx` 的提取代码：
  ```javascript
  const parsedMax = parseFloat(rootStyle.getPropertyValue?.('--dsh-composer-card-max-width'))
  if (Number.isFinite(parsedMax) && parsedMax > 0) {
    nativeMaxWidth = parsedMax
  }
  ```
- **致命缺陷**：
  `parseFloat("calc(640px + 32px)")` 遇到前缀字母 `c`，直接返回 **`NaN`**！
  导致 `Number.isFinite(parsedMax)` 判定为 `false`，未能提取到卡片的原生宽度限制，错误地回退到了全局常量 `DOCK_MAX_WIDTH = 952`！
- **几何畸变链条**：
  1. JS 计算时认为卡片宽度为 `width = 952px`；
  2. 计算居中左起点：`left = column.left + (column.width - 952) / 2 = 280 + (1448 - 952) / 2 = 528px`；
  3. 但在 CSS 渲染层，`max-width: var(--dsh-composer-card-max-width, 952px)` 生效，浏览器支持 `calc`，将卡片实际宽度强制钳制为 **672px**；
  4. 于是卡片实际右边缘落在：`x = 528 + 672 = 1200px`；
  5. 栏目内部边距对比：
     - 左侧留白：$528 - 280 = 248\text{px}$；
     - 右侧留白：$1728 - 1200 = 528\text{px}$；
     - **右侧留白比左侧整整多出 280px**（$(952 - 672) = 280\text{px}$），导致输入框在会话区域内严重向左偏移！

---

## 二、重构方案与算法契约

### 1. 核心提取算法 `resolveNativeComposerMaxWidth(card)`
- **步骤 1（优先提取已求值属性）**：
  通过 `win.getComputedStyle(card).maxWidth` 提取浏览器内部已经将 `calc(...)` 求值完成的绝对像素值（例如返回 `"672px"` 或 `"952px"`）；
  若不为 `'none'` 且 `parseFloat` 得到正有限数，直接返回该数值；
- **步骤 2（降级解析纯数字 CSS 变量）**：
  若卡片尚未挂载导致 `maxWidth` 为 `'none'`，再尝试提取 `--dsh-composer-card-max-width` 原始变量并解析；
- **步骤 3（保底常量）**：
  若均无有效值，保底回退至 `DOCK_MAX_WIDTH = 952`。

### 2. 精确对称居中公式
当 `nativeMaxWidth` 正确获取为 `672px`（或宽屏下的 `952px`）时：
- 计算宽度：$width = 672\text{px}$；
- 计算居中坐标：$left = column.left + (column.width - width) / 2 = 280 + (1448 - 672) / 2 = 668\text{px}$；
- 左侧边距：$668 - 280 = 388\text{px}$；
- 右侧边距：$1728 - (668 + 672) = 388\text{px}$；
- **左右对称留白：388px : 388px，对称误差 0px！**

---

## 三、验收标准（Acceptance Criteria）

- **AC-1 (calc 表达式求值)**：当 `--dsh-composer-card-max-width` 为 `calc(640px + 32px)` 时，`resolveNativeComposerMaxWidth(card)` 必须准确解析出 `672`，严禁返回 `NaN` 或回退至 `952`。
- **AC-2 (1:1 绝对居中验证)**：在栏目宽度 1448px、侧边栏 280px 下，卡片计算宽度为 672px 时，`left` 必须计算为 `668px`，左边距 388px、右边距 388px，差值严格为 0px。
- **AC-3 (宽屏 952px 保持)**：在 `--dsh-composer-card-max-width` 为 `952px` 的宽屏视口下，卡片宽度计算为 952px，居中公式同样保持 1:1 对称。
- **AC-4 (零过度设计与白名单文案)**：收起操作项严格保持为中「收起」/ 英「Collapse」，零多余宾语、零解释性 Toast。
