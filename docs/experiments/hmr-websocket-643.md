# #643 WebSocket 热更新隔离原型

状态：仅原型，不默认启用；没有修改官方 DSH 源码、安装包或共享 Dev。

## 范围

在 hub 内添加可选的 `hmrTransport: websocket`。L2 配置停用官方 `client-hmr` 行，使其浏览器 EventSource 不进入模块图。Host 通过公开 `loader.import()` 获取官方 HMR 的 `apply` 并调用，保留官方文件变化检测；`clientModules.onRebuilt` 通知进入已有 `hubEvents` WebSocket。官方 SSE 路由仍存在，但原型页面不会连接它。

浏览器通过现有 Loader/module 服务执行串行替换。官方客户端的 reload 函数没有独立导出，因此本插件维护替换顺序与样式清理逻辑；这一小段是主要的上游兼容成本。底座依据为 `dd6322d604e00eec1ba5e0c8541159906a21094a`。

重连只读查询 `/omnimux/hmr/revisions`，用于补齐超过事件缓存期限的变化；该接口沿用官方连接鉴权及本地 Origin 检查。查询期间已收到新通知的模块不消费旧查询结果。revision/串行队列保留在页面内的插件自有状态，防止 hub 自身重载循环。

HMR Host 模块重新挂载会改变 epoch。客户端发现 epoch 改变时整页刷新，以重新加载官方启动版本和模块图；普通插件 rebuild 不刷新页面。

## 隔离启用

在本任务工作树执行：

```sh
OMNIMUX_L2_EXTRA_PATCH="$PWD/scripts/l2-hmr-websocket.patch.yml" \
  bash scripts/dev-env.sh start hmr-ws-643 omnimux --source="$PWD"
```

原地重启时同样传入 `OMNIMUX_L2_EXTRA_PATCH`。该环境变量只向 L2 官方 CLI 追加 `--patch`，不写 Dev/Prod profile。原型 overlay 使用 hub 默认配置，不适用于携带自定义部署配置的共享环境。

## 验证目标

- 同源至少七个 IAB 页面：无官方 HMR EventSource，普通请求、页面刷新和现有 Stage 正常。
- 修改任务自己的 client bundle：各页面经 WebSocket 替换插件，页面导航计数不增加。
- 短断线与超过缓存期限的断线：重连后补齐版本；HMR Host 重挂载后页面恢复。
- 自身重载、过时 snapshot、prefetch/materialization 失败与卸载中断：无循环，失败可重试。
- 通过共享 `verify:live`，记录当前 L2 的 commit、PID、端口和截图。

原型完成不等于生产交付。是否采用、推送/合并以及 Dev 部署在结果评估后另行决定。
