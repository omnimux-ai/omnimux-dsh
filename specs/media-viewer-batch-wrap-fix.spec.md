# 图像生成面板张数标题与无空格连写及防断行规格说明书（Media Viewer Batch Wrap Fix Spec）

## 1. 目标（Objective）
根据产品经理核定的 UI 规范与 `design.md` 契约，修复媒体生成面板图像参数中「生成张数」标题、按钮文案以及相关防断行 CSS：
1. **标题精简与对齐**：将图像参数中与清晰度并排的列标题 `<div className="omx-param-title">生成张数</div>` 修正为 `<div className="omx-param-title">张数</div>`，与「清晰度」形成简洁对称的表头排版；
2. **紧凑无空格文字**：将张数按钮内容由 `{cnt} 张` 修正为 `{cnt}张`（如 `1张`、`2张`、`4张`），彻底消除中间空格，杜绝浏览器在极窄宽度或缩放下自动将数字与文字拆开折行；
3. **弹性容器与防断行 CSS**：
   - 确保 `.omx-param-subcol` 包含 `flex: 1; min-width: 0;`，保证并排子列均匀占宽且允许内容按比例收缩；
   - 确保 `.omx-mode-pill` 包含 `white-space: nowrap; word-break: keep-all; min-width: 0;`，确保分段药丸标签永不断行、不换行。

## 2. 影响与目标文件（Target Files）
- `plugins/omnimux/src/client/media-viewer/MediaConfigControls.jsx`
- `plugins/omnimux/src/client/media-viewer/styles.js`
- `plugins/omnimux/src/client/media-viewer/media-config-controls.e2e.test.js`

## 3. UI 元素与文案字典锁定（Zero Improvisation Gate）
- 图像参数分组与子列标题白名单：
  - 生成方式
  - 比例
  - 清晰度
  - **张数**（严格为「张数」，禁止使用「生成张数」）
- 张数按钮选项白名单：
  - `['1张', '2张', '4张']`（严禁中间带空格，如 `1 张`）
- 严禁自行增加任何 Badge、副标题、Emoji 或修饰图标。

## 4. 详细样式契约（Design Token & CSS Spec）

### 4.1 子列弹性分配规范
```css
.omx-param-subcol {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

### 4.2 分段药丸防换行与截断规范
```css
.omx-mode-pill {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  word-break: keep-all;
  transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  cursor: pointer;
}
```

## 5. 验收测试标准（Acceptance Criteria & Testing）
1. `media-config-controls.e2e.test.js` 中包含针对「张数」列标题的严格断言，严禁包含「生成张数」；
2. `media-config-controls.e2e.test.js` 中包含针对紧凑格式 `{cnt}张` 的断言，验证无空格；
3. `media-config-controls.e2e.test.js` 中包含对 `.omx-param-subcol` (`flex: 1`, `min-width: 0`) 和 `.omx-mode-pill` (`white-space: nowrap`, `word-break: keep-all`, `min-width: 0`) 的 CSS 属性匹配断言；
4. 运行 `node --test plugins/omnimux/src/client/media-viewer/media-config-controls.e2e.test.js` 100% 通过；
5. 生成专属实测验证截图 `docs/evidence/batch-wrap-fix-verified.png`。
