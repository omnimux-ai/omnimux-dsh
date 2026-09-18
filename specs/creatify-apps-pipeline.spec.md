# 规格：灵感模板 7 大精选应用工程转译与首页无缝直通闭环

## 1. 任务背景与目标
- **关联 Issue**: #2283（总纲）, #2278（极简出片前台与首页直通）, #2279（四大标准插槽与工作流标准化）
- **核心诉求**:
  1. 从本地资产库 162 套成熟 Creatify 原始工作流中提取 7 个分类各 1 款王牌爆款；
  2. 编写自动化转译工具生成系统内部标准工作流工程快照，标准化「商品展示槽」、「核心文案槽」、「人声解说槽」和「背景配乐槽」四大业务插槽；
  3. 批量生成并注册 7 个官方标准「AI 应用」（包含极简出片表单与展示数据）；
  4. 首页「探索模板」全面下架旧版 395 套静态纯文本模板，收敛为单行 7 张高品质爆款大卡片；
  5. 改造点击卡片逻辑，从往输入框贴提示词改为平滑触发 `openAppTab`，直通右侧 AI 应用极简表单。

## 2. 7 大精选应用清单与真源对齐
1. **软件应用 (Apps & Software)**:
   - 应用 ID: `app-creatify-app-demo`
   - 显示名: 手机与网页交互实机演示
   - 原始工作流: `workflows/30856f5b-8093-4a23-aac6-2627908b5b4c.json`
2. **黄金开场 (Hooks)**:
   - 应用 ID: `app-creatify-chasing-product`
   - 显示名: 巨型商品撞屏与荒诞反差追逐
   - 原始工作流: `workflows/c265a3c2-a909-48fe-9fce-32df95e14b95.json`
3. **真实种草 (UGC Style)**:
   - 应用 ID: `app-creatify-ugc-selfie`
   - 显示名: 海外达人第一视角开箱实测
   - 原始工作流: `workflows/a14f503e-baf0-418a-8774-2f3853282113.json`
4. **视效大片 (Animation & 3D)**:
   - 应用 ID: `app-creatify-3d-billboard`
   - 显示名: 裸眼 3D 户外大屏震撼破框
   - 原始工作流: `workflows/6682e41d-8e29-4862-9de0-66a57ef21653.json`
5. **模特试穿 (Fashion)**:
   - 应用 ID: `app-creatify-fashion-tryon`
   - 显示名: 模特动态穿搭走秀与变装
   - 原始工作流: `workflows/0d33fdc4-cf0d-421b-8f67-dc8b4b0c921d.json`
6. **行业精选 (Product Commercials)**:
   - 应用 ID: `app-creatify-product-spotlight`
   - 显示名: 15秒焦点商业大促带货广告
   - 原始工作流: `workflows/70096257-be5d-45f0-b530-da30a8413bec.json`
7. **硬核评测 (Durability Test)**:
   - 应用 ID: `app-creatify-durability-test`
   - 显示名: 暴力防摔与高弹品质实测
   - 原始工作流: `workflows/aa24d127-3795-4de4-9577-db6bbb42a7c7.json`

## 3. 四大通用业务插槽契约
每个应用对应的工作流工程必须明确暴露且可执行：
- `slot:product_image` (media): 接收商品主图（由表单中的 `media-uploader` 传入）
- `slot:copywriting` (text): 接收核心卖点文案（由表单中的 `textarea` 传入）
- `slot:voice_tts` (param/voice): 接收解说声音配置（由表单中的 `select-single` 传入）
- `slot:aspect_ratio` (param/ratio): 接收生成画面比例（由表单中的 `ratio-cards` 传入）

## 4. 验收与质量门禁
1. **自动化转译**：转译脚本运行无报错，7 套工作流工程 Schema 符合 `CanvasWorkspaceSnapshot` 标准；
2. **应用注册**：7 份 `ApplicationManifest` 格式 100% 通过 Restricted JSON Schema 校验，在宿主初始化时加载；
3. **首页收敛**：首页「探索模板」仅保留 7 张精选大卡片，移除非必要的旧筛选分类；
4. **端到端交互**：点击任一卡片能够正确分发 `openAppTab` 打开应用面板；
5. **测试覆盖**：相关单测与端到端测试 100% 绿灯，质量环门禁 23 项全绿。
