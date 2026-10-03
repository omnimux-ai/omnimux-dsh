# Spec · 灵感社区 feed 加载竞态修复（Issue #2988）

## 背景与现象

灵感社区默认落在「爆款趋势」tab，挂载即发云端请求。云端链路先过
quotaGuard.ensureQuota（实测 ~2.8s）再 fetch（~0.7s）。用户在请求落地前
切到「灵感库」：本地列表 ~6ms 先上屏，随后云端响应晚到，
executeFeedLoad 无过期校验直接 setItems，把「灵感库」的画面换成
爆款趋势内容（tab 仍是灵感库）。CDP 复现证据：.tmp/cdp/race2.mjs。

次要缺陷：useFeedData 的 active effect 与 whenAuthReady effect 在
loadData 变更时各触发一次，同一筛选态会发出两份相同首页请求。

## 用户操作旅程与期望

1. 用户进入灵感社区（默认爆款趋势），立刻点「灵感库」→
   全程只显示本地灵感卡片，不被后来的云端数据覆盖。
2. 切回「爆款趋势」→ 显示云端数据（SWR 缓存命中则即时渲染，不重复发请求）。
3. 任何 tab/筛选组合下，同一次切换只发一份首页请求。
4. 界面、文案、筛选器行为不变（本修复纯逻辑，无 UI 改动）。

## 验收标准

- A1（竞态丢弃）：public 在途时切 local，local 先落屏；public 响应晚到
  必须被丢弃 —— items 保持 local 行，hasMore/phase/error/loading 不被污染。
- A2（去重）：挂载 + auth-ready 触发后，/omnimux/inspiration?page=1
  只发一次；切 local 后 /local?page=1 只发一次。
- A3（缓存仍可写）：被丢弃的响应仍写入其 cacheKey 的 SWR 缓存，切回
  爆款趋势命中缓存即时渲染。
- A4（回归）：CDP Fetch 延迟云端 1.5s 复现脚本下，灵感库 tab 停留期间
  DOM 徽章恒为「本地」。
- A5：已有 feed 分页、筛选、导入 pin、批量删除、复刻流程全部回归绿。

## 设计要点

- executeFeedLoad 增加 lifecycle.isCurrent()：过期后丢弃全部状态写；
  SWR 缓存写保留（过期响应对自己的 cacheKey 仍是有效预热）。
- useFeedData 内部：单调递增序号 ref 标记最新 load；同 key 在途请求
  返回同一 promise（去重）；卸载时令全部在途写失效。
- 不改动服务端、不改请求 URL、不 AbortController（守卫优于取消：
  ensureQuota 阶段的异步无法靠 abort 消除）。

## 测试 seam

useInspirationFeed 的公开返回值（items/hasMore/tab）与 fetch 调用
次数；executeFeedLoad 公开行为。不 mock 内部协作者。
