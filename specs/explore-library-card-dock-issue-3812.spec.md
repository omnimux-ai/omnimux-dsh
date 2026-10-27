# Spec: 探索模板里的资产库 / 灵感库卡片点击后不载入输入框（#3812）

- Issue: #3812
- 风险级别: R1（客户端交互路径，单插件内，可逆）
- 宿主: OmniMux Dev 2.0.10 / dsh `0.2.1-rc.3`
- base: `origin/main` @ `8dcf0424f`

## 1. 目标与用户故事

新会话首页「探索模板」专区里，点任意卡片都应该把这张卡「装进输入框」：素材挂进附件卡槽、输入框预填一句指令、输入框吸底就位。

现状：一级 Tab 切到 **资产库 / 灵感库 / 商品库 / 爆款趋势** 后点卡片，输入框毫无反应（既不预填，卡槽也空）；精选货架的模板卡片同样失效。技能卡片、AI 应用卡片正常。

## 2. 根因

`ExploreTemplatesSection` 交给 `onApplyTemplate` 的是**命令信封** `{ template, prompt, title, card }`，信封本身没有 `id`。

`SessionGuide.handleUnifiedCardApply` 把这个信封原样传给 `dock(payload, …)`，而 `useComposerDocking.dock()` 的入口守卫要求 `item.id`：

```js
if (!item || !item.id || item.id === 'jump_dock_active') return false
```

`dock` 返回 `false`，`handleUnifiedCardApply` 把它当成「再次点击同一张卡片 = 反悔」，于是清空草稿、清空附件卡槽。用户看到的就是什么都没发生。

技能卡片自带 `id`（`{ id, skill, title, item }`），所以一直是好的——与用户实测「技能正常、应用正常、素材类不正常」一致。

## 3. 实测证据（jsdom 复现，`origin/main` @ `8dcf0424f`）

| 点击对象 | `setDraft` 调用 | 附件数 | 结论 |
|---|---|---|---|
| 资产库卡片 | 1（写入空串） | 0 | 走了反悔分支 |
| 灵感库卡片 | 1（写入空串） | 0 | 走了反悔分支 |
| 技能卡片 | 1 | 0 | 正常 |
| 精选模板卡片 | 0 | 0 | 未生效 |

## 4. 修复方案

`handleUnifiedCardApply` 交给 `dock()` 的必须是**真实卡片实体**（带 `id`），而不是命令信封。按 `attachmentItem` → `payload.card` → `payload.template` → `payload.trending` → `payload` 取第一个带 `id` 的候选。

`dock()` 的入口守卫保持不动：它仍然是拒收空载与 `jump_dock_active` 幽灵意图的唯一防线，本次只是让调用方交出合格载荷。

## 假设

根因是「命令信封被当成卡片实体交给吸底守卫」，不是素材数据源、不是 `adaptCardToAttachmentPayload` 的映射，也不是会话解析（`#3806` 之后 `getCurrentSessionId` 已有值）。若这条假设成立，则只需修正交给 `dock()` 的载荷身份，四类素材卡片的预填与附件挂载会同时恢复，且技能 / 应用卡片行为不变。

## 证伪方式

若修正载荷身份后，资产库 / 灵感库卡片点击仍然不预填、不挂附件，或出现「点一次没反应、点两次才生效」，则上述假设错误，需转去查 `attachCardToConversation` 的 `adaptCardToAttachmentPayload` 映射与 `dock` 的几何守卫。

可执行验证：
- `node --test src/explore/*.test.js src/explore/templates/*.test.js`（omnimux-inspiration 包内）
- 新增回归用例直接断言：点资产库 / 灵感库 / 商品库 / 爆款趋势 / 精选模板卡片后 `draft` 被写入非空指令、附件卡槽为 1。

## 5. 新用户基线

不依赖任何开发机私有状态：素材来自 `/omnimux/assets/library` 与 `/omnimux/inspiration/local` 两个产品内公开地址；未登录或无数据时列表为空，卡片不渲染，本改动不引入新的失败面。

## 6. 文档影响

无。行为对齐既有规格 `specs/2821-converged-tab-card-docking.spec.md`（6 大 Tab 统一走单一卡片动作网关），本次是让素材类卡片真正满足该规格，不新增契约。
