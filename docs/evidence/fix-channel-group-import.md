# 修复 execute 模块缺少 getModelChannelGroups 导出导入证据报告

- **验证目标**：解决在媒体生成链路执行中，调用 getModelChannelGroups 时因头部解构缺失引起的 ReferenceError 异常。
- **改动位置**：`plugins/omnimux/src/media/execute.js` 第 18 行解构导入 `getModelChannelGroups`。
- **验证结果**：
  - `plugins/omnimux/src/media/direct-media-pipeline.test.js`：通过
  - `plugins/omnimux/src/media/media-generate-pipeline.e2e.test.js`：通过
  - `plugins/omnimux/src/media/direct-http.test.js`：通过
