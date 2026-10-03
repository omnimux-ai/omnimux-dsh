# Issue #2989 实机复现证据（OmniMux Dev 45120, CDP 直连渲染进程）

- 环境：OmniMux Dev（Electron 渲染进程 ws://127.0.0.1:9229），资产库「公共」→「声音」行。
- 复现步骤：mouseover 首张音频卡 → Audio 实例创建并播放（aria-pressed=true）→ click 缩略图暂停 → 副作用立刻再次 toggle → 第二个 Audio 实例创建且继续播放（aria-pressed 仍 true）。
- 关键观察：一次点击产生两个 Audio 实例（__aud 由 1 → 2），音频不停；媒体路由 `/omnimux/assets/cloud/media?id=…` 本身可正常流播（currentTime 前进、readyState=4），排除数据层。
- 结论：bug 在 `CloudAssetsView.jsx` hover 自动播放副作用与点击 toggle 竞争。
