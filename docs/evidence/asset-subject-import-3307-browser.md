---
title: "资产卡片单次点击加入画布：完整应用验收"
id: "evidence-asset-subject-import-3307-browser"
type: "evidence"
status: "living"
authority: "L3"
date: "2026-10-14"
authors: ["agent"]
subsystem: "omnimux-workflow"
---

# 完整应用真实浏览器验收

任务 #3307，源码基线 6d7899243，测试检查点 be4c85f31 加本次修复差异。运行命令：`node plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs`，最后一次退出0，整体pass=true、errors=[]、failed=[]、宿主cleanup.cleaned=true。

本次正式安装中枢、资产、工作流三个任务包到任务私有 profile，保留官方基础与Web层；安装文件逐字节核对源码构建产物；数据均为合成两图，无真实凭据或生成请求，无Dev/Prod业务数据软链。动态宿主端口，复用完整应用运行器和任务隔离真实浏览器。

功能路径：项目→创作页→项目资产→资产→主体库→单次点击唯一主体卡片。结果：两张图片对应两个原生画布节点，正常保存后刷新，两图仍解码显示。已加载canvas构建摘要与任务产物一致。未执行拖拽或二次加入画布。截图见[单击结果](asset-subject-import-3307-click.png)和[刷新结果](asset-subject-import-3307-refresh.png)。

浏览器路线是已绑定项目；未绑定项目的自动关联与原有非空节点/连线保留由服务端定向测试覆盖，不冒称已覆盖浏览器未绑定路线。重复点击是否去重不在本次要求中。空主体与服务缺失通过存储及服务测试覆盖。

成功记录：运行102f7440-7c63-4126-9fd2-ff63986e6884、470de135-f54b-47fc-a210-457523514ca2及后续清理加强重跑。真实浏览器任务回执closedSpace=true，无保留页面。逐次原始报告保留任务本机 .workbuddy/evidence/app-qa/ 与 .workbuddy/qa-journeys/issue-3307-artifacts/，失败历史保留不改成功。

原预演暴露固定本地端口自HTTP读取导致500 fetch failed，新增资产服务权威只读入口并由工作流懒读取，最后真实浏览器通过；不是测试环境指定旧端口规避故障。

自动测试：工作流2491、资产780全部通过、无跳过，类型检查通过；相关加载2/2通过与加载门禁8测试通过；Stage、anti-slop、产品基线与插件边界通过。全仓额外UI扫描有9项未触及路径的存量失败，与干净主线完全一致；全插件加载最初因16个无关包未构建失败，改为明确相关包检查。未把失败报告为通过。
