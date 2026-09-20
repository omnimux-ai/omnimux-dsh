# 下架手机管理侧边栏入口规格

- Issue: #2481
- 目标: 根据用户指令，从左侧侧边栏下架「手机管理」导航入口。

## 1. 变更点

在 `plugins/omnimux-device/src/client/index.js` 中注释掉 `mountSidebarEntry` 的挂载，使应用启动时不向左栏注册手机管理按钮。
保留 Tab 注册与全套底层能力。
