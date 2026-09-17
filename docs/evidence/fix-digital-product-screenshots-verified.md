# 数字产品首屏截图抗黑屏与动态渲染就绪优化验证记录

## 1. 验证目标
在隔离工作树（`agent/products-fix-digital-product-screenshots`）中，验证数字产品网站首屏截图的抗黑屏重试与 URL 规范化能力，解决此前在未渲染完毕时抓拍导致生成 5.8KB 纯黑底板的严重问题。

## 2. 真实浏览器端到端执行证据

### 2.1 测试命令 1（带协议完整网址）
```bash
node scripts/verify-site-screenshots.mjs https://www.omnimux.ai
```
**实测输出：**
- 探测浏览器：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- 执行耗时：`7317ms`
- 电脑端首屏（1440×900）：`ok=true`，体积 `117493 bytes`（~115 KB，图文与导航排版完整）
- 手机端首屏（390×844@2x，780×1688）：`ok=true`，体积 `112867 bytes`（~110 KB，移动端竖屏布局完整）
- 判决：`PASS`（100% 成功捕获有效内容）

### 2.2 测试命令 2（无协议纯域名输入）
```bash
node scripts/verify-site-screenshots.mjs www.omnimux.ai
```
**实测输出：**
- 协议自动补齐与归一化：`https://www.omnimux.ai/`
- 执行耗时：`5012ms`
- 电脑端首屏（1440×900）：`ok=true`，体积 `116080 bytes`
- 手机端首屏（390×844@2x，780×1688）：`ok=true`，体积 `111735 bytes`
- 判决：`PASS`

## 3. 自动化测试套件回归
- `site-shots.test.js`：15/15 全部通过（新增 3 项针对 URL 规范化、黑屏空帧检测及重试补拍的用例）。
- `omnimux-products` 全量测试：467/467 全部通过（0 失败）。
- UI01~UI10 规范静态门禁：0 违规拦截。
