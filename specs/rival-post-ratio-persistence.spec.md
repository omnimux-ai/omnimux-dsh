# Spec: 作品真实宽高比 ratio 落库与下发（#3110 · Host 侧切片）

> 垂直票 #3110 内的 Host 分工。客户端卡片分形与瀑布流归前端工程师，本规格只覆盖
> ratio 在持久化与下发链路上的落点。
> 设计真源：docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md §9.3；
> 实现口径：docs/implementation/account-monitor-v2-plan-notes.md §2.2 / §4.2。

## 目标

账号监控卡片需要按作品真实宽高比占位。数据链的持久化行与下发结构都没有 ratio：
写入的值读回为空。本切片把 ratio 补进持久化构造与下发构造两处。

## 范围

- plugins/omnimux-inspiration/src/rival/rival-accounts-store.js：行构造补充 ratio
  字段，类型与 duration 一致（有限数字或 null）。
- plugins/omnimux-inspiration/src/rival/rival-feed.js：下发结构透传 ratio，
  有限数字原样下发，否则为 null。
- 白名单同步纪律：行构造、更新路径读回验证、形状清单 fixture 三处一次改齐
  （本模块曾两次因漏同步而丢状态）。

不做：不新增任何云调用（成本契约每账号每周期恰 2 次不变）；不动 src/client/；
不改采集器字段名（上游产出即 ratio）。

## 成功标准

1. ratio 为有限数字时持久化与下发均为该值；缺失或不可用时为 null（语义=未知，
   客户端按规格 §9.3 回落，image 默认 4:5）。
2. 更新路径写入 ratio 后读回同值。
3. 无新增云调用。

## 边界

- 总是：白名单三处同步；提交前跑切片回归。
- 先问：改采集字段名、改成本契约、动 src/client/。
- 绝不：塞白名单外字段、新增云调用、顺手重写无关代码。

## 假设

- 上游写入字段名即 ratio（number，宽/高）；若为字符串或别名字段，规范化落成
  null，需在上游补换算——不在本票范围。
