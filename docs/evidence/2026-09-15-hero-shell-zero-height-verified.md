# 实机验证证据：修复右栏折叠识别与清除居中外壳零高度切头缺陷

- 日期：2026-09-15
- 任务：修复选择器折叠判定错误、清除外壳高度压零负向上浮并给全屏居中标题赋予健康高度与留白。
- 关联规格：`specs/fix-hero-shell-zero-height.spec.md`

## 验证结果记录
1. **实机问题复现与 CDP 量测证伪**：
   - 在未修复前，CDP 实测居中标题外壳由于选择器误判命中分屏规则，高度被压缩为 0px，导致高度 46px 的子元素在 0px 容器中居中产生了 `-23px` 负向上移，导致顶边猫耳朵被切断。
2. **选择器与样式收敛**：
   - 修复 `.dshDesktopFrame:not([data-rightbar-collapsed="true"])` 选择器层级；
   - 分屏隐藏外壳改为 `display: none!important`，消除了高度为 0 时的内容穿透与负空间居中上浮；
   - 全屏长内容模式下为外壳赋予 `height: auto` 与 36px 呼吸下沉留白。
3. **CDP 实机测量通过**：
   - 居中标题坐标完全回归安全区域（`top: 36px`，`height: 46px`），猫咪图标圆润饱满无任何切耳；
   - 截图保存于 `tmp/test-perfect-header.png`，视觉大方美观。
4. **自动化与回归验证**：
   - `plugins/omnimux/tests/e2e/hero-shell-zero-height.spec.js` 100% 绿灯。
