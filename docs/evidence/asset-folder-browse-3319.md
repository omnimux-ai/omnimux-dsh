---
title: "资产集合先浏览后选择验收"
id: "evidence-asset-folder-browse-3319"
type: "evidence"
status: "living"
authority: "L3"
date: "2026-10-14"
authors: ["agent"]
subsystem: "omnimux-workflow"
---

# 集合先浏览后选择（#3319）

用户明确纠正#3307的集合点击语义：进入集合查看内部文件，选择具体文件加入，不批量导入。历史#3307证据不重写；正式旅程以新更严格合同更新。

## 测试先行

检查点dc96b8493：服务端选B却复制A/B，断言2不等于1；界面集合点击触发导入回调，断言1不等于0。修复后相同两项通过。追加空选择、未知/混合ID、隐藏ID、无kind真实目录拒绝，未选文件不复制。包测试2493全部通过、零跳过；前后端类型检查、Stage14/侧栏8、anti-slop3、产品基线与diff检查通过。

## 完整应用真实浏览器

正式运行命令 `node plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs`，本轮run5106ca4b-1aad-4daa-8a4c-28efd4ecec09，exit0，pass=true/errors=[]/failed=[]，私有宿主cleanup.cleaned=true，ego真实closedSpace回执通过。三任务插件通过正式离线安装；当前加载canvas摘要8c2e676c0d2b578bc8eb5dd559087e84f7319e5704d2b2905229e406621a55a5与构建相等。合成两张图片，无真实模型或凭据、无Dev/Prod业务写入。

实际路径：进入主体集合→显示两文件，零instantiate请求、零画布节点、项目资产仍空→返回再进仍无请求→选择B→仅一个项目资产且名称subject-1.png、一个原生画布节点→保存刷新后仍一张解码图。截图[进入仅浏览](asset-folder-browse-3319-open.png)、[选择一张](asset-folder-browse-3319-select.png)。

## 边界

复用既有样式、MediaThumb、预览地址与项目复制；不改变卡片视觉专项#3316。集合层取消首文件拖拽导入，文件页键盘可选择。实际目录条目当前不可整目录加入，不宣称递归文件夹文件浏览；本轮截图中用户所指的主体集合files层已支持。服务端并发事务既有风险不泛化改造；界面同步pending防止重叠请求，立即更新rev引用。未支持类型显示不可加入，不扩大格式。浏览器覆盖绑定项目，未绑定自动关联由既有集成测试覆盖，不混用。

## 交付状态

本证据记录源码验证，合入、开发版安装、Host重载与人工Dev功能验收分开，不把自动测试绿灯冒称部署。
