# Spec: 移除失效的全屏展开按钮（remove-expand-btn）

## 问题
输入面板左上角的「展开全屏输入」按钮没有绑定任何事件，点击无响应，是死元素。

## 验收
- 输入面板不再渲染该按钮
- 不引入回归（其余控件正常）

## 改动
- `MediaViewerComposer.jsx`：删除 `.omx-composer-expand-btn` button 整块
